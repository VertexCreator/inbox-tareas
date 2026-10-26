-- Quién puede asignar tareas a quién, asignar de un clic lo que está por planificar y eliminar iniciativas.
-- 1. El gerente decide, persona por persona, a quién le puede asignar tareas cada miembro (incluido el gerente).
--    Cada quien siempre puede asignarse a sí mismo. Al empezar, cada miembro puede asignar a cualquier
--    compañero excepto a los gerentes (lo mismo que hasta hoy).
-- 2. "Asignar a…": el gerente convierte algo por planificar en iniciativa sin armar el plan completo.
-- 3. Eliminar una iniciativa (el gerente o quien la creó), con papelera de 30 minutos para deshacer.

create table public.assignment_permissions (
  member_id uuid not null references public.team_members (id) on delete cascade,
  target_id uuid not null references public.team_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, target_id),
  check (member_id <> target_id)
);

insert into public.assignment_permissions (member_id, target_id)
select m.id, t.id from public.team_members m, public.team_members t
where m.active and not m.is_admin and t.active and not t.is_admin and m.id <> t.id
on conflict do nothing;

create function public.can_assign(p_from uuid, p_to uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_from = p_to
      or exists (select 1 from public.team_members where id = p_from and is_admin and active)
      or exists (select 1 from public.assignment_permissions where member_id = p_from and target_id = p_to);
$$;

-- El gerente define a quién puede asignar cada persona (reemplaza la lista completa).
create function public.set_assignment_permissions(p_member uuid, p_targets uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el gerente define estos permisos'; end if;
  delete from public.assignment_permissions where member_id = p_member;
  insert into public.assignment_permissions (member_id, target_id)
  select p_member, t from unnest(coalesce(p_targets, '{}')) t
  where t <> p_member and exists (select 1 from public.team_members where id = t)
  on conflict do nothing;
end
$$;

-- Asignar de un clic algo por planificar: queda como iniciativa con ese responsable, sin subtareas.
create function public.assign_item(p_item_id uuid, p_assignee uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  it public.list_items%rowtype;
  v_task uuid;
begin
  if not public.is_admin() then raise exception 'Solo el gerente asigna lo que está por planificar'; end if;
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

-- Papelera: lo eliminado se guarda 30 minutos para poder deshacer.
create table public.trash (
  id bigint generated always as identity primary key,
  task jsonb not null,
  subtasks jsonb not null default '[]',
  deleted_by uuid references public.team_members (id) on delete set null,
  deleted_at timestamptz not null default now()
);

create function public.delete_task(p_task_id uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
  v_id bigint;
begin
  select * into t from public.tasks where id = p_task_id;
  if not found then raise exception 'La iniciativa no existe'; end if;
  if not (public.is_admin() or t.created_by_member = public.current_member_id()) then
    raise exception 'Solo el gerente o quien la creó pueden eliminarla';
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

create function public.restore_task(p_trash_id bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.trash%rowtype;
  v_task uuid;
begin
  select * into r from public.trash where id = p_trash_id;
  if not found or r.deleted_at < now() - interval '30 minutes' then raise exception 'Ya no se puede deshacer'; end if;
  if not (public.is_admin() or r.deleted_by = public.current_member_id()) then raise exception 'Solo quien la eliminó puede deshacerlo'; end if;
  perform set_config('teamflow.trusted', 'on', true);
  insert into public.tasks select * from jsonb_populate_record(null::public.tasks, r.task) returning id into v_task;
  insert into public.subtasks select * from jsonb_populate_recordset(null::public.subtasks, r.subtasks);
  update public.list_items set status = 'planificado', task_id = v_task, updated_at = now() where id = (r.task ->> 'list_item_id')::uuid;
  -- Restaurar no vuelve a reenviar el correo (ya se había enviado antes de eliminarla).
  delete from public.email_forwards where task_id = v_task and status = 'pendiente';
  delete from public.trash where id = r.id;
  return v_task;
end
$$;

create or replace function public.create_initiative(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  x jsonb;
  v_pos int := 0;
  v_me uuid := public.current_member_id();
  v_admin boolean := public.is_admin();
  v_assignee uuid := nullif(p ->> 'assignee_id', '')::uuid;
begin
  if v_me is null then raise exception 'No perteneces al equipo'; end if;
  -- Un miembro crea iniciativas para sí o para quienes el gerente le autorizó.
  if not v_admin then
    v_assignee := coalesce(v_assignee, v_me);
    if not public.can_assign(v_me, v_assignee) then
      raise exception 'No tienes permiso para asignarle tareas a %', (select name from public.team_members where id = v_assignee);
    end if;
  end if;
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'La iniciativa necesita un nombre'; end if;

  insert into public.tasks (title, description, brand_id, brand_ids, assignee_id, due_date, sticker_id, priority, effort_points, specialty, source, created_by_member)
  values (trim(p ->> 'title'), nullif(trim(p ->> 'description'), ''), nullif(p ->> 'brand_id', '')::uuid,
          public.brand_id_array(p -> 'brand_ids'),
          v_assignee, nullif(p ->> 'due_date', '')::date,
          nullif(p ->> 'sticker_id', '')::uuid, coalesce(nullif(p ->> 'priority', ''), 'P2'),
          coalesce((p ->> 'effort_points')::int, 2), nullif(p ->> 'specialty', ''), 'manual', v_me)
  returning id into v_id;

  -- Buscar en Gmail el correo relacionado (salvo que el gerente lo desactive).
  if v_admin and coalesce((p ->> 'search_email')::boolean, true) then
    perform public.request_email_search(v_id, null, nullif(trim(p ->> 'search_query'), ''));
  end if;

  for x in select value from jsonb_array_elements(coalesce(p -> 'subtasks', '[]'::jsonb)) loop
    if coalesce(trim(x ->> 'title'), '') <> '' then
      if not v_admin and nullif(x ->> 'assignee_id', '') is not null and not public.can_assign(v_me, (x ->> 'assignee_id')::uuid) then
        raise exception 'No tienes permiso para asignarle subtareas a %', (select name from public.team_members where id = (x ->> 'assignee_id')::uuid);
      end if;
      insert into public.subtasks (task_id, title, assignee_id, due_date, position)
      values (v_id, trim(x ->> 'title'),
              (select id from public.team_members where id = nullif(x ->> 'assignee_id', '')::uuid and active),
              nullif(x ->> 'due_date', '')::date, v_pos);
      v_pos := v_pos + 1;
    end if;
  end loop;
  return v_id;
end
$$;

create or replace function public.create_from_email(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email public.emails%rowtype;
  v_list uuid := (select id from public.lists where is_inbox);
  v_item uuid;
  v_task uuid;
  v_owner uuid := nullif(p ->> 'assignee_id', '')::uuid;
  v_title text := trim(coalesce(p ->> 'title', ''));
  x jsonb;
  v_pos int := 0;
  v_count int := 0;
begin
  select * into v_email from public.emails where id = (p ->> 'email_id')::uuid;
  if not found then raise exception 'El correo no existe'; end if;
  -- El gerente crea desde su bandeja; cada miembro, desde la suya.
  if not ((public.is_admin() and v_email.owner_member_id is null) or v_email.owner_member_id = public.current_member_id()) then
    raise exception 'Solo puedes crear tareas desde tu propio correo';
  end if;
  -- Esta función valida todo: las reglas de edición del equipo no aplican a lo que hace aquí.
  perform set_config('teamflow.trusted', 'on', true);
  if not public.is_admin() then
    if v_owner is not null and not public.can_assign(public.current_member_id(), v_owner) then
      raise exception 'No tienes permiso para asignarle tareas a %', (select name from public.team_members where id = v_owner);
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(p -> 'subtasks', '[]'::jsonb)) x
               where coalesce((x ->> 'include')::boolean, true) and nullif(x ->> 'assignee_id', '') is not null
                 and not public.can_assign(public.current_member_id(), (x ->> 'assignee_id')::uuid)) then
      raise exception 'Hay subtareas para personas a las que no tienes permiso de asignar';
    end if;
  end if;
  if v_title = '' then raise exception 'Escribe un título'; end if;

  insert into public.list_items (list_id, title, notes, priority, due_date, email_id, brand_id, brand_ids, suggested_brand)
  values (v_list, v_title, nullif(trim(p ->> 'description'), ''), nullif(p ->> 'priority', ''),
          nullif(p ->> 'due_date', '')::date, v_email.id, nullif(p ->> 'brand_id', '')::uuid,
          public.brand_id_array(p -> 'brand_ids'),
          case when nullif(p ->> 'brand_id', '') is null and coalesce(jsonb_array_length(p -> 'brand_ids'), 0) = 0
               then v_email.suggested_brand end)
  returning id into v_item;

  if coalesce(p ->> 'mode', 'asignar') = 'planificar' then
    perform public.draft_plan(v_item, nullif(p ->> 'template_id', '')::uuid);
  else
    insert into public.tasks (title, description, brand_id, brand_ids, assignee_id, due_date, sticker_id, priority,
                              effort_points, specialty, list_item_id, email_id, source, created_by_member)
    values (v_title, nullif(trim(p ->> 'description'), ''), nullif(p ->> 'brand_id', '')::uuid,
            public.brand_id_array(p -> 'brand_ids'), v_owner,
            nullif(p ->> 'due_date', '')::date, nullif(p ->> 'sticker_id', '')::uuid,
            coalesce(nullif(p ->> 'priority', ''), 'P2'), coalesce((p ->> 'effort_points')::int, 2),
            nullif(p ->> 'main_skill', ''), v_item, v_email.id, 'correo', public.current_member_id())
    returning id into v_task;

    for x in select value from jsonb_array_elements(coalesce(p -> 'subtasks', '[]'::jsonb)) loop
      if coalesce((x ->> 'include')::boolean, true) and coalesce(trim(x ->> 'title'), '') <> '' then
        insert into public.subtasks (task_id, title, skill, assignee_id, due_date, position)
        values (v_task, trim(x ->> 'title'), nullif(x ->> 'skill', ''),
                (select id from public.team_members where id = nullif(x ->> 'assignee_id', '')::uuid and active),
                nullif(x ->> 'due_date', '')::date, v_pos);
        v_pos := v_pos + 1;
        v_count := v_count + 1;
      end if;
    end loop;

    update public.list_items set status = 'planificado', task_id = v_task where id = v_item;
    if v_owner is not null then
      perform public.log_activity('plan', format('asignó "%s" a %s desde un correo%s', v_title,
        (select name from public.team_members where id = v_owner),
        case when v_count > 0 then format(' con %s subtareas', v_count) else '' end), v_task);
    end if;
  end if;

  if coalesce((p ->> 'mark_done')::boolean, false) then
    update public.emails set status = 'respondido' where id = v_email.id;
  end if;

  return jsonb_build_object('mode', coalesce(p ->> 'mode', 'asignar'), 'list_item_id', v_item, 'task_id', v_task,
                            'list_id', v_list);
end
$$;

alter table public.assignment_permissions enable row level security;
alter table public.trash enable row level security;
revoke all on public.assignment_permissions, public.trash from anon;
revoke insert, update, delete on public.assignment_permissions from authenticated;
revoke all on public.trash from authenticated;
create policy assignment_permissions_select on public.assignment_permissions for select to authenticated using (public.is_member());

revoke execute on function public.can_assign(uuid, uuid) from public, anon;
grant execute on function public.can_assign(uuid, uuid) to authenticated;
revoke execute on function public.set_assignment_permissions(uuid, uuid[]), public.assign_item(uuid, uuid),
  public.delete_task(uuid), public.restore_task(bigint) from public, anon;
grant execute on function public.set_assignment_permissions(uuid, uuid[]), public.assign_item(uuid, uuid),
  public.delete_task(uuid), public.restore_task(bigint) to authenticated;
