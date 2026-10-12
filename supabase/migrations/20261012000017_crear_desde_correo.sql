-- "Crear pendiente" desde un correo: ventana con todo precargado para asignar de una vez
-- (iniciativa + subtareas) o dejarlo planificado en Listas; y saber si un correo ya tiene pendiente.

-- Recomendación sin guardar nada: plantilla, responsable autorizado y subtareas con persona y fecha.
create function public.preview_plan_for(p_title text, p_notes text, p_brand uuid, p_due date, p_template uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tpl public.plan_templates%rowtype;
  v_text text := lower(coalesce(p_title, '') || ' ' || coalesce(p_notes, ''));
  v_due date := greatest(coalesce(p_due, current_date + 14), current_date);
  v_main record;
  v_sub record;
  x jsonb;
  i int := 0;
  subs jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'Solo el gerente'; end if;
  if p_template is not null then
    select * into tpl from public.plan_templates where id = p_template;
  end if;
  if tpl.id is null then
    select * into tpl from public.plan_templates where id = public.pick_template(p_title, p_notes);
  end if;
  if tpl.id is null then
    select * into tpl from public.plan_templates where name = 'Tarea simple';
  end if;

  select * into v_main from public.recommend_member(tpl.main_skill, tpl.id, v_text, true);
  for x in select value from jsonb_array_elements(tpl.items) loop
    select * into v_sub from public.recommend_member(x ->> 'skill', tpl.id, null, false);
    subs := subs || jsonb_build_array(jsonb_build_object(
      'title', x ->> 'title', 'skill', x ->> 'skill',
      'assignee_id', v_sub.member_id, 'reason', v_sub.reason,
      'due_date', greatest(current_date, v_due - coalesce((x ->> 'days_before')::int, 0)),
      'include', not coalesce((x ->> 'optional')::boolean, false)));
    i := i + 1;
  end loop;

  return jsonb_build_object(
    'template_id', tpl.id, 'template_name', tpl.name, 'main_skill', tpl.main_skill,
    'effort_points', tpl.effort_points, 'assignee_id', v_main.member_id, 'reason', v_main.reason,
    'due_date', v_due, 'subtasks', subs);
end
$$;

-- Crea desde el correo. mode 'asignar': pendiente + iniciativa + subtareas de una vez.
-- mode 'planificar': pendiente con la recomendación armada (se revisa en Listas).
create function public.create_from_email(p jsonb) returns jsonb
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
  if not public.is_admin() then raise exception 'Solo el gerente puede crear desde correos'; end if;
  select * into v_email from public.emails where id = (p ->> 'email_id')::uuid;
  if not found then raise exception 'El correo no existe'; end if;
  if v_title = '' then raise exception 'Escribe un título'; end if;

  insert into public.list_items (list_id, title, notes, priority, due_date, email_id, brand_id, suggested_brand)
  values (v_list, v_title, nullif(trim(p ->> 'description'), ''), nullif(p ->> 'priority', ''),
          nullif(p ->> 'due_date', '')::date, v_email.id, nullif(p ->> 'brand_id', '')::uuid,
          case when nullif(p ->> 'brand_id', '') is null then v_email.suggested_brand end)
  returning id into v_item;

  if coalesce(p ->> 'mode', 'asignar') = 'planificar' then
    perform public.draft_plan(v_item, nullif(p ->> 'template_id', '')::uuid);
  else
    insert into public.tasks (title, description, brand_id, assignee_id, due_date, sticker_id, priority,
                              effort_points, specialty, list_item_id, email_id, source)
    values (v_title, nullif(trim(p ->> 'description'), ''), nullif(p ->> 'brand_id', '')::uuid, v_owner,
            nullif(p ->> 'due_date', '')::date, nullif(p ->> 'sticker_id', '')::uuid,
            coalesce(nullif(p ->> 'priority', ''), 'P2'), coalesce((p ->> 'effort_points')::int, 2),
            nullif(p ->> 'main_skill', ''), v_item, v_email.id, 'correo')
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

revoke execute on function public.preview_plan_for(text, text, uuid, date, uuid), public.create_from_email(jsonb) from public, anon;
grant execute on function public.preview_plan_for(text, text, uuid, date, uuid), public.create_from_email(jsonb) to authenticated;
