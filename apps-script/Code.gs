/**
 * Inbox → Tareas · Ingesta de Gmail (Google Apps Script)
 *
 * Corre cada 15 minutos en la cuenta de Gmail del administrador. Sin IA y sin costo:
 *  - Separa la basura (Promociones, Social, Foros y remitentes de tu lista de basura).
 *    Solo se cuenta para las métricas; nunca llega a Claude.
 *  - Limpia el resto (sin firmas, sin texto citado, sin links largos), lo recorta y lo deja
 *    en la cola de Supabase. Claude lee esas filas cortas en vez de los correos completos.
 *  - Los remitentes VIP nunca se consideran basura.
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

        const esVip = coincide_(de.email, vip);
        const esBasura = !esVip && (Boolean(categoriaPorHilo[hiloId]) || coincide_(de.email, basuraRemitentes));
        const esAutomatico =
          Boolean(hilosNotificaciones[hiloId]) || REMITENTE_AUTOMATICO.test(de.email) || Boolean(m.getHeader('List-Unsubscribe'));

        const fila = {
          gmail_message_id: m.getId(),
          gmail_thread_id: hiloId,
          from_name: de.nombre,
          from_email: de.email,
          subject: m.getSubject() || '(sin asunto)',
          received_at: m.getDate().toISOString(),
          junk: esBasura,
        };
        if (esBasura) {
          fila.junk_category = categoriaPorHilo[hiloId] || 'Promociones';
        } else {
          fila.is_vip = esVip;
          fila.automatic = esAutomatico && !esVip;
          fila.snippet = limpiar_(m.getPlainBody(), fila.automatic ? LARGO_EXTRACTO_AUTOMATICO : LARGO_EXTRACTO);
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
function limpiar_(texto, max) {
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
  t = t
    .split('\n')
    .filter((l) => !l.trim().startsWith('>'))
    .join('\n')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}
