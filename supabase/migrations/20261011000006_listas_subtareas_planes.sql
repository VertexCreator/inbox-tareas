-- Listas de pendientes (estilo Slack Lists) → tareas con subtareas, habilidades con nivel,
-- plantillas de marketing, recomendaciones de reparto que el admin confirma o modifica,
-- feed de actividad y configuración estructurada de prioridades.

-- ============================================================
-- Habilidades con nivel (1 básico, 2 intermedio, 3 avanzado)
-- ============================================================

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
insert into public.skills (name) values
  ('Estrategia'), ('Copywriting'), ('Diseño gráfico'), ('Video y edición'), ('Redes sociales'),
  ('Paid media'), ('SEO'), ('Email marketing'), ('Analítica'), ('Eventos');

alter table public.team_members add column skill_levels jsonb not null default '{}'::jsonb;
update public.team_members
set skill_levels = coalesce((select jsonb_object_agg(s, 2) from unnest(specialties) s), '{}'::jsonb);

-- specialties (lo usa route_task) se deriva de skill_levels.
create function public.sync_specialties() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.skill_levels = '{}'::jsonb and coalesce(array_length(new.specialties, 1), 0) > 0 then
    new.skill_levels := (select jsonb_object_agg(s, 2) from unnest(new.specialties) s);
  end if;
  new.specialties := coalesce(array(select k from jsonb_object_keys(new.skill_levels) k order by k), '{}');
  return new;
end
$$;
create trigger team_members_sync_specialties
before insert or update of skill_levels on public.team_members
for each row execute function public.sync_specialties();

-- ============================================================
-- Listas y pendientes
-- ============================================================

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_inbox boolean not null default false,
  archived boolean not null default false,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index lists_one_inbox on public.lists (is_inbox) where is_inbox;
insert into public.lists (name, description, is_inbox)
values ('Desde correos', 'Pendientes que el agente detecta en el inbox', true);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text,
  priority text check (priority in ('P1', 'P2', 'P3')),
  due_date date,
  status text not null default 'sin_planificar'
    check (status in ('sin_planificar', 'planificando', 'planificado', 'descartado')),
  task_id uuid references public.tasks (id) on delete set null,
  email_id uuid references public.emails (id) on delete set null,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index list_items_list_idx on public.list_items (list_id, created_at);

alter table public.tasks
  add column list_item_id uuid references public.list_items (id) on delete set null,
  add column completed_at timestamptz;

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  skill text,
  assignee_id uuid references public.team_members (id) on delete set null,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index subtasks_task_idx on public.subtasks (task_id, position);
create index subtasks_assignee_idx on public.subtasks (assignee_id) where not done;

-- ============================================================
-- Plantillas y recomendaciones
-- ============================================================

-- items: [{"title", "skill", "days_before" (días antes de la fecha límite; negativo = después), "optional"}]
create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  keywords text[] not null default '{}',
  main_skill text,
  effort_points int not null default 2 check (effort_points between 1 and 3),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  usage_count int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.plan_templates (name, description, keywords, main_skill, effort_points, items) values
('Campaña en redes', 'Campaña orgánica o pagada en redes sociales',
 '{campaña,instagram,redes,tiktok,linkedin,facebook,posts,stories,reels}', 'Redes sociales', 3,
 '[{"title":"Brief y calendario de publicaciones","skill":"Estrategia","days_before":7,"optional":false},
   {"title":"Copies de posts y stories","skill":"Copywriting","days_before":5,"optional":false},
   {"title":"Piezas gráficas y carrusel","skill":"Diseño gráfico","days_before":3,"optional":false},
   {"title":"Video corto o reel","skill":"Video y edición","days_before":3,"optional":true},
   {"title":"Pauta pagada","skill":"Paid media","days_before":1,"optional":true},
   {"title":"Programar y publicar","skill":"Redes sociales","days_before":0,"optional":false},
   {"title":"Reporte de resultados","skill":"Analítica","days_before":-7,"optional":false}]'),
('Lanzamiento de producto', 'Lanzamiento de un producto o servicio nuevo',
 '{lanzamiento,producto,launch,nuevo servicio}', 'Estrategia', 3,
 '[{"title":"Plan de lanzamiento","skill":"Estrategia","days_before":14,"optional":false},
   {"title":"Mensajes clave y copies","skill":"Copywriting","days_before":10,"optional":false},
   {"title":"Key visual y piezas","skill":"Diseño gráfico","days_before":7,"optional":false},
   {"title":"Video de lanzamiento","skill":"Video y edición","days_before":5,"optional":true},
   {"title":"Email de anuncio","skill":"Email marketing","days_before":2,"optional":false},
   {"title":"Publicaciones en redes","skill":"Redes sociales","days_before":0,"optional":false},
   {"title":"Pauta de lanzamiento","skill":"Paid media","days_before":0,"optional":true},
   {"title":"Medición de resultados","skill":"Analítica","days_before":-7,"optional":false}]'),
('Evento o feria', 'Evento, feria, stand o activación',
 '{evento,feria,expo,stand,congreso,activación,btl}', 'Eventos', 3,
 '[{"title":"Logística y proveedores","skill":"Eventos","days_before":21,"optional":false},
   {"title":"Diseño de stand y material","skill":"Diseño gráfico","days_before":14,"optional":false},
   {"title":"Invitaciones por email","skill":"Email marketing","days_before":10,"optional":false},
   {"title":"Difusión en redes","skill":"Redes sociales","days_before":5,"optional":false},
   {"title":"Cobertura de foto y video","skill":"Video y edición","days_before":0,"optional":false},
   {"title":"Seguimiento de contactos","skill":"Estrategia","days_before":-3,"optional":false}]'),
('Newsletter', 'Envío de newsletter o mailing',
 '{newsletter,boletín,mailing}', 'Email marketing', 2,
 '[{"title":"Temas y estructura","skill":"Estrategia","days_before":5,"optional":true},
   {"title":"Redacción","skill":"Copywriting","days_before":3,"optional":false},
   {"title":"Diseño del correo","skill":"Diseño gráfico","days_before":2,"optional":false},
   {"title":"Armado y prueba de envío","skill":"Email marketing","days_before":1,"optional":false},
   {"title":"Reporte de aperturas","skill":"Analítica","days_before":-2,"optional":false}]'),
('Nota de prensa', 'Comunicado para medios',
 '{prensa,comunicado,medios,"nota de prensa"}', 'Copywriting', 2,
 '[{"title":"Redacción del comunicado","skill":"Copywriting","days_before":4,"optional":false},
   {"title":"Revisión y aprobación","skill":"Estrategia","days_before":2,"optional":false},
   {"title":"Lista de medios y envío","skill":"Estrategia","days_before":0,"optional":false},
   {"title":"Seguimiento de publicaciones","skill":"Analítica","days_before":-5,"optional":true}]'),
('Contenido para blog o SEO', 'Artículo de blog o contenido web optimizado',
 '{blog,seo,artículo,"contenido web",keywords}', 'SEO', 2,
 '[{"title":"Investigación de palabras clave","skill":"SEO","days_before":6,"optional":false},
   {"title":"Redacción del artículo","skill":"Copywriting","days_before":4,"optional":false},
   {"title":"Imágenes","skill":"Diseño gráfico","days_before":2,"optional":false},
   {"title":"Publicación y optimización","skill":"SEO","days_before":0,"optional":false},
   {"title":"Difusión en redes","skill":"Redes sociales","days_before":-1,"optional":true}]'),
('Tarea simple', 'Una sola tarea, sin subtareas', '{}', null, 2, '[]');

-- Lo que el admin enseñó al confirmar: "en esta plantilla, esta habilidad va a esta persona".
create table public.plan_preferences (
  template_id uuid not null references public.plan_templates (id) on delete cascade,
  skill text not null,
  member_id uuid not null references public.team_members (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (template_id, skill)
);

-- proposal: {title, description, main_skill, assignee_id, recommended_id, reason, due_date, priority,
--            effort_points, subtasks: [{title, skill, assignee_id, recommended_id, due_date, include,
--            reason, template_index}]}
create table public.plan_recommendations (
  id uuid primary key default gen_random_uuid(),
  list_item_id uuid not null references public.list_items (id) on delete cascade,
  template_id uuid references public.plan_templates (id) on delete set null,
  status text not null default 'borrador' check (status in ('borrador', 'afinada', 'confirmada', 'descartada')),
  refined_by_ai boolean not null default false,
  proposal jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plan_recommendations_one_open
  on public.plan_recommendations (list_item_id) where status in ('borrador', 'afinada');

-- ============================================================
-- Actividad (feed de Hoy)
-- ============================================================

create table public.activity_log (
  id bigint generated always as identity primary key,
  kind text not null,
  actor text not null,
  message text not null,
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on public.activity_log (created_at desc);

create function public.log_activity(p_kind text, p_message text, p_task uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into public.activity_log (kind, actor, message, task_id)
  values (p_kind, public.actor_label(), p_message, p_task)
$$;

-- ============================================================
-- Carga: tareas (puntos) + subtareas abiertas de otras personas (1 punto c/u)
-- ============================================================

drop view public.member_load;
create view public.member_load with (security_invoker = true) as
select
  m.id, m.name, m.email, m.specialties, m.capacity_points, m.is_admin, m.active, m.available,
  (coalesce(t.pts, 0) + coalesce(s.cnt, 0))::int as open_points,
  coalesce(t.cnt, 0)::int as open_tasks,
  round((coalesce(t.pts, 0) + coalesce(s.cnt, 0))::numeric / m.capacity_points, 2) as load_ratio,
  m.skill_levels,
  coalesce(s.cnt, 0)::int as open_subtasks
from public.team_members m
left join lateral (
  select sum(effort_points) as pts, count(*) as cnt from public.tasks
  where coalesce(assignee_id, suggested_assignee_id) = m.id and status in ('por_hacer', 'en_curso')
) t on true
left join lateral (
  select count(*) as cnt from public.subtasks st join public.tasks tk on tk.id = st.task_id
  where st.assignee_id = m.id and not st.done and tk.status <> 'hecho'
    and coalesce(tk.assignee_id, tk.suggested_assignee_id) is distinct from m.id
) s on true;

-- ============================================================
-- Recomendación de responsable
-- ============================================================

create function public.level_label(p_level int) returns text
language sql immutable as $$
  select case p_level when 3 then 'avanzado' when 2 then 'intermedio' else 'básico' end
$$;

-- Orden: regla aprendida (por texto) → preferencia del admin en la plantilla →
-- quien tenga la habilidad (más nivel, menos carga, evitando saturados) → menor carga.
create function public.recommend_member(p_skill text, p_template uuid, p_text text)
returns table (member_id uuid, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_threshold numeric := (select saturation_threshold from public.settings where id = 1);
  r record;
begin
  if p_text is not null then
    select ar.member_id as mid, ar.keyword into r
    from public.assignment_rules ar join public.team_members m on m.id = ar.member_id
    where ar.active and m.active and m.available and position(ar.keyword in lower(p_text)) > 0
    order by length(ar.keyword) desc limit 1;
    if found then
      return query select r.mid, format('Regla aprendida: "%s"', r.keyword);
      return;
    end if;
  end if;

  if p_template is not null and p_skill is not null then
    select pp.member_id as mid, l.load_ratio into r
    from public.plan_preferences pp join public.member_load l on l.id = pp.member_id
    where pp.template_id = p_template and pp.skill = p_skill and l.active and l.available;
    if found then
      return query select r.mid, format('Tu preferencia para %s en esta plantilla · carga %s%%', p_skill, round(r.load_ratio * 100));
      return;
    end if;
  end if;

  if p_skill is not null then
    select l.id as mid, l.load_ratio, (l.skill_levels ->> p_skill)::int as lvl into r
    from public.member_load l
    where l.active and l.available and l.skill_levels ? p_skill
    order by (l.load_ratio >= v_threshold), (l.skill_levels ->> p_skill)::int desc, l.load_ratio, l.open_tasks
    limit 1;
    if found then
      return query select r.mid, format('%s nivel %s · carga %s%%%s', p_skill, public.level_label(r.lvl),
        round(r.load_ratio * 100), case when r.load_ratio >= v_threshold then ' · saturado' else '' end);
      return;
    end if;
  end if;

  select l.id as mid, l.load_ratio into r
  from public.member_load l where l.active and l.available
  order by l.load_ratio, l.open_tasks limit 1;
  if found then
    return query select r.mid, case when p_skill is null
      then format('Tarea general · menor carga (%s%%)', round(r.load_ratio * 100))
      else format('Nadie tiene %s · menor carga (%s%%)', p_skill, round(r.load_ratio * 100)) end;
  end if;
end
$$;

-- Arma la recomendación al instante (sin IA). El planificador (Claude) la afina después.
create function public.draft_plan(p_item_id uuid, p_template_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  it public.list_items%rowtype;
  tpl public.plan_templates%rowtype;
  v_text text;
  v_due date;
  v_main record;
  v_sub record;
  x jsonb;
  i int;
  subs jsonb := '[]'::jsonb;
  v_id uuid;
begin
  perform public.require_admin_or_agent();
  select * into it from public.list_items where id = p_item_id;
  if not found then raise exception 'El pendiente no existe'; end if;
  if it.status = 'planificado' then raise exception 'Este pendiente ya es una tarea'; end if;
  v_text := lower(it.title || ' ' || coalesce(it.notes, ''));

  if p_template_id is not null then
    select * into tpl from public.plan_templates where id = p_template_id;
    if not found then raise exception 'La plantilla no existe'; end if;
  else
    select t.* into tpl from public.plan_templates t
    where exists (select 1 from unnest(t.keywords) k where position(lower(k) in v_text) > 0)
    order by (select count(*) from unnest(t.keywords) k where position(lower(k) in v_text) > 0) desc,
             t.usage_count desc
    limit 1;
    if not found then
      select * into tpl from public.plan_templates where name = 'Tarea simple';
    end if;
  end if;

  v_due := greatest(coalesce(it.due_date, current_date + 14), current_date);
  select * into v_main from public.recommend_member(tpl.main_skill, tpl.id, v_text);

  i := 0;
  for x in select value from jsonb_array_elements(tpl.items) loop
    select * into v_sub from public.recommend_member(x ->> 'skill', tpl.id, null);
    subs := subs || jsonb_build_array(jsonb_build_object(
      'title', x ->> 'title',
      'skill', x ->> 'skill',
      'assignee_id', v_sub.member_id,
      'recommended_id', v_sub.member_id,
      'reason', v_sub.reason,
      'due_date', greatest(current_date, v_due - coalesce((x ->> 'days_before')::int, 0)),
      'include', not coalesce((x ->> 'optional')::boolean, false),
      'template_index', i));
    i := i + 1;
  end loop;

  update public.plan_recommendations set status = 'descartada', updated_at = now()
  where list_item_id = p_item_id and status in ('borrador', 'afinada');

  insert into public.plan_recommendations (list_item_id, template_id, proposal)
  values (p_item_id, tpl.id, jsonb_build_object(
    'title', it.title,
    'description', it.notes,
    'main_skill', tpl.main_skill,
    'assignee_id', v_main.member_id,
    'recommended_id', v_main.member_id,
    'reason', v_main.reason,
    'due_date', v_due,
    'priority', coalesce(it.priority, 'P2'),
    'effort_points', tpl.effort_points,
    'subtasks', subs))
  returning id into v_id;

  update public.list_items set status = 'planificando', updated_at = now() where id = p_item_id;
  return v_id;
end
$$;

-- El planificador reemplaza la propuesta con su versión adaptada al pendiente.
create function public.refine_plan(p_rec_id uuid, p_proposal jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  rec public.plan_recommendations%rowtype;
  v jsonb := p_proposal;
  subs jsonb := '[]'::jsonb;
  x jsonb;
begin
  perform public.require_admin_or_agent();
  select * into rec from public.plan_recommendations where id = p_rec_id;
  if not found or rec.status <> 'borrador' then
    raise exception 'La recomendación no existe o ya no es un borrador';
  end if;
  if jsonb_typeof(v -> 'subtasks') is distinct from 'array' then
    raise exception 'La propuesta necesita una lista de subtareas';
  end if;
  -- Responsables inválidos quedan vacíos para que el admin decida.
  if not exists (select 1 from public.team_members where id = (v ->> 'assignee_id')::uuid and active) then
    v := v || jsonb_build_object('assignee_id', null);
  end if;
  v := v || jsonb_build_object('recommended_id', v -> 'assignee_id');
  for x in select value from jsonb_array_elements(v -> 'subtasks') loop
    if not exists (select 1 from public.team_members where id = (x ->> 'assignee_id')::uuid and active) then
      x := x || jsonb_build_object('assignee_id', null);
    end if;
    subs := subs || jsonb_build_array(x || jsonb_build_object('recommended_id', x -> 'assignee_id'));
  end loop;
  v := v || jsonb_build_object('subtasks', subs);

  update public.plan_recommendations
  set proposal = v, refined_by_ai = true, status = 'afinada', updated_at = now()
  where id = p_rec_id;
  perform public.log_activity('plan', format('afinó el plan de "%s"', v ->> 'title'));
end
$$;

-- El admin confirma (con sus cambios). Crea la tarea y las subtareas; si p_remember, la plantilla aprende.
create function public.confirm_plan(p_rec_id uuid, p_proposal jsonb, p_remember boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rec public.plan_recommendations%rowtype;
  it public.list_items%rowtype;
  tpl public.plan_templates%rowtype;
  p jsonb := p_proposal;
  x jsonb;
  v_assignee uuid := nullif(p ->> 'assignee_id', '')::uuid;
  v_recommended uuid := nullif(p ->> 'recommended_id', '')::uuid;
  v_due date := (p ->> 'due_date')::date;
  v_task uuid;
  v_items jsonb;
  v_pos int := 0;
  v_count int := 0;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede confirmar planes'; end if;
  select * into rec from public.plan_recommendations where id = p_rec_id;
  if not found or rec.status not in ('borrador', 'afinada') then
    raise exception 'Esta recomendación ya no está abierta';
  end if;
  select * into it from public.list_items where id = rec.list_item_id;
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'La tarea necesita un título'; end if;
  if v_assignee is null or not exists (select 1 from public.team_members where id = v_assignee and active) then
    raise exception 'Elige un responsable principal';
  end if;
  if v_due is null then raise exception 'Pon una fecha límite'; end if;

  insert into public.tasks (title, description, specialty, effort_points, priority, due_date, assignee_id,
                            list_item_id, email_id, source)
  values (trim(p ->> 'title'), nullif(p ->> 'description', ''), nullif(p ->> 'main_skill', ''),
          coalesce((p ->> 'effort_points')::int, 2), coalesce(p ->> 'priority', 'P2'), v_due, v_assignee,
          it.id, it.email_id, case when it.email_id is null then 'manual' else 'correo' end)
  returning id into v_task;

  update public.tasks
  set assignment_mode = case when v_assignee = v_recommended then 'aprobada' else 'corregida' end,
      assignment_reason = case when v_assignee = v_recommended then coalesce(p ->> 'reason', 'Recomendación aprobada')
                               else 'Elegido por ' || public.actor_label() end
  where id = v_task;

  for x in select value from jsonb_array_elements(coalesce(p -> 'subtasks', '[]'::jsonb)) loop
    if coalesce((x ->> 'include')::boolean, true) and coalesce(trim(x ->> 'title'), '') <> '' then
      insert into public.subtasks (task_id, title, skill, assignee_id, due_date, position)
      values (v_task, trim(x ->> 'title'), nullif(x ->> 'skill', ''),
              (select id from public.team_members where id = nullif(x ->> 'assignee_id', '')::uuid and active),
              (x ->> 'due_date')::date, v_pos);
      v_pos := v_pos + 1;
      v_count := v_count + 1;
    end if;
  end loop;

  update public.list_items set status = 'planificado', task_id = v_task, updated_at = now() where id = it.id;
  update public.plan_recommendations set status = 'confirmada', proposal = p, updated_at = now() where id = rec.id;

  if rec.template_id is not null then
    select * into tpl from public.plan_templates where id = rec.template_id;
    v_items := tpl.items;
    if p_remember then
      for x in select value from jsonb_array_elements(coalesce(p -> 'subtasks', '[]'::jsonb)) loop
        if x ? 'template_index' and (x ->> 'template_index') is not null
           and (x ->> 'template_index')::int < jsonb_array_length(v_items) then
          v_items := jsonb_set(v_items, array[x ->> 'template_index'],
            (v_items -> (x ->> 'template_index')::int)
              || jsonb_build_object('optional', not coalesce((x ->> 'include')::boolean, true)));
        elsif coalesce((x ->> 'include')::boolean, true) and coalesce(trim(x ->> 'title'), '') <> ''
              and tpl.name <> 'Tarea simple' then
          v_items := v_items || jsonb_build_array(jsonb_build_object(
            'title', trim(x ->> 'title'), 'skill', nullif(x ->> 'skill', ''),
            'days_before', coalesce(v_due - (x ->> 'due_date')::date, 0), 'optional', false));
        end if;
        if coalesce((x ->> 'include')::boolean, true) and nullif(x ->> 'skill', '') is not null
           and nullif(x ->> 'assignee_id', '') is not null
           and (x ->> 'assignee_id') is distinct from (x ->> 'recommended_id') then
          insert into public.plan_preferences (template_id, skill, member_id)
          values (tpl.id, x ->> 'skill', (x ->> 'assignee_id')::uuid)
          on conflict (template_id, skill) do update set member_id = excluded.member_id, updated_at = now();
        end if;
      end loop;
      if nullif(p ->> 'main_skill', '') is not null and v_assignee is distinct from v_recommended then
        insert into public.plan_preferences (template_id, skill, member_id)
        values (tpl.id, p ->> 'main_skill', v_assignee)
        on conflict (template_id, skill) do update set member_id = excluded.member_id, updated_at = now();
      end if;
    end if;
    update public.plan_templates set items = v_items, usage_count = usage_count + 1, updated_at = now()
    where id = tpl.id;
  end if;

  perform public.log_activity('plan', format('asignó "%s" a %s%s', trim(p ->> 'title'),
    (select name from public.team_members where id = v_assignee),
    case when v_count > 0 then format(' con %s subtareas', v_count) else '' end), v_task);
  return v_task;
end
$$;

create function public.discard_plan(p_rec_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item uuid;
begin
  if not public.is_admin() then raise exception 'Solo un administrador puede descartar planes'; end if;
  update public.plan_recommendations set status = 'descartada', updated_at = now()
  where id = p_rec_id and status in ('borrador', 'afinada')
  returning list_item_id into v_item;
  update public.list_items set status = 'sin_planificar', updated_at = now()
  where id = v_item and status = 'planificando';
end
$$;

-- El agente de correos crea pendientes en "Desde correos" y deja listo el borrador del plan.
create function public.create_item_from_email(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email uuid;
  v_list uuid := (select id from public.lists where is_inbox);
  v_id uuid;
begin
  perform public.require_admin_or_agent();
  select id into v_email from public.emails where gmail_message_id = p ->> 'gmail_message_id';
  if v_email is null then raise exception 'Primero registra el correo con ingest_email'; end if;
  select id into v_id from public.list_items where email_id = v_email and lower(title) = lower(p ->> 'title');
  if v_id is not null then return v_id; end if;

  insert into public.list_items (list_id, title, notes, priority, due_date, email_id)
  values (v_list, trim(p ->> 'title'), nullif(p ->> 'notes', ''), nullif(p ->> 'priority', ''),
          (p ->> 'due_date')::date, v_email)
  returning id into v_id;
  perform public.draft_plan(v_id, null);
  return v_id;
end
$$;

-- ============================================================
-- Reglas de edición (triggers) y actividad automática
-- ============================================================

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Tareas: el equipo solo cambia el estado; el resto (título, fechas, prioridad…) lo cambia el admin.
create function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() is not null and not public.is_admin()
     and (new.title, new.description, new.priority, new.effort_points, new.due_date, new.specialty)
         is distinct from (old.title, old.description, old.priority, old.effort_points, old.due_date, old.specialty) then
    raise exception 'Solo el administrador puede editar la tarea; tú puedes cambiar su estado';
  end if;
  if new.status = 'hecho' and old.status <> 'hecho' then new.completed_at := now();
  elsif new.status <> 'hecho' then new.completed_at := null;
  end if;
  return new;
end
$$;
create trigger tasks_guard before update on public.tasks
for each row execute function public.tasks_guard();

create function public.tasks_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.log_activity('estado', format('%s "%s"',
      case new.status when 'hecho' then 'completó' when 'en_curso' then 'empezó' else 'volvió a por hacer' end,
      new.title), new.id);
  end if;
  return null;
end
$$;
create trigger tasks_activity after update of status on public.tasks
for each row execute function public.tasks_activity();

create function public.assignment_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_title text := (select title from public.tasks where id = new.task_id);
  v_name text := (select name from public.team_members where id = new.member_id);
begin
  if new.mode = 'sugerida' then
    perform public.log_activity('sugerencia', format('sugirió a %s para "%s"', coalesce(v_name, 'nadie'), v_title), new.task_id);
  elsif new.mode = 'corregida' then
    perform public.log_activity('correccion', format('pasó "%s" a %s', v_title, v_name), new.task_id);
  elsif new.mode = 'auto' then
    perform public.log_activity('asignacion', format('asignó "%s" a %s', v_title, v_name), new.task_id);
  end if;
  return null;
end
$$;
create trigger assignment_activity after insert on public.assignment_log
for each row execute function public.assignment_activity();

-- Subtareas: el equipo solo marca hechas las suyas (o las de una tarea suya).
create function public.subtasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if auth.jwt() is not null and not public.is_admin() then
    if (new.task_id, new.title, new.skill, new.assignee_id, new.due_date, new.position)
       is distinct from (old.task_id, old.title, old.skill, old.assignee_id, old.due_date, old.position) then
      raise exception 'Solo el administrador puede editar subtareas; tú puedes marcarlas como hechas';
    end if;
    select coalesce(assignee_id, suggested_assignee_id) into v_owner from public.tasks where id = old.task_id;
    if public.current_member_id() is distinct from old.assignee_id and public.current_member_id() is distinct from v_owner then
      raise exception 'Solo puedes marcar tus propias subtareas';
    end if;
  end if;
  if new.done and not old.done then new.done_at := now();
  elsif not new.done then new.done_at := null;
  end if;
  return new;
end
$$;
create trigger subtasks_guard before update on public.subtasks
for each row execute function public.subtasks_guard();

create function public.subtasks_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.done and not old.done then
    perform public.log_activity('subtarea', format('completó la subtarea "%s"', new.title), new.task_id);
  end if;
  return null;
end
$$;
create trigger subtasks_activity after update of done on public.subtasks
for each row execute function public.subtasks_activity();

-- Pendientes: quien lo crea puede editarlo mientras no esté planificado; el estado lo maneja el admin.
create function public.list_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.current_member_id());
    return new;
  end if;
  new.updated_at := now();
  if auth.jwt() is not null and not public.is_admin() then
    if old.created_by is distinct from public.current_member_id() or old.status <> 'sin_planificar'
       or new.status is distinct from old.status or new.list_id is distinct from old.list_id then
      raise exception 'Solo puedes editar tus pendientes mientras no estén planificados';
    end if;
  end if;
  return new;
end
$$;
create trigger list_items_guard before insert or update on public.list_items
for each row execute function public.list_items_guard();

create function public.list_items_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity('pendiente', format('agregó "%s" a %s', new.title,
    (select name from public.lists where id = new.list_id)));
  return null;
end
$$;
create trigger list_items_activity after insert on public.list_items
for each row execute function public.list_items_activity();

create trigger plan_templates_touch before update on public.plan_templates
for each row execute function public.touch_updated_at();

-- ============================================================
-- Configuración estructurada de prioridades → texto que lee el agente
-- ============================================================

alter table public.agent_priorities add column config jsonb;

create function public.render_priorities(c jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare
  v_lines int := case c -> 'summary' ->> 'length' when 'corto' then 3 when 'detallado' then 12 else 6 end;
  inc jsonb := coalesce(c -> 'summary' -> 'include', '{}'::jsonb);
  labels jsonb := '{"p1":"Qué responder primero (P1), con remitente y motivo","p2":"Pendientes de la semana (P2)","tasks":"Pendientes y planes nuevos y a quién se recomendaron","load":"Carga del equipo (quién está saturado)","junk":"Cuánta basura filtró el script","suspicious":"Correos sospechosos"}'::jsonb;
  k text;
  yes text := '';
  no text := '';
  bullets text;
begin
  for k in select jsonb_object_keys(labels) loop
    if coalesce((inc ->> k)::boolean, true) then yes := yes || E'\n- ' || (labels ->> k);
    else no := no || E'\n- ' || (labels ->> k);
    end if;
  end loop;
  bullets := '## Temas que son P1' || coalesce((select string_agg(E'\n- ' || x, '') from jsonb_array_elements_text(c -> 'p1') x), E'\n- (ninguno)')
    || E'\n\n## Temas que son P2' || coalesce((select string_agg(E'\n- ' || x, '') from jsonb_array_elements_text(c -> 'p2') x), E'\n- (ninguno)')
    || E'\n\n## Basura: nunca P1/P2, solo contar' || coalesce((select string_agg(E'\n- ' || x, '') from jsonb_array_elements_text(c -> 'junk') x), E'\n- (ninguno)')
    || E'\n\n## Categorías que uso\n' || coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(c -> 'categories') x), 'Otros')
    || E'\n\n## Cuándo crear pendientes para el equipo\n' || coalesce(nullif(trim(c ->> 'create_items'), ''), '(sin indicaciones)');
  if nullif(trim(c ->> 'notes'), '') is not null then
    bullets := bullets || E'\n\n## Notas adicionales\n' || trim(c ->> 'notes');
  end if;
  return bullets || E'\n\n## Formato del resumen\n'
    || format('Máximo %s líneas, en español, empezando por lo más urgente.', v_lines)
    || E'\nIncluye:' || coalesce(nullif(yes, ''), E'\n- (nada)')
    || case when no <> '' then E'\nNo incluyas:' || no else '' end || E'\n';
end
$$;

create function public.priorities_render_trigger() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.config is not null then
    new.content := public.render_priorities(new.config);
  end if;
  return new;
end
$$;
create trigger agent_priorities_render before insert or update of config on public.agent_priorities
for each row execute function public.priorities_render_trigger();

update public.agent_priorities set config = jsonb_build_object(
  'p1', jsonb_build_array('Pagos, facturas vencidas, bancos que piden acción', 'Contratos o documentos para firmar',
                          'Clientes que piden respuesta con fecha límite hoy o mañana'),
  'p2', jsonb_build_array('Feedback que espera el equipo', 'Hilos con más de 2 días sin mi respuesta', 'Cotizaciones y propuestas'),
  'junk', jsonb_build_array('Promociones', 'Newsletters que no leo', 'Notificaciones automáticas de apps'),
  'categories', jsonb_build_array('Clientes', 'Equipo', 'Finanzas', 'Proveedores', 'Legal', 'Newsletters',
                                  'Promociones', 'Notificaciones', 'Otros'),
  'create_items', 'Cuando el correo pide un trabajo de marketing que puede hacer el equipo (campañas, piezas, contenido, eventos, reportes). No crear pendientes para correos que solo requieren mi respuesta.',
  'notes', '',
  'summary', jsonb_build_object('length', 'normal', 'include', jsonb_build_object(
    'p1', true, 'p2', true, 'tasks', true, 'load', true, 'junk', false, 'suspicious', true)))
where id = 1;

-- ============================================================
-- Seguridad
-- ============================================================

alter table public.skills enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.subtasks enable row level security;
alter table public.plan_templates enable row level security;
alter table public.plan_preferences enable row level security;
alter table public.plan_recommendations enable row level security;
alter table public.activity_log enable row level security;

revoke all on public.skills, public.lists, public.list_items, public.subtasks, public.plan_templates,
  public.plan_preferences, public.plan_recommendations, public.activity_log from anon;

create policy skills_select on public.skills for select to authenticated using (public.is_member());
create policy skills_admin on public.skills for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy lists_select on public.lists for select to authenticated using (public.is_member());
create policy lists_admin on public.lists for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy items_select on public.list_items for select to authenticated using (public.is_member());
create policy items_insert on public.list_items for insert to authenticated with check (public.is_member());
create policy items_update on public.list_items for update to authenticated using (public.is_member()) with check (public.is_member());
create policy items_delete on public.list_items for delete to authenticated
  using (public.is_admin() or (created_by = public.current_member_id() and status = 'sin_planificar'));
revoke insert, update on public.list_items from authenticated;
grant insert (list_id, title, notes, priority, due_date) on public.list_items to authenticated;
grant update (list_id, title, notes, priority, due_date, status) on public.list_items to authenticated;

create policy subtasks_select on public.subtasks for select to authenticated using (public.is_member());
create policy subtasks_admin_write on public.subtasks for insert to authenticated with check (public.is_admin());
create policy subtasks_update on public.subtasks for update to authenticated using (public.is_member()) with check (public.is_member());
create policy subtasks_delete on public.subtasks for delete to authenticated using (public.is_admin());

create policy templates_select on public.plan_templates for select to authenticated using (public.is_member());
create policy templates_admin on public.plan_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy prefs_admin on public.plan_preferences for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy recs_admin on public.plan_recommendations for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.plan_recommendations from authenticated;

create policy activity_select on public.activity_log for select to authenticated using (public.is_member());
revoke insert, update, delete on public.activity_log from authenticated;

-- Solo el admin crea tareas directamente; el equipo crea pendientes.
drop policy tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_admin());

revoke execute on function public.log_activity(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.recommend_member(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.refine_plan(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.create_item_from_email(jsonb) from public, anon, authenticated;
revoke execute on function public.render_priorities(jsonb) from public, anon;
revoke execute on function public.draft_plan(uuid, uuid) from public, anon;
revoke execute on function public.confirm_plan(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.discard_plan(uuid) from public, anon;
grant execute on function public.draft_plan(uuid, uuid) to authenticated;
grant execute on function public.confirm_plan(uuid, jsonb, boolean) to authenticated;
grant execute on function public.discard_plan(uuid) to authenticated;

alter publication supabase_realtime add table public.list_items, public.subtasks, public.activity_log;
