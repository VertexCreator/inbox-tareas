-- Cargos y permisos.
-- El gerente define cargos (Coordinador, Especialista, Diseñador…) con permisos por defecto, le da un cargo a cada
-- persona y puede ajustar los permisos de cada una. El gerente (administrador) siempre puede todo.
--
-- Permisos:
--   asignar_a               a quién puede asignar: 'todos', 'companeros' (no a gerentes) o 'solo_yo'
--                           (o una lista personalizada por persona, en assignment_permissions)
--   ser_responsable         puede ser responsable de iniciativas (= team_members.can_own)
--   repartir                asignar y planificar lo que está "Por planificar"
--   editar_iniciativas      editar iniciativas de otros (nombre, fechas, responsable, marcas, subtareas)
--   cambiar_etapas          cambiar la etapa de cualquier iniciativa
--   eliminar_iniciativas    eliminar iniciativas de otros (las propias siempre)
--   repetitivas_para_otros  programar tareas repetitivas para otras personas
--   duplicar                duplicar iniciativas para otra marca
--   mi_correo               conectar su Gmail (Mi correo)
--   analisis_agente         pedir análisis al agente (= team_members.ai_analysis_allowed)

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  description text,
  permissions jsonb not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.roles (name, description, position, permissions) values
  ('Coordinador', 'Reparte el trabajo y sigue el avance del equipo.', 0,
   '{"asignar_a":"todos","ser_responsable":true,"repartir":true,"editar_iniciativas":true,"cambiar_etapas":true,
     "eliminar_iniciativas":false,"repetitivas_para_otros":true,"duplicar":true,"mi_correo":true,"analisis_agente":false}'),
  ('Especialista', 'Ejecuta iniciativas de su área y coordina con sus compañeros.', 1,
   '{"asignar_a":"companeros","ser_responsable":true,"repartir":false,"editar_iniciativas":false,"cambiar_etapas":false,
     "eliminar_iniciativas":false,"repetitivas_para_otros":false,"duplicar":true,"mi_correo":true,"analisis_agente":false}'),
  ('Diseñador', 'Produce las piezas que le asignan.', 2,
   '{"asignar_a":"solo_yo","ser_responsable":true,"repartir":false,"editar_iniciativas":false,"cambiar_etapas":false,
     "eliminar_iniciativas":false,"repetitivas_para_otros":false,"duplicar":true,"mi_correo":true,"analisis_agente":false}');

alter table public.team_members
  add column role_id uuid references public.roles (id) on delete set null,
  add column job_title text,
  add column perm_overrides jsonb not null default '{}',
  add column assign_custom boolean not null default false;

-- Los que ya tenían una lista de a quién asignar la conservan.
update public.team_members m set assign_custom = true
where exists (select 1 from public.assignment_permissions p where p.member_id = m.id);

-- Valor de un permiso: el ajuste de la persona; si no, el de su cargo; si no tiene cargo, lo de siempre.
create function public.perm_default(p_key text) returns jsonb
language sql immutable as $$
  select case p_key
    when 'asignar_a' then '"companeros"'::jsonb
    when 'duplicar' then 'true'::jsonb
    when 'mi_correo' then 'true'::jsonb
    else 'false'::jsonb end;
$$;

create function public.effective_perm(m public.team_members, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when m.is_admin then case when p_key = 'asignar_a' then '"todos"'::jsonb else 'true'::jsonb end
    else coalesce(m.perm_overrides -> p_key,
                  (select r.permissions -> p_key from public.roles r where r.id = m.role_id),
                  public.perm_default(p_key)) end;
$$;

create function public.has_perm(p_member uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.effective_perm(m, p_key) = 'true'::jsonb from public.team_members m where m.id = p_member and m.active), false);
$$;

-- Todos los permisos efectivos de la persona que usa el dashboard (para mostrar u ocultar botones).
create function public.my_permissions() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'admin', m.is_admin,
    'role', (select name from public.roles where id = m.role_id),
    'asignar_a', case when m.assign_custom and not m.is_admin then '"personalizado"'::jsonb else public.effective_perm(m, 'asignar_a') end,
    'ser_responsable', public.effective_perm(m, 'ser_responsable'),
    'repartir', public.effective_perm(m, 'repartir'),
    'editar_iniciativas', public.effective_perm(m, 'editar_iniciativas'),
    'cambiar_etapas', public.effective_perm(m, 'cambiar_etapas'),
    'eliminar_iniciativas', public.effective_perm(m, 'eliminar_iniciativas'),
    'repetitivas_para_otros', public.effective_perm(m, 'repetitivas_para_otros'),
    'duplicar', public.effective_perm(m, 'duplicar'),
    'mi_correo', public.effective_perm(m, 'mi_correo'),
    'analisis_agente', public.effective_perm(m, 'analisis_agente'))
  from public.team_members m where m.id = public.current_member_id();
$$;

-- A quién puede asignar: a sí mismo siempre; el gerente a cualquiera; los demás según su lista personalizada o su cargo.
create or replace function public.can_assign(p_from uuid, p_to uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_from = p_to or coalesce((
    select case
      when m.is_admin then true
      when m.assign_custom then exists (select 1 from public.assignment_permissions where member_id = p_from and target_id = p_to)
      else case public.effective_perm(m, 'asignar_a') #>> '{}'
        when 'todos' then exists (select 1 from public.team_members where id = p_to and active)
        when 'companeros' then exists (select 1 from public.team_members where id = p_to and active and not is_admin)
        else false end end
    from public.team_members m where m.id = p_from and m.active), false);
$$;

create or replace function public.set_assignment_permissions(p_member uuid, p_targets uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el gerente define estos permisos'; end if;
  delete from public.assignment_permissions where member_id = p_member;
  insert into public.assignment_permissions (member_id, target_id)
  select p_member, t from unnest(coalesce(p_targets, '{}')) t
  where t <> p_member and exists (select 1 from public.team_members where id = t)
  on conflict do nothing;
  update public.team_members set assign_custom = true where id = p_member;
end
$$;

-- Volver a lo que dice el cargo (para "a quién asigna" o para todos los permisos).
create function public.reset_member_permissions(p_member uuid, p_key text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el gerente define estos permisos'; end if;
  if p_key is null or p_key = 'asignar_a' then
    delete from public.assignment_permissions where member_id = p_member;
    update public.team_members set assign_custom = false where id = p_member;
  end if;
  update public.team_members set perm_overrides = case when p_key is null then '{}'::jsonb else perm_overrides - p_key end
  where id = p_member;
end
$$;

-- Las columnas que ya usaba todo el sistema (can_own, ai_analysis_allowed) se mantienen al día con el cargo.
-- Si el gerente las cambia directo (en Editar), queda como ajuste de esa persona.
create function public.team_members_sync_perms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.perm_overrides is not distinct from old.perm_overrides and new.role_id is not distinct from old.role_id then
    if new.can_own is distinct from old.can_own then
      new.perm_overrides := new.perm_overrides || jsonb_build_object('ser_responsable', new.can_own);
    end if;
    if new.ai_analysis_allowed is distinct from old.ai_analysis_allowed then
      new.perm_overrides := new.perm_overrides || jsonb_build_object('analisis_agente', new.ai_analysis_allowed);
    end if;
  end if;
  if new.is_admin then
    new.can_own := true;
  else
    new.can_own := public.effective_perm(new, 'ser_responsable') = 'true'::jsonb;
    new.ai_analysis_allowed := public.effective_perm(new, 'analisis_agente') = 'true'::jsonb;
  end if;
  return new;
end
$$;
create trigger team_members_sync_perms before insert or update on public.team_members
for each row execute function public.team_members_sync_perms();

-- Al cambiar los permisos de un cargo, se aplican a quienes lo tienen.
create function public.roles_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.team_members set role_id = role_id where role_id = new.id;
  return null;
end
$$;
create trigger roles_apply after update of permissions on public.roles
for each row execute function public.roles_apply();

-- Quienes reparten ven las recomendaciones de plan.
drop policy recs_admin on public.plan_recommendations;
create policy recs_select on public.plan_recommendations for select to authenticated
  using (public.has_perm(public.current_member_id(), 'repartir'));

create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('teamflow.trusted', true) = 'on' then return new; end if;
  if auth.role() = 'authenticated' and not public.is_admin() then
    if not public.has_perm(public.current_member_id(), 'editar_iniciativas') and (new.title, new.description, new.priority, new.effort_points, new.due_date, new.specialty, new.brand_id, new.brand_ids, new.agency_id)
       is distinct from (old.title, old.description, old.priority, old.effort_points, old.due_date, old.specialty, old.brand_id, old.brand_ids, old.agency_id) then
      raise exception 'Tu cargo no incluye editar iniciativas: puedes cambiar la etapa y la observación de las tuyas';
    end if;
    if (new.status, new.sticker_id, new.observation) is distinct from (old.status, old.sticker_id, old.observation)
       and public.current_member_id() is distinct from coalesce(old.assignee_id, old.suggested_assignee_id)
       and not public.has_perm(public.current_member_id(), 'cambiar_etapas') then
      raise exception 'Tu cargo no incluye cambiar la etapa de iniciativas de otros';
    end if;
    if new.assignee_id is distinct from old.assignee_id and not public.has_perm(public.current_member_id(), 'editar_iniciativas') then
      raise exception 'Tu cargo no incluye cambiar el responsable de una iniciativa';
    end if;
    if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null
       and not public.can_assign(public.current_member_id(), new.assignee_id) then
      raise exception 'No tienes permiso para asignarle tareas a %', (select name from public.team_members where id = new.assignee_id);
    end if;
  end if;
  return new;
end
$$;

create or replace function public.subtasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('teamflow.trusted', true) = 'on' then
    null;
  elsif auth.jwt() is not null and not public.is_admin() and not public.is_task_owner(old.task_id)
     and not public.has_perm(public.current_member_id(), 'editar_iniciativas') then
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
  -- Lo llama el agente (sin sesión), quien reparte, o otra función que ya validó (por ejemplo, crear desde un correo).
  if auth.jwt() is not null and coalesce(current_setting('teamflow.trusted', true), '') <> 'on'
     and not public.has_perm(public.current_member_id(), 'repartir') then
    raise exception 'Tu cargo no incluye repartir lo que está por planificar';
  end if;
  perform set_config('teamflow.trusted', 'on', true);
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
  v_brands uuid[];
begin
  if not public.has_perm(public.current_member_id(), 'repartir') then raise exception 'Tu cargo no incluye repartir lo que está por planificar'; end if;
  perform set_config('teamflow.trusted', 'on', true);
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
  if not public.can_assign(public.current_member_id(), v_assignee) then
    raise exception 'No tienes permiso para asignarle tareas a %', (select name from public.team_members where id = v_assignee);
  end if;
  -- Marcas: las que trae el plan (multimarca) o, si solo cambió la principal, esa; si no, las del pendiente.
  v_brands := case when p ? 'brand_ids' then public.brand_id_array(p -> 'brand_ids')
                   when nullif(p ->> 'brand_id', '')::uuid is distinct from it.brand_id
                     then array_remove(array[nullif(p ->> 'brand_id', '')::uuid], null)
                   else it.brand_ids end;

  insert into public.tasks (title, description, specialty, effort_points, priority, due_date, assignee_id,
                            list_item_id, email_id, source, brand_id, brand_ids)
  values (trim(p ->> 'title'), nullif(p ->> 'description', ''), nullif(p ->> 'main_skill', ''),
          coalesce((p ->> 'effort_points')::int, 2), coalesce(p ->> 'priority', 'P2'), v_due, v_assignee,
          it.id, it.email_id, case when it.email_id is null then 'manual' else 'correo' end,
          v_brands[1], v_brands)
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

create or replace function public.discard_plan(p_rec_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item uuid;
begin
  if not public.has_perm(public.current_member_id(), 'repartir') then raise exception 'Tu cargo no incluye repartir lo que está por planificar'; end if;
  perform set_config('teamflow.trusted', 'on', true);
  update public.plan_recommendations set status = 'descartada', updated_at = now()
  where id = p_rec_id and status in ('borrador', 'afinada')
  returning list_item_id into v_item;
  update public.list_items set status = 'sin_planificar', updated_at = now()
  where id = v_item and status = 'planificando';
end
$$;

create or replace function public.assign_item(p_item_id uuid, p_assignee uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  it public.list_items%rowtype;
  v_task uuid;
begin
  if not public.has_perm(public.current_member_id(), 'repartir') then raise exception 'Tu cargo no incluye repartir lo que está por planificar'; end if;
  if not public.can_assign(public.current_member_id(), p_assignee) then
    raise exception 'No tienes permiso para asignarle tareas a %', (select name from public.team_members where id = p_assignee);
  end if;
  select * into it from public.list_items where id = p_item_id;
  if not found then raise exception 'No existe'; end if;
  if it.task_id is not null then raise exception 'Ya es una iniciativa'; end if;
  perform set_config('teamflow.trusted', 'on', true);
  insert into public.tasks (title, description, brand_id, brand_ids, agency_id, assignee_id, due_date, priority,
                            list_item_id, email_id, source, assignment_mode, assignment_reason, created_by_member)
  values (it.title, it.notes, it.brand_ids[1], it.brand_ids, it.agency_id, p_assignee, it.due_date,
          coalesce(it.priority, 'P2'), it.id, it.email_id, case when it.email_id is null then 'manual' else 'correo' end,
          'manual', 'Asignada por ' || public.actor_label(), public.current_member_id())
  returning id into v_task;
  update public.list_items set status = 'planificado', task_id = v_task, updated_at = now() where id = it.id;
  update public.plan_recommendations set status = 'descartada', updated_at = now()
  where list_item_id = it.id and status in ('borrador', 'afinada');
  perform public.log_activity('asignacion', format('asignó "%s" a %s', it.title,
    (select name from public.team_members where id = p_assignee)), v_task);
  return v_task;
end
$$;

create or replace function public.delete_task(p_task_id uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  v_id bigint;
begin
  select * into t from public.tasks where id = p_task_id;
  if not found then raise exception 'La iniciativa no existe'; end if;
  if not (public.has_perm(public.current_member_id(), 'eliminar_iniciativas') or coalesce(t.created_by_member = public.current_member_id(), false)) then
    raise exception 'Solo quien la creó o quien tenga permiso de eliminar iniciativas puede eliminarla';
  end if;
  insert into public.trash (task, subtasks, deleted_by)
  values (to_jsonb(t), coalesce((select jsonb_agg(to_jsonb(s) order by s.position) from public.subtasks s where s.task_id = t.id), '[]'),
          public.current_member_id())
  returning id into v_id;
  perform set_config('teamflow.trusted', 'on', true);
  delete from public.tasks where id = t.id;
  -- Si venía de algo por planificar, ese pedido queda descartado (no vuelve a la columna).
  update public.list_items set status = 'descartado', updated_at = now() where id = t.list_item_id;
  perform public.log_activity('estado', format('eliminó "%s"', t.title));
  delete from public.trash where deleted_at < now() - interval '1 day';
  return v_id;
end
$$;

create or replace function public.duplicate_task(p_task_id uuid, p_brand_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  v_me uuid := public.current_member_id();
  v_old text[];
  b public.brands%rowtype;
  v_title text;
  v_new uuid;
  v_ids uuid[] := '{}';
  v_names text[] := '{}';
  v_assignee uuid;
begin
  if v_me is null then raise exception 'No perteneces al equipo'; end if;
  if not public.has_perm(v_me, 'duplicar') then raise exception 'Tu cargo no incluye duplicar iniciativas'; end if;
  select * into t from public.tasks where id = p_task_id;
  if not found then raise exception 'La iniciativa no existe'; end if;
  if coalesce(cardinality(p_brand_ids), 0) = 0 then raise exception 'Elige al menos una marca'; end if;
  if cardinality(p_brand_ids) > 10 then raise exception 'Máximo 10 marcas a la vez'; end if;

  v_old := array(select name from public.brands where id = any (t.brand_ids));
  -- El responsable se conserva si sigue autorizado; si no, la copia queda sin responsable.
  v_assignee := (select id from public.team_members where id = t.assignee_id and active and can_own);

  for b in select * from public.brands where id = any (p_brand_ids) and not archived order by array_position(p_brand_ids, id) loop
    v_title := public.swap_brand_names(t.title, v_old, b.name);
    if v_title = t.title then v_title := t.title || ' · ' || b.name; end if;

    insert into public.tasks (title, description, specialty, effort_points, priority, due_date, assignee_id,
                              suggested_assignee_id, needs_approval, agency_id, brand_id, brand_ids, source,
                              assignment_mode, assignment_reason, duplicated_from, created_by_member)
    values (v_title, public.swap_brand_names(t.description, v_old, b.name), t.specialty, t.effort_points, t.priority,
            t.due_date, v_assignee, case when v_assignee is null then t.suggested_assignee_id end,
            v_assignee is null and t.suggested_assignee_id is not null, t.agency_id, b.id, array[b.id], 'manual',
            'manual', format('Duplicada de "%s"', t.title), t.id, v_me)
    returning id into v_new;

    insert into public.subtasks (task_id, title, skill, assignee_id, due_date, position)
    select v_new, public.swap_brand_names(s.title, v_old, b.name), s.skill,
           (select id from public.team_members where id = s.assignee_id and active), s.due_date, s.position
    from public.subtasks s where s.task_id = t.id order by s.position;

    v_ids := v_ids || v_new;
    v_names := v_names || b.name;
  end loop;

  if cardinality(v_ids) = 0 then raise exception 'Esas marcas no están activas'; end if;
  perform public.log_activity('plan', format('duplicó "%s" para %s', t.title, array_to_string(v_names, ', ')), v_ids[1]);
  return v_ids;
end
$$;

create or replace function public.save_recurring_task(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_member_id();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_assignee uuid;
  v_freq text := p ->> 'frequency';
  v_weekdays int[] := coalesce(array(select (x)::int from jsonb_array_elements_text(coalesce(p -> 'weekdays', '[]'::jsonb)) x), '{}');
  v_start date := coalesce(nullif(p ->> 'start_date', '')::date, public.team_today());
  r public.recurring_tasks%rowtype;
begin
  if v_me is null then raise exception 'No perteneces al equipo'; end if;
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'Escribe el nombre de la tarea'; end if;
  if v_freq not in ('diaria', 'semanal', 'quincenal', 'mensual') then raise exception 'Elige cada cuánto se repite'; end if;
  if v_freq = 'semanal' and cardinality(v_weekdays) = 0 then v_weekdays := array[extract(isodow from v_start)::int]; end if;
  if exists (select 1 from unnest(v_weekdays) w where w not between 1 and 7) then raise exception 'Día de la semana inválido'; end if;
  if nullif(p ->> 'end_date', '')::date < v_start then raise exception 'La fecha final es anterior al inicio'; end if;

  v_assignee := case when public.has_perm(v_me, 'repetitivas_para_otros') then coalesce(nullif(p ->> 'assignee_id', '')::uuid, v_me) else v_me end;
  if not public.can_assign(v_me, v_assignee) then
    raise exception 'No tienes permiso para asignarle tareas a %', (select name from public.team_members where id = v_assignee);
  end if;
  if not exists (select 1 from public.team_members where id = v_assignee and active) then raise exception 'Esa persona no está activa'; end if;

  if v_id is null then
    insert into public.recurring_tasks (title, description, brand_ids, agency_id, assignee_id, created_by, frequency, weekdays,
                                        workdays_only, start_date, end_date, next_date, due_offset, priority, effort_points, subtasks)
    values (trim(p ->> 'title'), nullif(trim(p ->> 'description'), ''), public.brand_id_array(p -> 'brand_ids'),
            nullif(p ->> 'agency_id', '')::uuid, v_assignee, v_me, v_freq, v_weekdays,
            coalesce((p ->> 'workdays_only')::boolean, false), v_start, nullif(p ->> 'end_date', '')::date, v_start,
            coalesce((p ->> 'due_offset')::int, 0), coalesce(nullif(p ->> 'priority', ''), 'P2'),
            coalesce((p ->> 'effort_points')::int, 1),
            coalesce(array(select trim(x) from jsonb_array_elements_text(coalesce(p -> 'subtasks', '[]'::jsonb)) x where trim(x) <> ''), '{}'))
    returning id into v_id;
    perform public.log_activity('recurrente', format('programó la tarea repetitiva "%s"', trim(p ->> 'title')));
  else
    if not public.can_edit_recurring(v_id) then raise exception 'Solo quien la programó, su responsable o el gerente pueden editarla'; end if;
    update public.recurring_tasks set
      title = trim(p ->> 'title'), description = nullif(trim(p ->> 'description'), ''),
      brand_ids = public.brand_id_array(p -> 'brand_ids'), agency_id = nullif(p ->> 'agency_id', '')::uuid,
      assignee_id = case when public.has_perm(v_me, 'repetitivas_para_otros') then v_assignee else assignee_id end,
      frequency = v_freq, weekdays = v_weekdays, workdays_only = coalesce((p ->> 'workdays_only')::boolean, false),
      start_date = v_start, end_date = nullif(p ->> 'end_date', '')::date,
      due_offset = coalesce((p ->> 'due_offset')::int, 0), priority = coalesce(nullif(p ->> 'priority', ''), 'P2'),
      effort_points = coalesce((p ->> 'effort_points')::int, 1),
      subtasks = coalesce(array(select trim(x) from jsonb_array_elements_text(coalesce(p -> 'subtasks', '[]'::jsonb)) x where trim(x) <> ''), '{}'),
      active = true, updated_at = now()
    where id = v_id;
  end if;

  -- La próxima fecha: desde hoy (o desde el inicio, si es futuro), sin repetir la de hoy si ya se creó.
  select * into r from public.recurring_tasks where id = v_id;
  update public.recurring_tasks
  set next_date = coalesce(public.next_occurrence(r, case when r.last_generated >= public.team_today() then public.team_today() + 1 else public.team_today() end), r.start_date)
  where id = v_id;
  perform public.generate_recurring_tasks(v_id);
  return v_id;
end
$$;

create or replace function public.my_gmail_connection() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.current_member_id();
  b public.member_mailboxes%rowtype;
begin
  if v_member is null then raise exception 'No perteneces al equipo'; end if;
  if not public.has_perm(v_member, 'mi_correo') then raise exception 'Tu cargo no incluye Mi correo'; end if;
  insert into public.member_mailboxes (member_id) values (v_member) on conflict (member_id) do nothing;
  select * into b from public.member_mailboxes where member_id = v_member;
  return jsonb_build_object('token', b.token, 'created_at', b.created_at, 'last_ingest_at', b.last_ingest_at,
                            'last_forward_check', b.last_forward_check, 'last_count', b.last_count, 'last_junk', b.last_junk);
end
$$;

create or replace function public.member_enqueue_emails(p_token text, p_emails jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.member_by_token(p_token);
  e jsonb;
  c jsonb;
  n int;
  v_new int := 0;
  v_junk int := 0;
  v_brands uuid[];
begin
  if not public.has_perm(v_member, 'mi_correo') then raise exception 'Tu cargo no incluye Mi correo: el gerente lo desactivó'; end if;
  if jsonb_typeof(p_emails) <> 'array' or jsonb_array_length(p_emails) > 200 then
    raise exception 'Se esperaba una lista de hasta 200 correos';
  end if;
  for e in select value from jsonb_array_elements(p_emails) loop
    if coalesce(e ->> 'gmail_message_id', '') = '' then continue; end if;
    if coalesce((e ->> 'junk')::boolean, false) then
      insert into public.emails (gmail_message_id, gmail_thread_id, from_name, from_email, subject, category, priority,
                                 needs_reply, received_at, owner_member_id)
      values (e ->> 'gmail_message_id', e ->> 'gmail_thread_id', left(e ->> 'from_name', 200), left(e ->> 'from_email', 200),
              left(e ->> 'subject', 300), coalesce(e ->> 'junk_category', 'Promociones'), 'ninguna', false,
              (e ->> 'received_at')::timestamptz, v_member)
      on conflict (gmail_message_id) do nothing;
      get diagnostics n = row_count;
      v_junk := v_junk + n;
    else
      c := public.classify_member_email(v_member, e);
      v_brands := public.resolve_brands(jsonb_build_object('brands', coalesce(e -> 'brands_mentioned', '[]'::jsonb)));
      insert into public.emails (gmail_message_id, gmail_thread_id, from_name, from_email, subject, summary, category,
                                 priority, needs_reply, reply_by, received_at, brand_id, brand_ids, mentioned, addressed,
                                 owner_member_id, body_preview)
      values (e ->> 'gmail_message_id', e ->> 'gmail_thread_id', left(e ->> 'from_name', 200), left(e ->> 'from_email', 200),
              left(e ->> 'subject', 300), c ->> 'summary', 'otros', c ->> 'priority', (c ->> 'needs_reply')::boolean,
              (c ->> 'reply_by')::date, (e ->> 'received_at')::timestamptz, v_brands[1], v_brands,
              coalesce((e ->> 'mentioned')::boolean, false), nullif(e ->> 'addressed', ''), v_member, left(e ->> 'body', 6000))
      on conflict (gmail_message_id) do nothing;
      get diagnostics n = row_count;
      v_new := v_new + n;
    end if;
  end loop;
  update public.member_mailboxes set last_ingest_at = now(), last_count = v_new, last_junk = v_junk where member_id = v_member;
  return jsonb_build_object('nuevos', v_new, 'basura', v_junk);
end
$$;

alter table public.roles enable row level security;
revoke all on public.roles from anon;
create policy roles_select on public.roles for select to authenticated using (public.is_member());
create policy roles_admin on public.roles for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.roles to authenticated;

alter publication supabase_realtime add table public.roles;
-- Para que el cambio de cargo o de permisos le llegue a la persona sin recargar (respeta la RLS de team_members).
alter publication supabase_realtime add table public.team_members;

revoke execute on function public.perm_default(text), public.effective_perm(public.team_members, text),
  public.team_members_sync_perms(), public.roles_apply() from public, anon, authenticated;
revoke execute on function public.has_perm(uuid, text), public.my_permissions(), public.reset_member_permissions(uuid, text) from public, anon;
grant execute on function public.has_perm(uuid, text), public.my_permissions(), public.reset_member_permissions(uuid, text) to authenticated;

-- Cargos del equipo hoy.
-- Lo que ya estaba habilitado a mano (responsable, análisis del agente) se conserva como ajuste de la persona.
update public.team_members m
set role_id = r.id,
    job_title = case when m.email = 'fzuccaro@dimassicorp.com' then 'Coordinadora de contenido' else m.job_title end,
    perm_overrides = m.perm_overrides
      || case when m.can_own is distinct from (r.permissions ->> 'ser_responsable')::boolean and not m.is_admin
              then jsonb_build_object('ser_responsable', m.can_own) else '{}'::jsonb end
      || case when m.ai_analysis_allowed is distinct from (r.permissions ->> 'analisis_agente')::boolean and not m.is_admin
              then jsonb_build_object('analisis_agente', m.ai_analysis_allowed) else '{}'::jsonb end
from public.roles r
where r.name = case m.email when 'kquintero@dimassicorp.com' then 'Especialista'
                            when 'asanchez@dimassicorp.com' then 'Especialista'
                            when 'fzuccaro@dimassicorp.com' then 'Coordinador' end;

-- El dashboard muestra el cargo de cada persona.
create or replace view public.member_load with (security_invoker = true) as
select m.id, m.name, m.email, m.specialties, m.capacity_points, m.is_admin, m.active, m.available,
       (coalesce(t.pts, 0) + coalesce(s.cnt, 0))::int as open_points,
       coalesce(t.cnt, 0)::int as open_tasks,
       round((coalesce(t.pts, 0) + coalesce(s.cnt, 0))::numeric / m.capacity_points, 2) as load_ratio,
       m.skill_levels,
       coalesce(s.cnt, 0)::int as open_subtasks,
       m.can_own,
       m.ai_analysis_allowed,
       m.role_id,
       m.job_title,
       m.perm_overrides,
       m.assign_custom
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

-- Quien reparte también puede descartar o mover lo que está por planificar.
create or replace function public.list_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.current_member_id());
    return new;
  end if;
  new.updated_at := now();
  if current_setting('teamflow.trusted', true) = 'on' then return new; end if;
  if auth.role() = 'authenticated' and not public.is_admin() and not public.has_perm(public.current_member_id(), 'repartir') then
    if old.created_by is distinct from public.current_member_id() or old.status <> 'sin_planificar'
       or new.status is distinct from old.status or new.list_id is distinct from old.list_id then
      raise exception 'Solo puedes editar tus pendientes mientras no estén planificados';
    end if;
  end if;
  return new;
end
$$;
