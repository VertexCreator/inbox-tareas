# Instalación en la computadora del agente

Guía para dejar funcionando el agente en la computadora nueva (Mac). Usa la **misma cuenta de Claude**.

El dashboard, los datos y el login ya están en la nube (Vercel + Supabase): el equipo solo necesita
la URL. Esta guía es para la computadora que va a leer el Gmail a las 8:00, 13:00 y 18:00.

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
> tener las instrucciones a mano y para que Claude cree la tarea programada.

## Paso 3 · App de Claude y conectores
1. Instala la app de escritorio de Claude desde [claude.com/download](https://claude.com/download) y entra con **la misma cuenta**.
2. Ve a **Ajustes → Conectores** y revisa que estén **Gmail** y **Supabase**.
   - Van con la cuenta, así que deberían aparecer. Si alguno falta o pide reconectar, conéctalo.
   - En Gmail, la cuenta conectada debe ser **sgomez@dimassicorp.com**.

## Paso 4 · Crear la tarea programada
Las tareas programadas se guardan en cada computadora, por eso se crean aquí.

1. En la app de Claude abre la pestaña **Code** y elige la carpeta `inbox-tareas`.
2. Escribe exactamente:
   > Lee INSTALACION.md y agent/analisis-inbox.md. Crea la tarea programada "Análisis del inbox" con el horario 0 8,13,18 * * * y como prompt el contenido completo de agent/analisis-inbox.md. Después ejecútala una vez para probar.
3. Revisa que la tarea quede así:
   - **Nombre:** Análisis del inbox
   - **Horario:** `0 8,13,18 * * *` → todos los días a las 8:00, 13:00 y 18:00 (hora de esa computadora)
   - **Prompt:** el contenido de `agent/analisis-inbox.md`

**Importante:** la tarea corre solo con la app de Claude abierta. Si la computadora está apagada o la
app cerrada a esa hora, corre al volver a abrirla. Deja esa computadora encendida en horario laboral y
sin suspenderse (*Ajustes del Sistema → Batería/Energía*).

## Paso 5 · Comprobar que todo funciona
- [ ] La tarea aparece en la lista de tareas programadas y la prueba terminó sin errores.
- [ ] En el dashboard → **Hoy** aparece "Último análisis: …" con el resumen.
- [ ] Hay correos en "Correos por responder" y, si correspondía, sugerencias de reparto.
- [ ] En Gmail hay borradores para los correos P1 (nunca se envía nada solo).
- [ ] En **Reglas → Mis prioridades** está tu lista.

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
| Conectores Gmail y Supabase | ✅ cuenta de Claude | Reconectar si lo pide |
| Tarea programada 8 · 13 · 18 | | ✅ Crearla (paso 4) |
| `web/.env.local` | | Solo si se desarrolla ahí |
