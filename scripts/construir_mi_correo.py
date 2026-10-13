"""Genera el script de Gmail para los miembros del equipo (web/src/content/MiCorreo.gs) a partir de
apps-script/Code.gs, el script de la gerente. Así los dos comparten la limpieza, menciones, marcas y reenvío.

Uso: python3 scripts/construir_mi_correo.py   (después de cambiar apps-script/Code.gs)
"""
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'apps-script' / 'Code.gs'
DESTINO = RAIZ / 'web' / 'src' / 'content' / 'MiCorreo.gs'

ENCABEZADO = '''/**
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
'''

INSTALAR = '''/** Crea los disparadores (tu correo cada 10 min; reenvíos cada 5 min) y corre todo una vez. */
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
'''

CONFIG = '''function leerConfig_() {
  return { url: SUPABASE_URL.replace(/\\/+$/, ''), key: SUPABASE_KEY, token: TEAMFLOW_TOKEN };
}
'''


def sin_funcion(src, nombre):
    """Quita una función de primer nivel (y el comentario /** */ que la precede)."""
    m = re.search(r'(\n/\*\*(?:(?!\*/).)*\*/)?\nfunction ' + re.escape(nombre) + r'\(', src, re.S)
    if not m:
        raise SystemExit(f'No encontré la función {nombre}')
    fin = src.index('\n}\n', m.end()) + 3
    return src[: m.start()] + '\n' + src[fin:]


def reemplazar(src, a, b, veces=None):
    n = src.count(a)
    if n == 0 or (veces is not None and n != veces):
        raise SystemExit(f'Esperaba {veces or "al menos 1"} de {a!r} y hay {n}')
    return src.replace(a, b)


src = ORIGEN.read_text()
cuerpo = src[src.index('const MAX_HILOS'):]
cuerpo = re.sub(r'\nconst INTERVALO_MINUTOS = \d+;\n', '\n', cuerpo)
for f in ('instalar', 'desinstalar', 'buscarCorreosParaTareas', 'leerConfig_'):
    cuerpo = sin_funcion(cuerpo, f)
cuerpo = reemplazar(cuerpo, "const FUNCIONES_PROGRAMADAS = ['revisarCorreos', 'buscarCorreosParaTareas', 'reenviarAsignaciones'];",
                    "const FUNCIONES_PROGRAMADAS = ['revisarCorreos', 'reenviarAsignaciones'];", 1)
cuerpo = reemplazar(cuerpo, "'ingest_config'", "'member_ingest_config'", 1)
cuerpo = reemplazar(cuerpo, "'enqueue_emails'", "'member_enqueue_emails'", 1)
cuerpo = reemplazar(cuerpo, "'pending_email_forwards'", "'member_pending_forwards'", 1)
cuerpo = reemplazar(cuerpo, "'submit_email_forward'", "'member_submit_forward'", 1)
cuerpo = reemplazar(cuerpo, 'p_secret: config.secret', 'p_token: config.token')
cuerpo = reemplazar(cuerpo, 'enCola += r.en_cola;', 'enCola += r.nuevos;', 1)
cuerpo = reemplazar(cuerpo, "console.log('Revisados ' + salida.length + ' · a la cola ' + enCola + ' · basura ' + basura);",
                    "console.log('Revisados ' + salida.length + ' · nuevos en Teamflow ' + enCola + ' · basura ' + basura);", 1)
# El dashboard muestra el correo a su dueño: se envía el cuerpo limpio (hasta 6000 caracteres).
cuerpo = reemplazar(cuerpo, "          fila.to_count = para.length;\n",
                    "          fila.body = recortar_(cuerpo, 6000);\n          fila.to_count = para.length;\n", 1)
cuerpo = reemplazar(cuerpo, 'const MAX_RESULTADOS_BUSQUEDA = 10;\n', '', 1)
cuerpo = re.sub(r'\n{3,}', '\n\n', cuerpo)
if 'buscarCorreosParaTareas' in cuerpo or 'p_secret' in cuerpo or 'INGEST_SECRET' in cuerpo.replace('INGEST_SECRET  la', ''):
    raise SystemExit('Quedó algo del script de la gerente')

DESTINO.write_text(ENCABEZADO + '\n' + INSTALAR + '\n' + CONFIG + '\n' + cuerpo)
print(f'OK → {DESTINO.relative_to(RAIZ)} ({len(DESTINO.read_text().splitlines())} líneas)')
