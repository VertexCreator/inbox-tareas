-- Esquema inicial: equipo, correos (privados del admin), tareas, reglas de reparto e historial.

-- ============================================================
-- Tablas
-- ============================================================

create table public.settings (
  id int primary key default 1 check (id = 1),
  -- 'sugerencia': el agente propone y el admin aprueba. 'automatico': asigna solo cuando está seguro.
  autonomy text not null default 'sugerencia' check (autonomy in ('sugerencia', 'automatico')),
  -- Carga (0-1) a partir de la cual un especialista se considera saturado.
  saturation_threshold numeric not null default 0.9 check (saturation_threshold > 0),
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  specialties text[] not null default '{}',
  -- Puntos de esfuerzo que la persona puede tener abiertos a la vez (medio tiempo = menos).
  capacity_points int not null default 10 check (capacity_points > 0),
  is_admin boolean not null default false,
  active boolean not null default true,
  -- false = vacaciones / no recibir tareas nuevas.
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  gmail_thread_id text,
  from_name text,
  from_email text,
  subject text,
  summary text,
  category text not null default 'otros',
  priority text not null default 'ninguna' check (priority in ('P1', 'P2', 'P3', 'ninguna')),
  needs_reply boolean not null default false,
  draft_created boolean not null default false,
  reply_by date,
  status text not null default 'pendiente' check (status in ('pendiente', 'respondido', 'archivado')),
  received_at timestamptz,
  created_at timestamptz not null default now()
);
create index emails_received_at_idx on public.emails (received_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  email_id uuid references public.emails (id) on delete set null,
  title text not null,
  description text,
  -- null = tarea general (se reparte por carga).
  specialty text,
  effort_points int not null default 2 check (effort_points between 1 and 3),
  priority text not null default 'P2' check (priority in ('P1', 'P2', 'P3')),
  due_date date,
  status text not null default 'por_hacer' check (status in ('por_hacer', 'en_curso', 'hecho')),
  assignee_id uuid references public.team_members (id) on delete set null,
  suggested_assignee_id uuid references public.team_members (id) on delete set null,
  needs_approval boolean not null default false,
  assignment_mode text check (assignment_mode in ('auto', 'sugerida', 'aprobada', 'corregida', 'manual')),
  assignment_reason text,
  source text not null default 'manual' check (source in ('correo', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_status_idx on public.tasks (status);

create table public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique check (keyword = lower(trim(keyword)) and keyword <> ''),
  member_id uuid not null references public.team_members (id) on delete cascade,
  active boolean not null default true,
  created_from_task uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.assignment_log (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  member_id uuid references public.team_members (id) on delete set null,
  previous_member_id uuid references public.team_members (id) on delete set null,
  mode text not null,
  reason text,
  actor text not null default 'agente',
  created_at timestamptz not null default now()
);
create index assignment_log_task_idx on public.assignment_log (task_id);

-- Cada ejecución del agente (8:00, 13:00, 18:00) deja aquí su resumen del día.
create table public.agent_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  slot text,
  emails_processed int not null default 0,
  tasks_created int not null default 0,
  summary text
);

-- ============================================================
-- Helpers de identidad (el login es con Google Workspace)
-- ============================================================

create function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.team_members
  where lower(email) = lower(auth.jwt() ->> 'email') and active
  limit 1
$$;

create function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_member_id() is not null
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where lower(email) = lower(auth.jwt() ->> 'email') and active and is_admin
  )
$$;

-- El agente corre con el rol postgres (sin JWT); los usuarios del dashboard, con su JWT.
create function public.actor_label() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select name from public.team_members where id = public.current_member_id()),
    auth.jwt() ->> 'email',
    'agente'
  )
$$;

create function public.require_admin_or_agent() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.jwt() is not null and not public.is_admin() then
    raise exception 'Solo un administrador puede hacer esto';
  end if;
end
$$;

-- ============================================================
-- Carga de trabajo
-- ============================================================

-- Cuenta las tareas abiertas asignadas o sugeridas (para que una tanda de sugerencias
-- no caiga entera sobre la misma persona antes de aprobarse).
create view public.member_load with (security_invoker = true) as
select
  m.id, m.name, m.email, m.specialties, m.capacity_points, m.is_admin, m.active, m.available,
  coalesce(sum(t.effort_points), 0)::int as open_points,
  count(t.id)::int as open_tasks,
  round(coalesce(sum(t.effort_points), 0)::numeric / m.capacity_points, 2) as load_ratio
from public.team_members m
left join public.tasks t
  on coalesce(t.assignee_id, t.suggested_assignee_id) = m.id
  and t.status in ('por_hacer', 'en_curso')
group by m.id;

-- ============================================================
-- Reparto de tareas
-- ============================================================

-- Orden de decisión: 1) reglas aprendidas, 2) especialista con menos carga,
-- 3) tarea general -> miembro con menos carga. Si algo no cuadra, pide aprobación.
create function public.route_task(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  s public.settings%rowtype;
  v_text text;
  v_rule record;
  v_member uuid;
  v_ratio numeric;
  v_reason text := '';
  v_approval boolean := false;
begin
  select * into t from public.tasks where id = p_task_id;
  if not found then return; end if;
  select * into s from public.settings where id = 1;
  v_text := lower(coalesce(t.title, '') || ' ' || coalesce(t.description, ''));

  -- 1) Reglas aprendidas de tus correcciones (gana la palabra clave más específica).
  select r.member_id, r.keyword into v_rule
  from public.assignment_rules r
  join public.team_members m on m.id = r.member_id
  where r.active and m.active and m.available and position(r.keyword in v_text) > 0
  order by length(r.keyword) desc
  limit 1;

  if found then
    v_member := v_rule.member_id;
    select load_ratio into v_ratio from public.member_load where id = v_member;
    v_reason := format('Regla aprendida: "%s" · carga %s%%', v_rule.keyword, round(v_ratio * 100));

  -- 2) Tarea específica: especialista disponible con menos carga.
  elsif t.specialty is not null then
    select l.id, l.load_ratio into v_member, v_ratio
    from public.member_load l
    where l.active and l.available
      and exists (select 1 from unnest(l.specialties) sp where lower(sp) = lower(t.specialty))
    order by l.load_ratio, l.open_tasks
    limit 1;

    if v_member is null then
      v_approval := true;
      v_reason := format('Nadie tiene la especialidad "%s" · ', t.specialty);
    else
      v_reason := format('Especialidad: %s · carga %s%%', t.specialty, round(v_ratio * 100));
      if v_ratio >= s.saturation_threshold then
        v_approval := true;
        v_reason := v_reason || ' · especialista saturado';
      end if;
    end if;
  end if;

  -- 3) Tarea general (o sin especialista): quien tenga menos carga.
  if v_member is null then
    select l.id, l.load_ratio into v_member, v_ratio
    from public.member_load l
    where l.active and l.available
    order by l.load_ratio, l.open_tasks
    limit 1;
    if v_member is not null then
      v_reason := v_reason || format('Tarea general · menor carga (%s%%)', round(v_ratio * 100));
    end if;
  end if;

  if v_member is null then
    update public.tasks
    set needs_approval = true, assignment_mode = 'sugerida',
        assignment_reason = 'No hay miembros disponibles', updated_at = now()
    where id = p_task_id;
    return;
  end if;

  if t.priority = 'P1' and t.due_date is not null and t.due_date <= current_date + 1 then
    v_approval := true;
    v_reason := v_reason || ' · P1 con fecha cercana, revísala';
  end if;

  if s.autonomy = 'automatico' and not v_approval then
    update public.tasks
    set assignee_id = v_member, suggested_assignee_id = v_member, needs_approval = false,
        assignment_mode = 'auto', assignment_reason = v_reason, updated_at = now()
    where id = p_task_id;
    insert into public.assignment_log (task_id, member_id, mode, reason)
    values (p_task_id, v_member, 'auto', v_reason);
  else
    update public.tasks
    set assignee_id = null, suggested_assignee_id = v_member, needs_approval = true,
        assignment_mode = 'sugerida', assignment_reason = v_reason, updated_at = now()
    where id = p_task_id;
    insert into public.assignment_log (task_id, member_id, mode, reason)
    values (p_task_id, v_member, 'sugerida', v_reason);
  end if;
end
$$;

create function public.tasks_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is null then
    perform public.route_task(new.id);
  else
    update public.tasks set assignment_mode = 'manual', assignment_reason = 'Asignada a mano', needs_approval = false
    where id = new.id;
    insert into public.assignment_log (task_id, member_id, mode, reason, actor)
    values (new.id, new.assignee_id, 'manual', 'Asignada a mano', public.actor_label());
  end if;
  return null;
end
$$;

create trigger tasks_route_on_insert
after insert on public.tasks
for each row execute function public.tasks_after_insert();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger tasks_touch before update on public.tasks
for each row execute function public.touch_updated_at();

-- Aprobar la sugerencia del agente.
create function public.approve_task(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
begin
  perform public.require_admin_or_agent();
  select suggested_assignee_id into v_member from public.tasks where id = p_task_id;
  if v_member is null then
    raise exception 'Esta tarea no tiene sugerencia; asígnala con una corrección';
  end if;
  update public.tasks
  set assignee_id = v_member, needs_approval = false, assignment_mode = 'aprobada'
  where id = p_task_id;
  insert into public.assignment_log (task_id, member_id, mode, reason, actor)
  values (p_task_id, v_member, 'aprobada', 'Sugerencia aprobada', public.actor_label());
end
$$;

-- Corregir la asignación. Si viene palabra clave, el agente la aprende como regla.
create function public.reassign_task(p_task_id uuid, p_member_id uuid, p_keyword text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev uuid;
  v_kw text := nullif(lower(trim(coalesce(p_keyword, ''))), '');
  v_reason text;
begin
  perform public.require_admin_or_agent();
  if not exists (select 1 from public.team_members where id = p_member_id and active) then
    raise exception 'Ese miembro no existe o está inactivo';
  end if;
  select coalesce(assignee_id, suggested_assignee_id) into v_prev from public.tasks where id = p_task_id;
  if not found then
    raise exception 'La tarea no existe';
  end if;

  v_reason := 'Corregida por ' || public.actor_label();
  if v_kw is not null then
    insert into public.assignment_rules (keyword, member_id, created_from_task)
    values (v_kw, p_member_id, p_task_id)
    on conflict (keyword) do update set member_id = excluded.member_id, active = true,
      created_from_task = excluded.created_from_task;
    v_reason := v_reason || format(' · nueva regla "%s"', v_kw);
  end if;

  update public.tasks
  set assignee_id = p_member_id, suggested_assignee_id = p_member_id,
      needs_approval = false, assignment_mode = 'corregida', assignment_reason = v_reason
  where id = p_task_id;
  insert into public.assignment_log (task_id, member_id, previous_member_id, mode, reason, actor)
  values (p_task_id, p_member_id, v_prev, 'corregida', v_reason, public.actor_label());
end
$$;

-- ============================================================
-- Entrada del agente (Claude, con tu plan, vía el conector de Supabase)
-- ============================================================

create function public.ingest_email(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.require_admin_or_agent();
  insert into public.emails (
    gmail_message_id, gmail_thread_id, from_name, from_email, subject, summary,
    category, priority, needs_reply, draft_created, reply_by, received_at
  ) values (
    p ->> 'gmail_message_id', p ->> 'gmail_thread_id', p ->> 'from_name', p ->> 'from_email',
    p ->> 'subject', p ->> 'summary', coalesce(p ->> 'category', 'otros'),
    coalesce(p ->> 'priority', 'ninguna'), coalesce((p ->> 'needs_reply')::boolean, false),
    coalesce((p ->> 'draft_created')::boolean, false), (p ->> 'reply_by')::date,
    (p ->> 'received_at')::timestamptz
  )
  on conflict (gmail_message_id) do update set
    summary = excluded.summary, category = excluded.category, priority = excluded.priority,
    needs_reply = excluded.needs_reply,
    draft_created = public.emails.draft_created or excluded.draft_created,
    reply_by = excluded.reply_by
  returning id into v_id;
  return v_id;
end
$$;

create function public.create_task_from_email(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email uuid;
  v_id uuid;
begin
  perform public.require_admin_or_agent();
  select id into v_email from public.emails where gmail_message_id = p ->> 'gmail_message_id';
  if v_email is null then
    raise exception 'Primero registra el correo con ingest_email';
  end if;
  -- Evita duplicados si el agente vuelve a procesar el mismo correo.
  select id into v_id from public.tasks
  where email_id = v_email and lower(title) = lower(p ->> 'title');
  if v_id is not null then return v_id; end if;

  insert into public.tasks (email_id, title, description, specialty, effort_points, priority, due_date, source)
  values (
    v_email, p ->> 'title', p ->> 'description', nullif(p ->> 'specialty', ''),
    coalesce((p ->> 'effort_points')::int, 2), coalesce(p ->> 'priority', 'P2'),
    (p ->> 'due_date')::date, 'correo'
  )
  returning id into v_id;
  return v_id;
end
$$;

create function public.log_agent_run(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  perform public.require_admin_or_agent();
  insert into public.agent_runs (slot, emails_processed, tasks_created, summary)
  values (p ->> 'slot', coalesce((p ->> 'emails_processed')::int, 0),
          coalesce((p ->> 'tasks_created')::int, 0), p ->> 'summary')
  returning id into v_id;
  return v_id;
end
$$;

-- ============================================================
-- Seguridad: RLS y permisos
-- ============================================================

alter table public.settings enable row level security;
alter table public.team_members enable row level security;
alter table public.emails enable row level security;
alter table public.tasks enable row level security;
alter table public.assignment_rules enable row level security;
alter table public.assignment_log enable row level security;
alter table public.agent_runs enable row level security;

-- Nadie anónimo ve nada.
revoke all on all tables in schema public from anon;

-- settings
create policy settings_select on public.settings for select to authenticated using (public.is_member());
create policy settings_update on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- team_members
create policy members_select on public.team_members for select to authenticated using (public.is_member());
create policy members_insert on public.team_members for insert to authenticated with check (public.is_admin());
create policy members_update on public.team_members for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy members_delete on public.team_members for delete to authenticated using (public.is_admin());

-- emails: solo el admin (tu inbox no se comparte).
create policy emails_admin on public.emails for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- tasks: el equipo ve y actualiza; la asignación solo cambia vía funciones.
create policy tasks_select on public.tasks for select to authenticated using (public.is_member());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_member());
create policy tasks_update on public.tasks for update to authenticated using (public.is_member()) with check (public.is_member());
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_admin());
revoke update on public.tasks from authenticated;
grant update (title, description, status, priority, effort_points, due_date, specialty) on public.tasks to authenticated;
revoke insert on public.tasks from authenticated;
grant insert (title, description, specialty, effort_points, priority, due_date, assignee_id) on public.tasks to authenticated;

-- reglas
create policy rules_select on public.assignment_rules for select to authenticated using (public.is_member());
create policy rules_update on public.assignment_rules for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy rules_delete on public.assignment_rules for delete to authenticated using (public.is_admin());
revoke insert on public.assignment_rules from authenticated;

-- historial
create policy log_select on public.assignment_log for select to authenticated using (public.is_member());
revoke insert, update, delete on public.assignment_log from authenticated;

-- resúmenes del agente: solo el admin (hablan de tu inbox).
create policy runs_admin on public.agent_runs for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.agent_runs from authenticated;

-- Funciones: las internas no se exponen; las de acción validan admin por dentro.
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.route_task(uuid) from authenticated;
revoke execute on function public.tasks_after_insert() from authenticated;
revoke execute on function public.ingest_email(jsonb) from authenticated;
revoke execute on function public.create_task_from_email(jsonb) from authenticated;
revoke execute on function public.log_agent_run(jsonb) from authenticated;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.actor_label() to authenticated;
grant execute on function public.require_admin_or_agent() to authenticated;
grant execute on function public.approve_task(uuid) to authenticated;
grant execute on function public.reassign_task(uuid, uuid, text) to authenticated;

-- Tiempo real para que el tablero se actualice solo.
alter publication supabase_realtime add table public.tasks;
