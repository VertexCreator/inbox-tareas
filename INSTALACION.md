# Instalación en la computadora del agente

Guía para dejar funcionando el agente en la computadora nueva (Mac). Usa la **misma cuenta de Claude**.

El dashboard, los datos y el login ya están en la nube (Vercel + Supabase): el equipo solo necesita
la URL. Esta guía es para la computadora que va a leer el Gmail de lunes a viernes a las 8:00, 13:00 y 18:00,
y los domingos a las 21:00.

---

## Antes de empezar (desde cualquier computadora)

- [ ] Dashboard desplegado en Vercel y su URL puesta en Supabase → *Authentication → URL Configuration → Site URL*.
- [ ] En Supabase está desactivado *Allow new users to sign up* y existe tu usuario `sgomez@dimassicorp.com`.
- [ ] Puedes entrar al dashboard con tu correo y contraseña.

---

## Paso 1 · Acceso al repositorio privado

El repositorio `VertexCreator/inbox-tareas` es **privado**: el link solo funciona para cuentas de
GitHub con acceso.

- **Si en la computadora nueva usarás la cuenta VertexCreator:** no hay que hacer nada aquí.
- **Si usarás otra cuenta de GitHub:** invítala primero.
  1. En [github.com/VertexCreator/inbox-tareas/settings/access](https://github.com/VertexCreator/inbox-tareas/settings/access)
     → **Add people** → escribe el usuario o correo de esa cuenta → rol **Write**.
  2. En la otra cuenta, acepta la invitación (llega por correo o en github.com/notifications).

## Paso 2 · Descargar el proyecto

Elige **una** de las dos formas.

### Forma A · Con Terminal (recomendada, permite actualizar con un comando)
Abre **Terminal** y pega estos comandos uno por uno:

1. Instala Homebrew (si no lo tienes; te pedirá la contraseña de la Mac):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   Al terminar, ejecuta los dos comandos que Homebrew muestra en "Next steps" para agregarlo al PATH.
2. Instala la herramienta de GitHub:
   ```bash
   brew install gh
   ```
3. Inicia sesión en GitHub (elige *GitHub.com* → *HTTPS* → *Login with a web browser*):
   ```bash
   gh auth login
   ```
4. Descarga el proyecto:
   ```bash
   gh repo clone VertexCreator/inbox-tareas ~/inbox-tareas
   ```

Para traer cambios futuros:
```bash
cd ~/inbox-tareas && git pull
```

### Forma B · Sin Terminal
1. En el navegador, inicia sesión en GitHub con la cuenta que tiene acceso.
2. Abre [github.com/VertexCreator/inbox-tareas](https://github.com/VertexCreator/inbox-tareas) → botón verde **Code** → **Download ZIP**.
3. Descomprime y renombra la carpeta a `inbox-tareas`. Muévela a tu carpeta de usuario (`~/inbox-tareas`).

Con esta forma, para actualizar hay que volver a descargar el ZIP.

> El agente no necesita estos archivos para funcionar: todo lo que usa está en Supabase. Sirven para
> tener las instrucciones a mano y para que Claude cree las tareas programadas.

## Paso 3 · Script de Gmail (Apps Script)
Revisa Gmail cada 15 minutos, filtra la basura y deja el resto limpio en Supabase, para que Claude gaste
muchos menos tokens. Corre en la nube de Google: se instala una vez, desde el navegador de cualquier
computadora, y sigue funcionando aunque la computadora esté apagada.

1. Entra a [script.google.com](https://script.google.com) con **sgomez@dimassicorp.com** → **Proyecto nuevo**.
   Ponle de nombre `Inbox Tareas · Ingesta`.
2. Borra el contenido de `Código.gs` y pega **todo** el contenido de [`apps-script/Code.gs`](apps-script/Code.gs). Guarda (⌘S).
3. ⚙ **Configuración del proyecto** → **Propiedades del script** → **Agregar propiedad del script**, tres veces:

   | Propiedad | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://ddqpbbktcoznkifwyoiy.supabase.co` |
   | `SUPABASE_KEY` | la publishable key (`sb_publishable_…`, la misma de Vercel) |
   | `INGEST_SECRET` | dashboard → **Configuración → Script de Gmail → Copiar** |

   Guarda las propiedades.
4. Vuelve al editor (`< >`), elige la función **`instalar`** en el menú de arriba y pulsa **Ejecutar**.
5. Google pide permisos: **Revisar permisos** → tu cuenta → si aparece "Google no verificó esta app",
   **Configuración avanzada → Ir a Inbox Tareas · Ingesta** → **Permitir**. Es tu propio script; pide
   leer Gmail y conectarse a Supabase.
6. En el **Registro de ejecución** debe aparecer `Revisados N · a la cola X · basura Y`.
   En el dashboard → **Configuración → Script de Gmail** aparece "Último envío hace unos segundos".

`instalar` crea tres disparadores: la revisión del inbox cada 15 minutos, la búsqueda de correos para tareas
manuales cada 5 minutos y el reenvío del correo a la persona asignada cada 5 minutos ("Asignación TeamFlow - …").
Si Google vuelve a pedir permisos (ahora el script también envía correos), acéptalos.

**Cuando el script se actualice** (cambia `apps-script/Code.gs` en el repo): en script.google.com abre el
proyecto, reemplaza todo `Código.gs` con la versión nueva, guarda y ejecuta `instalar` otra vez. Las
propiedades del script se mantienen.

Para pausarlo: ejecuta la función `desinstalar`. Si regeneras la clave en el dashboard, actualiza
`INGEST_SECRET` en las propiedades del script.

> La primera vez revisa las últimas 24 horas; después, solo lo nuevo. Los remitentes VIP y de basura se
> editan en el dashboard → **Configuración → Script de Gmail**.

## Paso 4 · App de Claude y conectores
1. Instala la app de escritorio de Claude desde [claude.com/download](https://claude.com/download) y entra con **la misma cuenta**.
2. Ve a **Ajustes → Conectores** y revisa que estén **Gmail** y **Supabase**.
   - Van con la cuenta, así que deberían aparecer. Si alguno falta o pide reconectar, conéctalo.
   - En Gmail, la cuenta conectada debe ser **sgomez@dimassicorp.com**.

## Paso 5 · Crear las tareas programadas
Las tareas programadas se guardan en cada computadora, por eso se crean aquí. Son tres:

| Tarea | Horario | Prompt |
|---|---|---|
| Análisis del inbox | `0 8,13,18 * * 1-5` → lunes a viernes, 8:00, 13:00 y 18:00 | `agent/analisis-inbox.md` |
| Resumen del fin de semana | `0 21 * * 0` → domingos, 21:00 | `agent/resumen-fin-de-semana.md` |
| Planificador | `*/30 8-18 * * 1-5` → cada 30 min, lunes a viernes de 8:00 a 18:30 | `agent/planificador.md` |

El Planificador afina las recomendaciones de reparto que pides con **Planificar** en Listas. También atiende los análisis de correos que
pide el equipo desde **Mi correo** (solo personas que habilites en Equipo). Si no hay
nada que afinar termina en una consulta, así que casi no consume.

Los horarios son en la hora de esa computadora.

1. En la app de Claude abre la pestaña **Code** y elige la carpeta `inbox-tareas`.
2. Escribe exactamente:
   > Lee INSTALACION.md, agent/analisis-inbox.md, agent/resumen-fin-de-semana.md y agent/planificador.md. Crea o actualiza tres tareas programadas: "Análisis del inbox" con el horario 0 8,13,18 * * 1-5 y como prompt el contenido completo de agent/analisis-inbox.md; "Resumen del fin de semana" con el horario 0 21 * * 0 y como prompt el contenido completo de agent/resumen-fin-de-semana.md; y "Planificador" con el horario */30 8-18 * * 1-5 y como prompt el contenido completo de agent/planificador.md. Si ya existen, actualiza su prompt y horario en vez de duplicarlas. Muéstrame la lista al terminar. Después ejecuta una vez solo "Análisis del inbox" para probar.
3. Revisa que las tres tareas queden con el nombre, horario y prompt de la tabla.

**Importante:** la tarea corre solo con la app de Claude abierta. Si la computadora está apagada o la
app cerrada a esa hora, corre al volver a abrirla. Deja esa computadora encendida en horario laboral y
sin suspenderse (*Ajustes del Sistema → Batería/Energía*).

## Paso 6 · Comprobar que todo funciona
- [ ] En **Configuración → Script de Gmail** el último envío tiene menos de 15 minutos.
- [ ] Las tres tareas aparecen en la lista de tareas programadas y la prueba de "Análisis del inbox" terminó sin errores.
- [ ] En el dashboard → **Hoy** aparece "Último análisis: …" con el resumen.
- [ ] Hay correos en "Correos por responder" y, si correspondía, sugerencias de reparto.
- [ ] En Gmail hay borradores para los correos P1 (nunca se envía nada solo).
- [ ] En **Configuración → Prioridades y resumen** están tus temas.

---

## Solo si vas a modificar el dashboard en esa computadora
```bash
brew install node
```
```bash
cd ~/inbox-tareas/web && cp .env.example .env.local
```
Completa `web/.env.local` con los valores del README §4, y luego:
```bash
npm install && npm run dev
```
Cada `git push` a `main` vuelve a publicar el dashboard en Vercel.

---

## Qué vive dónde

| Cosa | Se mueve sola | Hay que hacerla en la computadora nueva |
|---|---|---|
| Tareas, equipo, reglas, historial, prioridades, usuarios | ✅ Supabase | |
| Dashboard | ✅ Vercel | |
| Código | ✅ GitHub | Descargarlo (paso 2) |
| Script de Gmail (Apps Script) | ✅ nube de Google | Se instala una vez (paso 3) |
| Conectores Gmail y Supabase | ✅ cuenta de Claude | Reconectar si lo pide |
| Tareas programadas (análisis, fin de semana, planificador) | | ✅ Crearlas (paso 5) |
| `web/.env.local` | | Solo si se desarrolla ahí |

---

## Correo del equipo (cada persona, desde su computadora)

Cada miembro conecta su propio Gmail desde el dashboard: **Mi correo → Copiar el script**, lo pega en un proyecto
nuevo de script.google.com con su cuenta y ejecuta `instalar`. No necesita Claude ni configurar nada más.

- Si la cuenta de Dimassi no deja crear proyectos o ejecutar scripts, TI debe permitir Apps Script para el dominio.
- El script de los miembros se genera a partir de `apps-script/Code.gs`. Si cambias ese archivo, corre
  `python3 scripts/construir_mi_correo.py` antes de publicar; las personas copian la versión nueva desde Mi correo.
