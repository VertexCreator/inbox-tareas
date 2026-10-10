-- Marcas, stickers de estatus, responsables autorizados, observaciones e iniciativas (= tareas).

-- ============================================================
-- Marcas y stickers
-- ============================================================

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  color text not null default 'violet',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- category decide cómo cuenta el sticker: abierto / en_curso (carga), terminado (progreso), cancelado (no cuenta).
create table public.status_stickers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  color text not null default 'gray',
  category text not null check (category in ('abierto', 'en_curso', 'terminado', 'cancelado')),
  position int not null default 0,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now()
);
insert into public.status_stickers (name, color, category, position) values
  ('Por revisar', 'gray', 'abierto', 0),
  ('En proceso', 'blue', 'en_curso', 1),
  ('Falta información', 'amber', 'en_curso', 2),
  ('En diseño', 'violet', 'en_curso', 3),
  ('Revisión de presupuesto', 'orange', 'en_curso', 4),
  ('Listo', 'green', 'terminado', 5),
  ('Publicada', 'aqua', 'terminado', 6),
  ('Por pagar', 'magenta', 'terminado', 7),
  ('Cancelado', 'red', 'cancelado', 8);

-- ============================================================
-- Responsables autorizados, iniciativas con marca, sticker y observación
-- ============================================================

alter table public.team_members add column can_own boolean not null default false;
update public.team_members set can_own = true where is_admin;

alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('por_hacer', 'en_curso', 'hecho', 'cancelado'));
alter table public.tasks
  add column brand_id uuid references public.brands (id) on delete set null,
  add column sticker_id uuid references public.status_stickers (id) on delete set null,
  add column observation text,
  add column observation_at timestamptz,
  add column observation_by text;
create index tasks_brand_idx on public.tasks (brand_id);

update public.tasks t set sticker_id = (
  select id from public.status_stickers s where s.name =
    case t.status when 'hecho' then 'Listo' when 'en_curso' then 'En proceso' else 'Por revisar' end);

alter table public.list_items add column brand_id uuid references public.brands (id) on delete set null;

-- Sticker y estado van juntos: el sticker manda; si cambia solo el estado (casilla, flechas), se elige el sticker.
create function public.tasks_sticker_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cat text;
begin
  if tg_op = 'INSERT' and new.sticker_id is null then
    new.sticker_id := (select id from public.status_stickers where category =
      case new.status when 'hecho' then 'terminado' when 'en_curso' then 'en_curso' when 'cancelado' then 'cancelado' else 'abierto' end
      order by position limit 1);
  end if;
  if tg_op = 'INSERT' or new.sticker_id is distinct from old.sticker_id then
    select category into v_cat from public.status_stickers where id = new.sticker_id;
    if v_cat is not null then
      new.status := case v_cat when 'terminado' then 'hecho' when 'en_curso' then 'en_curso'
                                when 'cancelado' then 'cancelado' else 'por_hacer' end;
    end if;
  elsif new.status is distinct from old.status then
    new.sticker_id := (select id from public.status_stickers where category =
      case new.status when 'hecho' then 'terminado' when 'en_curso' then 'en_curso' when 'cancelado' then 'cancelado' else 'abierto' end
      order by position limit 1);
  end if;
  if tg_op = 'UPDATE' and new.observation is distinct from old.observation then
    new.observation := nullif(trim(new.observation), '');
    new.observation_at := case when new.observation is null then null else now() end;
    new.observation_by := case when new.observation is null then null else public.actor_label() end;
  end if;
  -- Va aquí (y no en tasks_guard) porque el estado recién queda sincronizado con el sticker.
  if new.status = 'hecho' and (tg_op = 'INSERT' or old.status <> 'hecho') then new.completed_at := now();
  elsif new.status <> 'hecho' then new.completed_at := null;
  end if;
  return new;
end
$$;
create trigger tasks_sticker_sync before insert or update on public.tasks
for each row execute function public.tasks_sticker_sync();

-- Responsable: solo personas autorizadas por el gerente.
create function public.tasks_owner_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from public.team_members where id = new.assignee_id and can_own and active) then
    raise exception '% no está autorizado como responsable de iniciativas',
      coalesce((select name from public.team_members where id = new.assignee_id), 'Esa persona');
  end if;
  return new;
end
$$;
create trigger tasks_owner_check before insert or update of assignee_id on public.tasks
for each row execute function public.tasks_owner_check();

-- Edición: el admin todo; el responsable cambia sticker/estado y observación; el resto solo mira.
create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() is not null and not public.is_admin() then
    if (new.title, new.description, new.priority, new.effort_points, new.due_date, new.specialty, new.brand_id)
       is distinct from (old.title, old.description, old.priority, old.effort_points, old.due_date, old.specialty, old.brand_id) then
      raise exception 'Solo el gerente puede editar la iniciativa; tú puedes cambiar su estatus y la observación';
    end if;
    if (new.status, new.sticker_id, new.observation) is distinct from (old.status, old.sticker_id, old.observation)
       and public.current_member_id() is distinct from coalesce(old.assignee_id, old.suggested_assignee_id) then
      raise exception 'Solo el responsable o el gerente pueden cambiar el estatus o la observación';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.tasks_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sticker_id is distinct from old.sticker_id then
    perform public.log_activity('estado', format('movió "%s" a %s', new.title,
      (select name from public.status_stickers where id = new.sticker_id)), new.id);
  end if;
  if new.observation is distinct from old.observation and new.observation is not null then
    perform public.log_activity('observacion', format('dejó una observación en "%s"', new.title), new.id);
  end if;
  return null;
end
$$;
drop trigger tasks_activity on public.tasks;
create trigger tasks_activity after update of sticker_id, observation on public.tasks
for each row execute function public.tasks_activity();

grant update (sticker_id, observation, brand_id, assignee_id) on public.tasks to authenticated;
grant insert (brand_id, sticker_id, observation) on public.tasks to authenticated;
grant insert (brand_id) on public.list_items to authenticated;
grant update (brand_id) on public.list_items to authenticated;

-- ============================================================
-- Subtareas: el responsable de la iniciativa también las crea y edita.
-- ============================================================

create function public.is_task_owner(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks where id = p_task
                 and coalesce(assignee_id, suggested_assignee_id) = public.current_member_id())
$$;

drop policy subtasks_admin_write on public.subtasks;
create policy subtasks_insert on public.subtasks for insert to authenticated
  with check (public.is_admin() or public.is_task_owner(task_id));
drop policy subtasks_delete on public.subtasks;
create policy subtasks_delete on public.subtasks for delete to authenticated
  using (public.is_admin() or public.is_task_owner(task_id));
grant insert (task_id, title, skill, assignee_id, due_date, position) on public.subtasks to authenticated;
grant update (title, skill, assignee_id, due_date, done, position) on public.subtasks to authenticated;

create or replace function public.subtasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() is not null and not public.is_admin() and not public.is_task_owner(old.task_id) then
    if (new.task_id, new.title, new.skill, new.assignee_id, new.due_date, new.position)
       is distinct from (old.task_id, old.title, old.skill, old.assignee_id, old.due_date, old.position) then
      raise exception 'Solo el responsable de la iniciativa o el gerente pueden editar subtareas';
    end if;
    if public.current_member_id() is distinct from old.assignee_id then
      raise exception 'Solo puedes marcar tus propias subtareas';
    end if;
  end if;
  if new.done and not old.done then new.done_at := now();
  elsif not new.done then new.done_at := null;
  end if;
  return new;
end
$$;

create function public.subtasks_insert_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.jwt() is not null then
    perform public.log_activity('subtarea', format('agregó la subtarea "%s" a "%s"', new.title,
      (select title from public.tasks where id = new.task_id)), new.task_id);
  end if;
  return null;
end
$$;
create trigger subtasks_insert_activity after insert on public.subtasks
for each row execute function public.subtasks_insert_activity();

-- ============================================================
-- Carga: los cancelados no cuentan (ya se filtraba por por_hacer/en_curso); se expone can_own.
-- ============================================================

drop view public.member_load;
create view public.member_load with (security_invoker = true) as
select
  m.id, m.name, m.email, m.specialties, m.capacity_points, m.is_admin, m.active, m.available,
  (coalesce(t.pts, 0) + coalesce(s.cnt, 0))::int as open_points,
  coalesce(t.cnt, 0)::int as open_tasks,
  round((coalesce(t.pts, 0) + coalesce(s.cnt, 0))::numeric / m.capacity_points, 2) as load_ratio,
  m.skill_levels,
  coalesce(s.cnt, 0)::int as open_subtasks,
  m.can_own
from public.team_members m
left join lateral (
  select sum(effort_points) as pts, count(*) as cnt from public.tasks
  where coalesce(assignee_id, suggested_assignee_id) = m.id and status in ('por_hacer', 'en_curso')
) t on true
left join lateral (
  select count(*) as cnt from public.subtasks st join public.tasks tk on tk.id = st.task_id
  where st.assignee_id = m.id and not st.done and tk.status in ('por_hacer', 'en_curso')
    and coalesce(tk.assignee_id, tk.suggested_assignee_id) is distinct from m.id
) s on true;

-- ============================================================
-- Recomendación: el responsable principal debe estar autorizado
-- ============================================================

drop function public.recommend_member(text, uuid, text);
create function public.recommend_member(p_skill text, p_template uuid, p_text text, p_owner boolean)
returns table (member_id uuid, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_threshold numeric := (select saturation_threshold from public.settings where id = 1);
  r record;
begin
  if p_text is not null then
    select ar.member_id as mid, ar.keyword into r
    from public.assignment_rules ar join public.team_members m on m.id = ar.member_id
    where ar.active and m.active and m.available and (not p_owner or m.can_own) and position(ar.keyword in lower(p_text)) > 0
    order by length(ar.keyword) desc limit 1;
    if found then
      return query select r.mid, format('Regla aprendida: "%s"', r.keyword);
      return;
    end if;
  end if;

  if p_template is not null and p_skill is not null then
    select pp.member_id as mid, l.load_ratio into r
    from public.plan_preferences pp join public.member_load l on l.id = pp.member_id
    where pp.template_id = p_template and pp.skill = p_skill and l.active and l.available and (not p_owner or l.can_own);
    if found then
      return query select r.mid, format('Tu preferencia para %s en esta plantilla · carga %s%%', p_skill, round(r.load_ratio * 100));
      return;
    end if;
  end if;

  if p_skill is not null then
    select l.id as mid, l.load_ratio, (l.skill_levels ->> p_skill)::int as lvl into r
    from public.member_load l
    where l.active and l.available and (not p_owner or l.can_own) and l.skill_levels ? p_skill
    order by (l.load_ratio >= v_threshold), (l.skill_levels ->> p_skill)::int desc, l.load_ratio, l.open_tasks
    limit 1;
    if found then
      return query select r.mid, format('%s nivel %s · carga %s%%%s', p_skill, public.level_label(r.lvl),
        round(r.load_ratio * 100), case when r.load_ratio >= v_threshold then ' · saturado' else '' end);
    else
      return query select null::uuid, case when p_owner
        then format('Ningún responsable autorizado tiene %s · elige tú', p_skill)
        else format('Nadie del equipo tiene %s · elige tú', p_skill) end;
    end if;
    return;
  end if;

  select l.id as mid, l.load_ratio into r
  from public.member_load l where l.active and l.available and (not p_owner or l.can_own)
  order by l.is_admin, l.load_ratio, l.open_tasks limit 1;
  if found then
    return query select r.mid, format('Tarea general · menor carga (%s%%)', round(r.load_ratio * 100));
  end if;
end
$$;

create or replace function public.route_task(p_task_id uuid) returns void
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
  where r.active and m.active and m.available and m.can_own and position(r.keyword in v_text) > 0
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
    where l.active and l.available and l.can_own
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
    where l.active and l.available and l.can_own
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

create or replace function public.draft_plan(p_item_id uuid, p_template_id uuid default null) returns uuid
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
    select * into tpl from public.plan_templates where id = public.pick_template(it.title, it.notes);
    if not found then
      select * into tpl from public.plan_templates where name = 'Tarea simple';
    end if;
  end if;

  v_due := greatest(coalesce(it.due_date, current_date + 14), current_date);
  select * into v_main from public.recommend_member(tpl.main_skill, tpl.id, v_text, true);

  i := 0;
  for x in select value from jsonb_array_elements(tpl.items) loop
    select * into v_sub from public.recommend_member(x ->> 'skill', tpl.id, null, false);
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
    'brand_id', it.brand_id,
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

create or replace function public.confirm_plan(p_rec_id uuid, p_proposal jsonb, p_remember boolean default false)
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
                            list_item_id, email_id, source, brand_id)
  values (trim(p ->> 'title'), nullif(p ->> 'description', ''), nullif(p ->> 'main_skill', ''),
          coalesce((p ->> 'effort_points')::int, 2), coalesce(p ->> 'priority', 'P2'), v_due, v_assignee,
          it.id, it.email_id, case when it.email_id is null then 'manual' else 'correo' end,
          coalesce(nullif(p ->> 'brand_id', '')::uuid, it.brand_id))
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

create or replace function public.create_item_from_email(p jsonb) returns uuid
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

  insert into public.list_items (list_id, title, notes, priority, due_date, email_id, brand_id)
  values (v_list, trim(p ->> 'title'), nullif(p ->> 'notes', ''), nullif(p ->> 'priority', ''),
          (p ->> 'due_date')::date, v_email,
          (select id from public.brands where lower(name) = lower(trim(p ->> 'brand')) and not archived limit 1))
  returning id into v_id;
  perform public.draft_plan(v_id, null);
  return v_id;
end
$$;

-- ============================================================
-- Seguridad
-- ============================================================

alter table public.brands enable row level security;
alter table public.status_stickers enable row level security;
revoke all on public.brands, public.status_stickers from anon;
create policy brands_select on public.brands for select to authenticated using (public.is_member());
create policy brands_admin on public.brands for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy stickers_select on public.status_stickers for select to authenticated using (public.is_member());
create policy stickers_insert on public.status_stickers for insert to authenticated with check (public.is_member());
create policy stickers_update on public.status_stickers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy stickers_delete on public.status_stickers for delete to authenticated using (public.is_admin());
revoke insert on public.status_stickers from authenticated;
grant insert (name, color, category, position) on public.status_stickers to authenticated;

create function public.stickers_set_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by := public.current_member_id();
  return new;
end
$$;
create trigger stickers_set_creator before insert on public.status_stickers
for each row execute function public.stickers_set_creator();

revoke execute on function public.recommend_member(text, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.tasks_sticker_sync(), public.tasks_owner_check(), public.subtasks_insert_activity(),
  public.stickers_set_creator() from public, anon, authenticated;
grant execute on function public.is_task_owner(uuid) to authenticated;
revoke execute on function public.is_task_owner(uuid) from anon;

alter publication supabase_realtime add table public.brands, public.status_stickers;
