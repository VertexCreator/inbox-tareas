/**
 * Inbox → Tareas · Ingesta de Gmail (Google Apps Script)
 *
 * Corre cada 15 minutos en la cuenta de Gmail del administrador. Sin IA y sin costo:
 *  - Separa la basura (Promociones, Social, Foros y remitentes de tu lista de basura).
 *    Solo se cuenta para las métricas; nunca llega a Claude.
 *  - Limpia el resto (sin firmas, sin texto citado, sin links largos), lo recorta y lo deja
 *    en la cola de Supabase. Claude lee esas filas cortas en vez de los correos completos.
 *  - Los remitentes VIP nunca se consideran basura.
 *  - En correos con muchos destinatarios detecta si te mencionan (@Sofía Gómez), si estás en Para o en copia
 *    y qué marcas nombran, y recorta el párrafo donde te mencionan para que Claude lea lo que te piden a ti.
 *
 * Configuración: Propiedades del script (⚙ Configuración del proyecto → Propiedades del script)
 *   SUPABASE_URL   https://ddqpbbktcoznkifwyoiy.supabase.co
 *   SUPABASE_KEY   la publishable key (sb_publishable_...)
 *   INGEST_SECRET  la "clave del script" que muestra el dashboard → Configuración → Script de Gmail
 *
 * Para activarlo: ejecuta la función `instalar` una vez y acepta los permisos.
 */

const INTERVALO_MINUTOS = 15;
const MAX_HILOS = 300;
const LARGO_EXTRACTO = 500;
const LARGO_EXTRACTO_AUTOMATICO = 200;
const LOTE = 100;
const MAX_EXTRACTOS = 3;
const LARGO_EXTRACTO_MENCION = 400;

// Pestaña de Gmail → categoría con la que se registra como basura.
const CATEGORIAS_BASURA = {
  promotions: 'Promociones',
  social: 'Notificaciones',
  forums: 'Newsletters',
};

const REMITENTE_AUTOMATICO = /(no-?reply|do-?not-?reply|notificaciones?|notifications?|alertas?|alerts?|mailer-daemon|postmaster)/i;

/** Crea el disparador cada 15 minutos y hace una primera revisión. */
function instalar() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'revisarCorreos')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarCorreos').timeBased().everyMinutes(INTERVALO_MINUTOS).create();
  revisarCorreos();
}

/** Quita el disparador (para pausar la ingesta). */
function desinstalar() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'revisarCorreos')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

function revisarCorreos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return; // ya hay una revisión en curso

  try {
    const props = PropertiesService.getScriptProperties();
    const config = leerConfig_(props);
    const listas = rpc_(config, 'ingest_config', { p_secret: config.secret }) || {};
    const vip = normalizarLista_(listas.vip_senders);
    const basuraRemitentes = normalizarLista_(listas.junk_senders);
    const misAlias = normalizarLista_(listas.my_aliases).map(sinTildes_);
    const marcas = (listas.brands || []).map((b) => ({
      nombre: b.name,
      terminos: [b.name].concat(b.aliases || []).map((x) => sinTildes_(String(x).trim())).filter((x) => x && x[0] !== '@'),
      dominios: (b.aliases || []).map((x) => String(x).trim().toLowerCase()).filter((x) => x[0] === '@').map((x) => x.slice(1)),
    }));

    const ahora = Math.floor(Date.now() / 1000);
    const ultima = Number(props.getProperty('ULTIMA_REVISION')) || ahora - 24 * 3600;
    // Margen de 10 minutos: Gmail filtra `after:` por fecha de recepción y puede tardar en indexar.
    // La base deduplica por id, así que repetir un correo no es problema.
    const desde = ultima - 600;

    const categoriaPorHilo = {};
    Object.keys(CATEGORIAS_BASURA).forEach((cat) => {
      buscar_('in:inbox category:' + cat + ' after:' + desde).forEach((h) => {
        categoriaPorHilo[h.getId()] = CATEGORIAS_BASURA[cat];
      });
    });
    const hilosNotificaciones = {};
    buscar_('in:inbox category:updates after:' + desde).forEach((h) => {
      hilosNotificaciones[h.getId()] = true;
    });

    const yo = Session.getEffectiveUser().getEmail().toLowerCase();
    const salida = [];

    buscar_('in:inbox after:' + desde).forEach((hilo) => {
      const hiloId = hilo.getId();
      hilo.getMessages().forEach((m) => {
        if (m.getDate().getTime() / 1000 < desde) return;
        const de = parsearRemitente_(m.getFrom());
        if (de.email === yo) return; // mis propias respuestas

        const para = extraerCorreos_(m.getTo());
        const copia = extraerCorreos_(m.getCc());
        const destino = para.indexOf(yo) >= 0 ? 'para' : copia.indexOf(yo) >= 0 ? 'copia' : 'lista';
        const cuerpo = cuerpoNuevo_(m.getPlainBody());
        const asunto = m.getSubject() || '';
        const menciones = buscarMenciones_(cuerpo, misAlias, yo);
        const marcasHalladas = buscarMarcas_(asunto + '\n' + cuerpo, marcas, [de.email].concat(para, copia));
        const relevante = menciones.length > 0 || marcasHalladas.nombres.length > 0;

        const esVip = coincide_(de.email, vip);
        const esBasura = !esVip && !relevante && (Boolean(categoriaPorHilo[hiloId]) || coincide_(de.email, basuraRemitentes));
        const esAutomatico =
          Boolean(hilosNotificaciones[hiloId]) || REMITENTE_AUTOMATICO.test(de.email) || Boolean(m.getHeader('List-Unsubscribe'));

        const fila = {
          gmail_message_id: m.getId(),
          gmail_thread_id: hiloId,
          from_name: de.nombre,
          from_email: de.email,
          subject: asunto || '(sin asunto)',
          received_at: m.getDate().toISOString(),
          junk: esBasura,
        };
        if (esBasura) {
          fila.junk_category = categoriaPorHilo[hiloId] || 'Promociones';
        } else {
          fila.is_vip = esVip;
          fila.automatic = esAutomatico && !esVip && !relevante;
          fila.snippet = recortar_(cuerpo, fila.automatic ? LARGO_EXTRACTO_AUTOMATICO : LARGO_EXTRACTO);
          fila.to_count = para.length;
          fila.cc_count = copia.length;
          fila.addressed = destino;
          fila.mentioned = menciones.length > 0;
          fila.brands_mentioned = marcasHalladas.nombres;
          // Primero los párrafos donde te mencionan; si no hay, donde nombran tus marcas.
          fila.mention_excerpts = extractos_(cuerpo, menciones.length ? menciones : marcasHalladas.posiciones);
          fila.attachments = m.getAttachments({ includeInlineImages: false }).slice(0, 10).map((a) => a.getName());
        }
        salida.push(fila);
      });
    });

    let enCola = 0;
    let basura = 0;
    // Siempre se llama al menos una vez: así el dashboard sabe que el script sigue vivo.
    for (let i = 0; i === 0 || i < salida.length; i += LOTE) {
      const r = rpc_(config, 'enqueue_emails', { p_secret: config.secret, p_emails: salida.slice(i, i + LOTE) });
      enCola += r.en_cola;
      basura += r.basura;
    }

    props.setProperty('ULTIMA_REVISION', String(ahora));
    console.log('Revisados ' + salida.length + ' · a la cola ' + enCola + ' · basura ' + basura);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------

function leerConfig_(props) {
  const config = {
    url: (props.getProperty('SUPABASE_URL') || '').replace(/\/+$/, ''),
    key: props.getProperty('SUPABASE_KEY') || '',
    secret: props.getProperty('INGEST_SECRET') || '',
  };
  const faltan = ['url', 'key', 'secret'].filter((k) => !config[k]);
  if (faltan.length) {
    throw new Error('Faltan propiedades del script: SUPABASE_URL, SUPABASE_KEY e INGEST_SECRET (ver INSTALACION.md).');
  }
  return config;
}

function rpc_(config, fn, body) {
  const res = UrlFetchApp.fetch(config.url + '/rest/v1/rpc/' + fn, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: config.key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const texto = res.getContentText();
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase ' + fn + ' respondió ' + res.getResponseCode() + ': ' + texto);
  }
  return texto ? JSON.parse(texto) : null;
}

function buscar_(consulta) {
  const hilos = [];
  for (let inicio = 0; inicio < MAX_HILOS; inicio += 100) {
    const pagina = GmailApp.search(consulta, inicio, 100);
    hilos.push.apply(hilos, pagina);
    if (pagina.length < 100) break;
  }
  return hilos;
}

function parsearRemitente_(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  if (m) return { nombre: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
  const email = (from || '').trim().toLowerCase();
  return { nombre: email, email: email };
}

function normalizarLista_(lista) {
  return (lista || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
}

// "persona@empresa.com" coincide exacto; "@empresa.com" o "empresa.com" coincide con todo el dominio.
function coincide_(email, lista) {
  return lista.some((p) => {
    if (p.indexOf('@') > 0) return email === p;
    const dominio = p.replace(/^@/, '');
    return email.slice(-(dominio.length + 1)) === '@' + dominio || email.endsWith('.' + dominio);
  });
}

// Deja solo lo nuevo del mensaje: corta en el texto citado o la firma, quita links y espacios.
function cuerpoNuevo_(texto) {
  let t = (texto || '').replace(/\r/g, '');
  const cortes = [
    /^On .+wrote:\s*$/m,
    /^El .+escribi[óo]:\s*$/m,
    /^-{2,}\s*(Original Message|Mensaje original)\s*-{2,}/im,
    /^_{5,}/m,
    /^(De|From):\s.+$/m,
    /^--\s*$/m,
    /^(Enviado desde mi|Sent from my)\s/m,
  ];
  cortes.forEach((re) => {
    const i = t.search(re);
    if (i > 0) t = t.slice(0, i);
  });
  return t
    .split('\n')
    .filter((l) => !l.trim().startsWith('>'))
    .join('\n')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/<mailto:[^>]+>/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function recortar_(t, max) {
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function limpiar_(texto, max) {
  return recortar_(cuerpoNuevo_(texto), max);
}

// Minúsculas y sin tildes, conservando el largo (cada carácter sigue en su posición).
function sinTildes_(s) {
  return String(s || '')
    .split('')
    .map((c) => c.normalize('NFD')[0])
    .join('')
    .toLowerCase();
}

function escaparRegex_(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extraerCorreos_(lista) {
  return (String(lista || '').match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []).map((x) => x.toLowerCase());
}

// Posiciones donde te mencionan: "@Sofía Gómez", "+Sofía", tu correo, o tu nombre completo.
function buscarMenciones_(cuerpo, alias, miCorreo) {
  const t = sinTildes_(cuerpo);
  const pos = [];
  alias.forEach((a) => {
    const conArroba = new RegExp('[@+]\\s?' + escaparRegex_(a) + '(?![a-z])', 'g');
    let r;
    while ((r = conArroba.exec(t))) pos.push(r.index);
    if (a.indexOf(' ') > 0) {
      const completo = new RegExp('(^|[^a-z@+])' + escaparRegex_(a) + '(?![a-z])', 'g');
      while ((r = completo.exec(t))) pos.push(r.index + r[1].length);
    }
  });
  if (miCorreo) {
    let i = t.indexOf(miCorreo.toLowerCase());
    while (i >= 0) {
      pos.push(i);
      i = t.indexOf(miCorreo.toLowerCase(), i + 1);
    }
  }
  return pos.sort((a, b) => a - b);
}

// Marcas nombradas como palabra completa (para que "axe" no salte en "taxes") o por dominio de quien participa.
function buscarMarcas_(texto, marcas, correos) {
  const t = sinTildes_(texto);
  const nombres = [];
  const posiciones = [];
  marcas.forEach((m) => {
    let hallada = false;
    m.terminos.forEach((term) => {
      const re = new RegExp('(^|[^a-z0-9])' + escaparRegex_(term) + '(?![a-z0-9])', 'g');
      let r;
      while ((r = re.exec(t))) {
        hallada = true;
        posiciones.push(r.index + r[1].length);
      }
    });
    if (!hallada && m.dominios.some((d) => correos.some((c) => c.slice(-(d.length + 1)) === '@' + d || c.endsWith('.' + d)))) hallada = true;
    if (hallada) nombres.push(m.nombre);
  });
  return { nombres: nombres, posiciones: posiciones.sort((a, b) => a - b) };
}

// El párrafo alrededor de cada posición (sin repetir), hasta MAX_EXTRACTOS.
function extractos_(cuerpo, posiciones) {
  const vistos = {};
  const out = [];
  for (let k = 0; k < posiciones.length && out.length < MAX_EXTRACTOS; k++) {
    const p = posiciones[k];
    let ini = cuerpo.lastIndexOf('\n', p) + 1;
    let fin = cuerpo.indexOf('\n', p);
    if (fin < 0) fin = cuerpo.length;
    if (fin - ini < 80) {
      const sig = cuerpo.indexOf('\n', fin + 1);
      fin = sig < 0 ? cuerpo.length : sig;
    }
    if (fin - ini > LARGO_EXTRACTO_MENCION) {
      ini = Math.max(ini, p - Math.floor(LARGO_EXTRACTO_MENCION / 3));
      fin = Math.min(fin, ini + LARGO_EXTRACTO_MENCION);
    }
    if (vistos[ini]) continue;
    vistos[ini] = true;
    out.push(cuerpo.slice(ini, fin).replace(/\s+/g, ' ').trim());
  }
  return out.join(' … ');
}
