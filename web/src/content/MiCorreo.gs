/**
 * Teamflow · Mi correo (Google Apps Script) — script personal de __NOMBRE__
 *
 * Revisa tu Gmail cada 10 minutos y deja tus correos en tu bandeja de Teamflow, ya clasificados en P1/P2/P3
 * con reglas (sin IA): si te escriben a ti, si te mencionan, si piden algo y si hay plazo. Lo que corrijas en el
 * dashboard se aprende. La basura (Promociones, Social, Foros) se separa sola.
 * Cada 5 minutos, si asignaste una tarea desde uno de tus correos, se lo reenvía a la persona asignada
 * ("Asignación TeamFlow - <asunto>", con todo el texto y los adjuntos).
 *
 * Instalar: pega todo este código en un proyecto nuevo de script.google.com, guarda, elige la función
 * `instalar` y pulsa Ejecutar. Acepta los permisos (es tu propio script: lee tu Gmail y envía los reenvíos).
 * Para pausarlo: ejecuta `desinstalar`. La clave de abajo es personal: no la compartas.
 *
 * Generado por scripts/construir_mi_correo.py a partir de apps-script/Code.gs: no editar a mano.
 */

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_KEY = '__SUPABASE_KEY__';
const TEAMFLOW_TOKEN = '__TEAMFLOW_TOKEN__';

const INTERVALO_MINUTOS = 10;

/** Crea los disparadores (tu correo cada 10 min; reenvíos cada 5 min) y corre todo una vez. */
function instalar() {
  desinstalar();
  ScriptApp.newTrigger('revisarCorreos').timeBased().everyMinutes(INTERVALO_MINUTOS).create();
  ScriptApp.newTrigger('reenviarAsignaciones').timeBased().everyMinutes(5).create();
  revisarCorreos();
  reenviarAsignaciones();
}

/** Quita los disparadores (para pausar el script). */
function desinstalar() {
  ScriptApp.getProjectTriggers()
    .filter((t) => FUNCIONES_PROGRAMADAS.indexOf(t.getHandlerFunction()) >= 0)
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

function leerConfig_() {
  return { url: SUPABASE_URL.replace(/\/+$/, ''), key: SUPABASE_KEY, token: TEAMFLOW_TOKEN };
}

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

const FUNCIONES_PROGRAMADAS = ['revisarCorreos', 'reenviarAsignaciones'];
const ASUNTO_ASIGNACION = 'Asignación TeamFlow - ';
const MAX_ADJUNTOS_BYTES = 24 * 1024 * 1024; // Gmail acepta hasta 25 MB por correo
const MAX_TEXTO_TAREA = 60000;

/**
 * Reenvía a la persona asignada el correo de cada iniciativa recién asignada y guarda su texto en Teamflow.
 * Asunto: "Asignación TeamFlow - <asunto original>". Va todo el texto del correo y todos sus adjuntos
 * (hasta el límite de 25 MB de Gmail; si no caben, el correo dice cuáles quedaron fuera).
 */
function reenviarAsignaciones() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return;
  try {
    const config = leerConfig_(PropertiesService.getScriptProperties());
    const pendientes = rpc_(config, 'member_pending_forwards', { p_token: config.token }) || [];
    if (!pendientes.length) return;
    const yo = Session.getEffectiveUser().getEmail().toLowerCase();

    pendientes.forEach((p) => {
      let resultado;
      try {
        resultado = reenviarUno_(p, yo);
      } catch (e) {
        resultado = { status: 'error', detail: String((e && e.message) || e) };
      }
      rpc_(config, 'member_submit_forward', { p_token: config.token, p_id: p.id, p: resultado });
      console.log('Asignación "' + p.task_title + '" → ' + p.to_name + ': ' + resultado.status + (resultado.detail ? ' (' + resultado.detail + ')' : ''));
    });
  } finally {
    lock.releaseLock();
  }
}

function reenviarUno_(p, yo) {
  const m = buscarMensaje_(p, yo);
  if (!m) return { status: 'error', detail: 'No encontré el correo en Gmail (¿se borró?)' };

  const archivos = m.getAttachments({ includeInlineImages: false, includeAttachments: true });
  const imagenes = m.getAttachments({ includeInlineImages: true, includeAttachments: false });
  const contenido = contenidoCorreo_(m, archivos, imagenes);

  if (!p.forward) return { status: 'omitido', detail: 'Reenvío desactivado en Configuración', content: contenido };
  const para = String(p.to_email || '').trim().toLowerCase();
  if (!para) return { status: 'error', detail: 'La persona no tiene correo en Equipo', content: contenido };
  if (para === yo) return { status: 'omitido', detail: 'Asignada a ti: el correo ya está en tu bandeja', content: contenido };

  // Todos los adjuntos (también las imágenes del cuerpo) mientras quepan en el límite de Gmail.
  const adjuntos = [];
  const fuera = [];
  let total = 0;
  archivos.concat(imagenes).forEach((a) => {
    const tam = a.getSize();
    if (total + tam <= MAX_ADJUNTOS_BYTES) {
      adjuntos.push(a.copyBlob().setName(a.getName()));
      total += tam;
    } else {
      fuera.push(a.getName());
    }
  });

  GmailApp.sendEmail(para, ASUNTO_ASIGNACION + (m.getSubject() || '(sin asunto)'), textoReenvio_(p, m, fuera), {
    htmlBody: htmlReenvio_(p, m, fuera),
    attachments: adjuntos,
  });
  return {
    status: 'enviado',
    detail: fuera.length ? 'Sin adjuntar por tamaño: ' + fuera.join(', ') : null,
    content: contenido,
  };
}

// El mensaje vinculado o, si ya no existe (por ejemplo, era un borrador que luego se envió), el último
// mensaje enviado de su hilo: de otra persona si lo hay; si todos son tuyos, el más reciente.
function buscarMensaje_(p, yo) {
  try {
    const m = GmailApp.getMessageById(p.gmail_message_id);
    if (m && !m.isDraft()) return m;
  } catch (e) {
    // "Not found": el id ya no existe. Se busca por el hilo.
  }
  if (!p.gmail_thread_id) return null;
  let hilo;
  try {
    hilo = GmailApp.getThreadById(p.gmail_thread_id);
  } catch (e) {
    return null;
  }
  if (!hilo) return null;
  const enviados = hilo.getMessages().filter((x) => !x.isDraft());
  if (!enviados.length) return null;
  for (let i = enviados.length - 1; i >= 0; i--) {
    if (parsearRemitente_(enviados[i].getFrom()).email !== yo) return enviados[i];
  }
  return enviados[enviados.length - 1];
}

// Lo que se guarda en la iniciativa: encabezados, lista de adjuntos y el texto completo, ordenado.
function contenidoCorreo_(m, archivos, imagenes) {
  const de = parsearRemitente_(m.getFrom());
  return {
    from_name: de.nombre,
    from_email: de.email,
    to: m.getTo() || '',
    cc: m.getCc() || '',
    subject: m.getSubject() || '(sin asunto)',
    date: m.getDate().toISOString(),
    body_text: formatearTexto_(m.getPlainBody()),
    attachments: archivos
      .map((a) => ({ name: a.getName(), size: a.getSize(), type: a.getContentType(), inline: false }))
      .concat(imagenes.map((a) => ({ name: a.getName(), size: a.getSize(), type: a.getContentType(), inline: true }))),
  };
}

// Texto plano legible: saltos de línea uniformes, sin espacios colgando, sin más de una línea en blanco
// seguida y con los enlaces como "texto (url)".
function formatearTexto_(texto) {
  return String(texto || '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]*<(https?:\/\/[^>\s]+)>/g, ' ($1)')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXTO_TAREA);
}

const MESES_ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga_(d) {
  const tz = Session.getScriptTimeZone();
  const n = (f) => Number(Utilities.formatDate(d, tz, f));
  return n('d') + ' de ' + MESES_[n('M') - 1] + ' de ' + n('yyyy') + ', ' + Utilities.formatDate(d, tz, 'HH:mm');
}

function fechaCorta_(iso) {
  if (!iso) return null;
  const p = String(iso).split('-');
  return Number(p[2]) + ' de ' + MESES_[Number(p[1]) - 1];
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function enlaceTarea_(p) {
  if (!p.dashboard_url) return null;
  return p.dashboard_url.replace(/\/+$/, '') + '/mis-tareas' + (p.task_id ? '?abrir=' + encodeURIComponent(p.task_id) : '');
}

function htmlReenvio_(p, m, fuera) {
  const datos = [
    p.brands ? 'Marca: <b>' + esc_(p.brands) + '</b>' : null,
    p.priority ? 'Prioridad: <b>' + esc_(p.priority) + '</b>' : null,
    p.due_date ? 'Fecha límite: <b>' + esc_(fechaCorta_(p.due_date)) + '</b>' : null,
  ].filter(Boolean);
  const subtareas = (p.subtasks || [])
    .map((s) => '<li>' + esc_(s.title) + (s.assignee ? ' · ' + esc_(s.assignee) : '') + (s.due_date ? ' · ' + esc_(fechaCorta_(s.due_date)) : '') + '</li>')
    .join('');
  const enlace = enlaceTarea_(p);
  const de = parsearRemitente_(m.getFrom());
  // Las imágenes del cuerpo van como adjuntos: en el texto se marca dónde estaban.
  const cuerpo = (m.getBody() || '').replace(/<img[^>]+src=["']?cid:[^"'\s>]+["']?[^>]*>/gi, '<span style="color:#78716c">[imagen adjunta]</span>');

  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1c1917">' +
    '<div style="max-width:640px;border:1px solid #d6e4f2;border-left:4px solid #0066B3;border-radius:8px;padding:14px 18px;margin:0 0 18px;background:#f5f9fd">' +
    '<div style="font-size:11px;font-weight:bold;letter-spacing:.6px;color:#0066B3">TEAMFLOW · NUEVA ASIGNACIÓN</div>' +
    '<div style="font-size:17px;font-weight:bold;margin:6px 0 4px">Hola ' + esc_((p.to_name || '').split(' ')[0]) + ', te asignaron: ' + esc_(p.task_title) + '</div>' +
    (datos.length ? '<div style="color:#44403c">' + datos.join(' &nbsp;·&nbsp; ') + '</div>' : '') +
    (p.task_description ? '<div style="margin-top:8px;white-space:pre-wrap">' + esc_(p.task_description) + '</div>' : '') +
    (subtareas ? '<div style="margin-top:8px;color:#44403c">Subtareas:</div><ul style="margin:4px 0 0;padding-left:20px">' + subtareas + '</ul>' : '') +
    (enlace ? '<div style="margin-top:12px"><a href="' + esc_(enlace) + '" style="background:#0066B3;color:#fff;text-decoration:none;padding:7px 14px;border-radius:6px;display:inline-block">Ver en TeamFlow</a></div>' : '') +
    (fuera.length ? '<div style="margin-top:10px;color:#b45309">No cupieron por tamaño (búscalos en el correo original): ' + esc_(fuera.join(', ')) + '</div>' : '') +
    '</div>' +
    '<div style="color:#57534e;font-size:13px">---------- Mensaje reenviado ----------<br>' +
    'De: <b>' + esc_(de.nombre || de.email) + '</b> &lt;' + esc_(de.email) + '&gt;<br>' +
    'Fecha: ' + esc_(fechaLarga_(m.getDate())) + '<br>' +
    'Asunto: ' + esc_(m.getSubject() || '(sin asunto)') + '<br>' +
    'Para: ' + esc_(m.getTo() || '') + '<br>' +
    (m.getCc() ? 'CC: ' + esc_(m.getCc()) + '<br>' : '') +
    '</div><br>' +
    cuerpo +
    '</div>'
  );
}

function textoReenvio_(p, m, fuera) {
  const enlace = enlaceTarea_(p);
  const lineas = [
    'TEAMFLOW · NUEVA ASIGNACIÓN',
    'Te asignaron: ' + p.task_title,
    [p.brands ? 'Marca: ' + p.brands : null, p.priority ? 'Prioridad: ' + p.priority : null, p.due_date ? 'Fecha límite: ' + fechaCorta_(p.due_date) : null]
      .filter(Boolean)
      .join(' · '),
    p.task_description || null,
    enlace ? 'Ver en TeamFlow: ' + enlace : null,
    fuera.length ? 'No cupieron por tamaño: ' + fuera.join(', ') : null,
    '',
    '---------- Mensaje reenviado ----------',
    'De: ' + m.getFrom(),
    'Fecha: ' + fechaLarga_(m.getDate()),
    'Asunto: ' + (m.getSubject() || '(sin asunto)'),
    'Para: ' + (m.getTo() || ''),
    m.getCc() ? 'CC: ' + m.getCc() : null,
    '',
    m.getPlainBody() || '',
  ];
  return lineas.filter((l) => l !== null).join('\n');
}

function revisarCorreos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return; // ya hay una revisión en curso

  try {
    const props = PropertiesService.getScriptProperties();
    const config = leerConfig_(props);
    const listas = rpc_(config, 'member_ingest_config', { p_token: config.token }) || {};
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
        const marcasHalladas = buscarMarcas_(asunto, cuerpo, marcas, [de.email].concat(para, copia));
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
          fila.body = recortar_(cuerpo, 6000);
          fila.to_count = para.length;
          fila.cc_count = copia.length;
          fila.addressed = destino;
          fila.mentioned = menciones.length > 0;
          fila.brands_mentioned = marcasHalladas.nombres;
          // Primero los párrafos donde te mencionan; si no hay, donde nombran tus marcas.
          fila.mention_excerpts = extractos_(cuerpo, menciones.length ? menciones : marcasHalladas.posiciones);
          // Un párrafo por marca: Claude ve si las marcas comparten una iniciativa (multimarca) o piden cosas distintas.
          if (marcasHalladas.nombres.length > 1) fila.brand_excerpts = extractosPorMarca_(cuerpo, marcasHalladas);
          fila.attachments = m.getAttachments({ includeInlineImages: false }).slice(0, 10).map((a) => a.getName());
        }
        salida.push(fila);
      });
    });

    let enCola = 0;
    let basura = 0;
    // Siempre se llama al menos una vez: así el dashboard sabe que el script sigue vivo.
    for (let i = 0; i === 0 || i < salida.length; i += LOTE) {
      const r = rpc_(config, 'member_enqueue_emails', { p_token: config.token, p_emails: salida.slice(i, i + LOTE) });
      enCola += r.nuevos;
      basura += r.basura;
    }

    props.setProperty('ULTIMA_REVISION', String(ahora));
    console.log('Revisados ' + salida.length + ' · nuevos en Teamflow ' + enCola + ' · basura ' + basura);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------

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

// Marcas nombradas como palabra completa (para que "axe" no salte en "taxes") en el asunto o el cuerpo,
// o por dominio de quien participa. Las posiciones son del cuerpo, para recortar sus párrafos.
function buscarMarcas_(asunto, cuerpo, marcas, correos) {
  const ta = sinTildes_(asunto);
  const t = sinTildes_(cuerpo);
  const nombres = [];
  const posiciones = [];
  const porMarca = {};
  marcas.forEach((m) => {
    let hallada = false;
    const mias = [];
    m.terminos.forEach((term) => {
      const patron = '(^|[^a-z0-9])' + escaparRegex_(term) + '(?![a-z0-9])';
      if (new RegExp(patron).test(ta)) hallada = true;
      const re = new RegExp(patron, 'g');
      let r;
      while ((r = re.exec(t))) {
        hallada = true;
        mias.push(r.index + r[1].length);
      }
    });
    if (!hallada && m.dominios.some((d) => correos.some((c) => c.slice(-(d.length + 1)) === '@' + d || c.endsWith('.' + d)))) hallada = true;
    if (hallada) {
      nombres.push(m.nombre);
      porMarca[m.nombre] = mias.sort((a, b) => a - b);
      Array.prototype.push.apply(posiciones, mias);
    }
  });
  return { nombres: nombres, posiciones: posiciones.sort((a, b) => a - b), porMarca: porMarca };
}

// { "Vaseline": "párrafo…", "Axe": "párrafo…" }. Si la marca solo aparece en el asunto o por dominio, lo dice.
function extractosPorMarca_(cuerpo, halladas) {
  const out = {};
  halladas.nombres.forEach((n) => {
    const pos = halladas.porMarca[n] || [];
    out[n] = pos.length ? extractos_(cuerpo, pos.slice(0, 2)) : '(solo en el asunto o por el dominio de alguien en copia)';
  });
  return out;
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
