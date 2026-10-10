# Inbox → Tareas

Revisa el Gmail del administrador, prioriza qué responder, y convierte los correos en tareas que
se reparten en el equipo según especialidad y carga de trabajo. El agente aprende de tus correcciones.

```
Gmail ──(Apps Script cada 15 min: filtra basura, limpia y recorta)──► Supabase: email_queue
                                                                          │
Claude con tu plan (L-V 8:00 · 13:00 · 18:00 + domingo 21:00) ◄───────────┘
  clasifica la cola, prioriza, crea borradores y tareas ──► Supabase ◄──► Dashboard (Vercel)
                                                            reparto, RLS   Hoy · Listas · Tablero · Equipo · Configuración
```

**Manual de uso para el equipo:** [web/src/content/manual.md](web/src/content/manual.md) (también en el dashboard → **Ayuda**).

## Cómo funciona

| Pieza | Dónde | Qué hace |
|---|---|---|
| Ingesta | `apps-script/Code.gs` | Google Apps Script en la cuenta de Gmail. Sin IA: separa la basura (Promociones, Social, Foros, lista de basura), limpia y recorta el resto y lo deja en `email_queue`. Ahorra tokens. |
| Listas y planes | `list_items`, `plan_templates`, `draft_plan()`, `confirm_plan()` | Listas de pendientes (estilo Slack Lists). **Planificar** arma al instante tarea + subtareas con responsables por habilidad, nivel y carga; el gerente confirma o modifica, y la plantilla aprende sus cambios. |
| Marcas e iniciativas | `brands`, `status_stickers`, `tasks` | Cada iniciativa (= tarea) tiene marca, descripción, sticker de estatus, responsable autorizado (`can_own`), observación visible y subtareas. Tablero global o por marca, con columnas por sticker. |
| Mis tickets | `web/src/pages/Tickets.tsx` | Cada persona ve sus iniciativas y subtareas; el responsable agrega subtareas, cambia el sticker y deja observaciones. |
| Planificador | `agent/planificador.md` | Tarea programada cada 30 min (L-V): Claude afina los borradores de plan para el pendiente concreto. |
| Análisis | `agent/analisis-inbox.md` | Prompt de la tarea programada en Claude (conectores Gmail + Supabase). Clasifica, prioriza, crea borradores (nunca envía) y tareas. |
| Prioridades | Supabase `agent_priorities` | Tus VIPs, temas P1/P2, categorías. Se editan en el dashboard → Configuración (etiquetas por nivel y formato del resumen). Solo admin. |
| Reparto | `supabase/migrations/` → `route_task()` | 1) reglas aprendidas, 2) especialista con menos carga, 3) tarea general → menor carga. Pide aprobación si el especialista está saturado o es P1 urgente. |
| Aprendizaje | `reassign_task()` | Al corregir con palabra clave se crea una regla ("instagram" → Ana). |
| Dashboard | `web/` | React + Vite + Tailwind. Login con correo y contraseña (Supabase Auth). |
| Accesos | `supabase/functions/admin-users` | Edge Function: el admin da acceso o restablece contraseñas desde la página Equipo. |

### Quién ve qué
- **Admin (gerente)**: correos, resúmenes del agente, planificar pendientes, confirmar o modificar repartos,
  fechas límite de tareas y subtareas, configuración, equipo.
- **Responsable de una iniciativa** (autorizado por el gerente): cambia su sticker, deja observaciones y crea,
  edita o asigna sus subtareas.
- **Equipo**: listas (crea pendientes), tablero, mis tickets, actividad; crea stickers nuevos y marca sus propias
  subtareas. No edita fechas, marcas ni responsables. **No ve tu inbox.**
- **Cualquier otra cuenta**: nada (RLS en todas las tablas; acceso solo si está en `team_members`).

## Puesta en marcha

### 1. Login (Supabase Auth, correo y contraseña)
1. **Cierra el registro público**: Supabase → *Authentication* → *Sign In / Providers* → desactiva
   **Allow new users to sign up**. Así solo entra quien el admin da de alta. Deja **Confirm email** activado.
2. **Tu usuario (una sola vez)**: Supabase → *Authentication* → *Users* → *Add user* → *Create new user*
   - Correo: `sgomez@dimassicorp.com`, una contraseña tuya, y marca **Auto Confirm User**.
3. **URLs**: Supabase → *Authentication* → *URL Configuration* → *Site URL* = la URL de Vercel
   (mientras tanto, `http://localhost:5173`).

Ya como admin, al resto del equipo le das acceso desde el dashboard:
**Equipo → Agregar persona** y luego **Dar acceso**. El dashboard genera una contraseña temporal; se la
pasas por un canal privado y al entrar la persona crea la suya. Si alguien la olvida, **Dar acceso** otra vez
la restablece. Para quitar el acceso: **Editar → Desactivar**.

<details>
<summary>Opcional, más adelante: login con Google Workspace</summary>

Requiere que el superadministrador de Google Workspace te dé el rol **Creador de proyectos** en la
organización `dimassicorp.com`.
1. Google Cloud → proyecto en la organización `dimassicorp.com` → *Pantalla de consentimiento OAuth* → **Interno**.
2. *Crear ID de cliente OAuth* → **Aplicación web** → redirección:
   `https://ddqpbbktcoznkifwyoiy.supabase.co/auth/v1/callback`
3. Supabase → *Sign In / Providers* → **Google**: Client ID y Secret.
4. En Vercel (y `web/.env.local`): `VITE_ENABLE_GOOGLE_LOGIN=true`. Aparece el botón "Entrar con Google"
   junto al de contraseña; las dos formas conviven.
</details>

### 2. Administradores
`sgomez@dimassicorp.com` ya es admin. Para hacer admin a otra persona: **Equipo → Editar → Administrador**.
Desactiva los miembros "(ejemplo)" cuando cargues al equipo real.

### 3. Dashboard local
```bash
cd web
cp .env.example .env.local   # completa URL, publishable key y dominio
npm install
npm run dev
```

### 4. Publicar en Vercel
1. En [vercel.com/new](https://vercel.com/new) → *Import Git Repository* → `VertexCreator/inbox-tareas`
   (la primera vez, autoriza a Vercel a ver el repo privado).
2. **Root Directory**: `web`. Framework: Vite (lo detecta solo).
3. *Environment Variables*:
   - `VITE_SUPABASE_URL` = `https://ddqpbbktcoznkifwyoiy.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = la de `web/.env.local`
   - `VITE_WORKSPACE_DOMAIN` = `dimassicorp.com`
   - `VITE_ENABLE_GOOGLE_LOGIN` = `false`
4. *Deploy*. Copia la URL (ej. `inbox-tareas.vercel.app`) a Supabase → *Authentication* → *URL Configuration*
   como *Site URL*.

Cada `git push` a `main` vuelve a publicar solo. Vercel solo sirve la página: los cambios del equipo
(marcar tareas como completadas, moverlas) se guardan directo en Supabase y aparecen en tiempo real
en las pantallas de todos.

### 5. Agente (con tu plan de Claude)
Horario: L-V 8:00 · 13:00 · 18:00 + domingo 21:00 (resumen del fin de semana).
Sigue [INSTALACION.md](INSTALACION.md) en la computadora que va a correr el agente.

## Base de datos

Migraciones en `supabase/migrations/`. Tablas: `team_members`, `emails` (solo admin), `tasks`,
`assignment_rules`, `assignment_log`, `agent_runs` (solo admin), `agent_priorities` (solo admin), `settings`. Vista `member_load`.

Para cambiar el modo (sugerencia ↔ automático) o el umbral de saturación: **Configuración → Reparto e historial**.

## Seguridad
- Las claves en `web/.env.local` no se suben (está en `.gitignore`). La *publishable key* es pública por diseño; la seguridad está en RLS.
- El agente nunca envía correos, solo crea borradores, y trata el contenido de los correos como datos, no como instrucciones.
- La asignación solo cambia vía funciones (`approve_task`, `reassign_task`) que validan admin.
