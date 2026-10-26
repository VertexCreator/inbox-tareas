-- Corrige permisos que dejaban pasar a cualquiera cuando el dato a comparar estaba vacío
-- (una iniciativa sin creador registrado, un correo de la bandeja del gerente, una papelera sin autor).

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

create or replace function public.restore_task(p_trash_id bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.trash%rowtype;
  v_task uuid;
begin
  select * into r from public.trash where id = p_trash_id;
  if not found or r.deleted_at < now() - interval '30 minutes' then raise exception 'Ya no se puede deshacer'; end if;
  if not (public.is_admin() or coalesce(r.deleted_by = public.current_member_id(), false)) then raise exception 'Solo quien la eliminó puede deshacerlo'; end if;
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

create or replace function public.undo_duplicate(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tasks t where t.id = any (p_ids)
             and (t.duplicated_from is null
                  or not (public.is_admin() or coalesce(t.created_by_member = public.current_member_id(), false))
                  or t.created_at < now() - interval '30 minutes')) then
    raise exception 'Ya no se puede deshacer: borra las copias desde su detalle';
  end if;
  delete from public.tasks where id = any (p_ids);
end
$$;

-- create_from_email: un miembro no puede crear desde la bandeja del gerente (correo sin dueño).
do $$
declare
  v_def text := pg_get_functiondef('public.create_from_email(jsonb)'::regprocedure);
  v_old text := 'or v_email.owner_member_id = public.current_member_id()) then';
  v_new text := 'or coalesce(v_email.owner_member_id = public.current_member_id(), false)) then';
begin
  if position(v_old in v_def) = 0 then raise exception 'create_from_email cambió: revisa esta migración'; end if;
  execute replace(v_def, v_old, v_new);
end
$$;
