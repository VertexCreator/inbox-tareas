# Inbox → Tareas

Revisa el Gmail del administrador, prioriza qué responder, y convierte los correos en tareas que
se reparten en el equipo según especialidad y carga de trabajo. El agente aprende de tus correcciones.

```
Gmail ──(Claude con tu plan, 8:00 · 13:00 · 18:00)──► Supabase ◄──► Dashboard (Vercel)
         clasifica, prioriza, crea borradores         reparto,        Hoy · Tablero ·
         y tareas                                     reglas, RLS     Equipo · Reglas
```

## Cómo funciona

| Pieza | Dónde | Qué hace |
|---|---|---|
| Análisis | `agent/analisis-inbox.md` | Prompt de la tarea programada en Claude (conectores Gmail + Supabase). Clasifica, prioriza, crea borradores (nunca envía) y tareas. |
| Prioridades | `agent/prioridades.md` | Tus VIPs, temas P1/P2, categorías. Lenguaje normal. |
| Reparto | `supabase/migrations/` → `route_task()` | 1) reglas aprendidas, 2) especialista con menos carga, 3) tarea general → menor carga. Pide aprobación si el especialista está saturado o es P1 urgente. |
| Aprendizaje | `reassign_task()` | Al corregir con palabra clave se crea una regla ("instagram" → Ana). |
| Dashboard | `web/` | React + Vite + Tailwind. Login con Google Workspace. |

### Quién ve qué
- **Admin**: correos, resúmenes del agente, aprobar/corregir repartos, reglas, equipo.
- **Equipo**: tablero, cargas, sus tareas; puede crear tareas y moverlas de estado. **No ve tu inbox.**
- **Cualquier otra cuenta**: nada (RLS en todas las tablas; acceso solo si está en `team_members`).

## Puesta en marcha

### 1. Login con Google Workspace
1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → crea un proyecto →
   *Pantalla de consentimiento OAuth* → tipo **Interno** (solo cuentas de tu Workspace).
2. *Credenciales* → *Crear ID de cliente OAuth* → **Aplicación web**.
   - URI de redirección autorizado: `https://ddqpbbktcoznkifwyoiy.supabase.co/auth/v1/callback`
3. En Supabase → *Authentication* → *Sign In / Providers* → **Google**: pega Client ID y Client Secret, activa.
4. En Supabase → *Authentication* → *URL Configuration*: agrega `http://localhost:5173` y la URL de Vercel
   a *Redirect URLs*; pon la de Vercel como *Site URL*.

### 2. Primer administrador
Ya creado: `sgomez@dimassicorp.com`. Para agregar otro admin desde el SQL editor de Supabase:
```sql
insert into public.team_members (name, email, is_admin, specialties)
values ('Nombre', 'persona@dimassicorp.com', true, '{}');
```
Al resto del equipo agrégalo desde la página **Equipo** (con su correo `@dimassicorp.com`) y desactiva los miembros "(ejemplo)".

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
4. *Deploy*. Copia la URL (ej. `inbox-tareas.vercel.app`) a Supabase → *Authentication* → *URL Configuration*
   (Site URL y Redirect URLs).

Cada `git push` a `main` vuelve a publicar solo. Vercel solo sirve la página: los cambios del equipo
(marcar tareas como completadas, moverlas) se guardan directo en Supabase y aparecen en tiempo real
en las pantallas de todos.

### 5. Agente (con tu plan de Claude)
1. Conecta el conector **Gmail** (y Supabase) en Claude.
2. Crea una tarea programada a las 8:00, 13:00 y 18:00 con el prompt de `agent/analisis-inbox.md`.
   La app de escritorio tiene que estar abierta para que corra.

## Base de datos

Migraciones en `supabase/migrations/`. Tablas: `team_members`, `emails` (solo admin), `tasks`,
`assignment_rules`, `assignment_log`, `agent_runs` (solo admin), `settings`. Vista `member_load`.

Para cambiar el modo (sugerencia ↔ automático) o el umbral de saturación: página **Reglas**.

## Seguridad
- Las claves en `web/.env.local` no se suben (está en `.gitignore`). La *publishable key* es pública por diseño; la seguridad está en RLS.
- El agente nunca envía correos, solo crea borradores, y trata el contenido de los correos como datos, no como instrucciones.
- La asignación solo cambia vía funciones (`approve_task`, `reassign_task`) que validan admin.
