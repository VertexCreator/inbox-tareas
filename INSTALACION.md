# Instalación en la computadora del agente

Guía para dejar todo funcionando en la computadora nueva. Usa la **misma cuenta de Claude**.

## Qué ya está en la nube (no se instala)

| Parte | Dónde | Estado |
|---|---|---|
| Código | GitHub `VertexCreator/inbox-tareas` (privado) | Listo |
| Datos, login, reparto, prioridades | Supabase `inbox-tareas` (`ddqpbbktcoznkifwyoiy`) | Listo |
| Dashboard | Vercel (URL del despliegue) | Listo cuando se despliegue (ver README §4) |

El equipo solo necesita la URL del dashboard y su cuenta `@dimassicorp.com`. **Esta guía es solo
para la computadora que va a correr el agente** (la que lee el Gmail tres veces al día).

---

## Paso 1 · App de Claude
1. Instala la app de escritorio de Claude y entra con **la misma cuenta** de Claude.
2. Ve a *Ajustes → Conectores* y revisa que estén **Gmail** y **Supabase**.
   - Los conectores van con la cuenta, así que deberían aparecer ya. Si alguno falta o pide
     reconectar, conéctalo de nuevo.
   - En Gmail, la cuenta conectada tiene que ser **sgomez@dimassicorp.com**.

## Paso 2 · Descargar el proyecto
En la Terminal:
```bash
gh auth login
```
```bash
gh repo clone VertexCreator/inbox-tareas ~/inbox-tareas
```
Si esa computadora usa otra cuenta de GitHub, primero invítala al repo:
GitHub → `inbox-tareas` → *Settings → Collaborators → Add people*.

> El agente no necesita estos archivos para funcionar (todo está en Supabase). Se descargan para
> tener el prompt a mano y poder hacer cambios al dashboard desde esa computadora.

## Paso 3 · Crear la tarea programada
Las tareas programadas se guardan **en cada computadora**, por eso se crean aquí y no se copian.

1. Abre la app de Claude → pestaña **Code** → elige la carpeta `~/inbox-tareas`.
2. Escribe:
   > Lee `INSTALACION.md` y `agent/analisis-inbox.md` y crea la tarea programada del agente.
3. Claude la crea con estos datos (revisa que coincidan):
   - **Nombre:** Análisis del inbox
   - **Horario:** `0 8,13,18 * * *` → todos los días a las 8:00, 13:00 y 18:00 (hora local de la computadora)
   - **Prompt:** el contenido completo de `agent/analisis-inbox.md`
4. Pídele que la ejecute una vez ahora para probar.

**Importante:** la tarea corre solo si la app de Claude está abierta. Si la computadora está apagada
o la app cerrada a esa hora, corre al volver a abrirla. Conviene que esa computadora quede
encendida en horario laboral, sin suspenderse.

Si había una tarea programada igual en la computadora anterior, bórrala allí para que no corran
dos agentes a la vez.

## Paso 4 · Comprobar que todo funciona
- [ ] La tarea programada aparece en la lista de tareas de la app y la prueba terminó sin errores.
- [ ] En el dashboard → **Hoy** aparece "Último análisis: …" con el resumen del día.
- [ ] Hay correos en "Correos por responder" y, si correspondía, sugerencias de reparto.
- [ ] En Gmail aparecen borradores para los correos P1 (nunca se envía nada solo).
- [ ] En el dashboard → **Reglas → Mis prioridades** está tu lista y se puede editar.

## Solo si vas a modificar el dashboard en esa computadora
```bash
cd ~/inbox-tareas/web
```
```bash
cp .env.example .env.local
```
Completa `web/.env.local` (los valores están en el README §4), y luego:
```bash
npm install
```
```bash
npm run dev
```
Cada `git push` a `main` vuelve a publicar el dashboard en Vercel automáticamente.

---

## Resumen: qué vive dónde

| Cosa | Se mueve sola | Hay que rehacerla |
|---|---|---|
| Tareas, equipo, reglas, historial, prioridades | ✅ (Supabase) | |
| Dashboard | ✅ (Vercel) | |
| Código | ✅ (GitHub) | `git clone` |
| Conectores Gmail y Supabase | ✅ (cuenta de Claude) | Reconectar si los pide |
| Tarea programada 8 · 13 · 18 | | ✅ Crear en la computadora nueva |
| `web/.env.local` | | Solo si se desarrolla ahí |
