-- Duplicar una iniciativa para otra marca: copia idéntica (título, descripción, responsable, prioridad, esfuerzo,
-- agencia, fechas y subtareas con sus personas); solo cambia la marca. La copia empieza en la primera etapa, sin
-- avance, sin observación ni correo vinculado. Lo puede hacer cualquier persona del equipo.

alter table public.tasks
  add column duplicated_from uuid references public.tasks (id) on delete set null,
  add column created_by_member uuid references public.team_members (id) on delete set null;

-- Cambia el nombre de las marcas originales por el de la nueva (sin importar mayúsculas).
create function public.swap_brand_names(p_text text, p_old text[], p_new text) returns text
language plpgsql immutable as $$
declare
  v text := p_text;
  o text;
begin
  if v is null then return null; end if;
  foreach o in array coalesce(p_old, '{}') loop
    if length(trim(o)) > 0 then
      v := regexp_replace(v, '\m' || regexp_replace(o, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M', p_new, 'gi');
    end if;
  end loop;
  return v;
end
$$;

create function public.duplicate_task(p_task_id uuid, p_brand_ids uuid[]) returns uuid[]
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

-- Deshacer: quien duplicó (o el gerente) borra las copias recién creadas, mientras nadie las haya avanzado.
create function public.undo_duplicate(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tasks t where t.id = any (p_ids)
             and (t.duplicated_from is null
                  or not (public.is_admin() or t.created_by_member = public.current_member_id())
                  or t.created_at < now() - interval '30 minutes')) then
    raise exception 'Ya no se puede deshacer: borra las copias desde su detalle';
  end if;
  delete from public.tasks where id = any (p_ids);
end
$$;

revoke execute on function public.swap_brand_names(text, text[], text) from public, anon, authenticated;
revoke execute on function public.duplicate_task(uuid, uuid[]), public.undo_duplicate(uuid[]) from public, anon;
grant execute on function public.duplicate_task(uuid, uuid[]), public.undo_duplicate(uuid[]) to authenticated;
