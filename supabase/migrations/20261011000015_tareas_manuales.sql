-- Tareas manuales (sin correo) dentro del mismo circuito automático:
-- pendientes que piden plan al agente (el Planificador los arma y afina), iniciativas directas con subtareas
-- en una sola operación, y actividad cuando se crean a mano.

alter table public.list_items add column auto_plan boolean not null default false;
grant insert (auto_plan) on public.list_items to authenticated;

insert into public.lists (name, description)
select 'Tareas manuales', 'Lo que el equipo agrega a mano, fuera de los correos'
where not exists (select 1 from public.lists where name = 'Tareas manuales');

-- El Planificador arma los borradores de los pendientes que pidieron plan (luego los afina como siempre).
create function public.draft_auto_plans() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  perform public.require_admin_or_agent();
  for r in select id from public.list_items where auto_plan and status = 'sin_planificar' order by created_at limit 20 loop
    perform public.draft_plan(r.id, null);
    update public.list_items set auto_plan = false where id = r.id;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Iniciativa directa con subtareas, en una sola operación (solo el gerente).
create function public.create_initiative(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  x jsonb;
  v_pos int := 0;
begin
  if not public.is_admin() then raise exception 'Solo el gerente puede crear iniciativas directas'; end if;
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'La iniciativa necesita un nombre'; end if;

  insert into public.tasks (title, description, brand_id, assignee_id, due_date, sticker_id, priority, effort_points, specialty, source)
  values (trim(p ->> 'title'), nullif(trim(p ->> 'description'), ''), nullif(p ->> 'brand_id', '')::uuid,
          nullif(p ->> 'assignee_id', '')::uuid, nullif(p ->> 'due_date', '')::date,
          nullif(p ->> 'sticker_id', '')::uuid, coalesce(nullif(p ->> 'priority', ''), 'P2'),
          coalesce((p ->> 'effort_points')::int, 2), nullif(p ->> 'specialty', ''), 'manual')
  returning id into v_id;

  for x in select value from jsonb_array_elements(coalesce(p -> 'subtasks', '[]'::jsonb)) loop
    if coalesce(trim(x ->> 'title'), '') <> '' then
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

create or replace function public.tasks_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is null then
    perform public.route_task(new.id);
  else
    update public.tasks set assignment_mode = 'manual', assignment_reason = 'Asignada a mano', needs_approval = false
    where id = new.id;
    insert into public.assignment_log (task_id, member_id, mode, reason, actor)
    values (new.id, new.assignee_id, 'manual', 'Asignada a mano', public.actor_label());
    -- Las que vienen de un plan confirmado ya dejan su propia actividad ("asignó…").
    if new.list_item_id is null then
      perform public.log_activity('plan', format('creó "%s" para %s', new.title,
        (select name from public.team_members where id = new.assignee_id)), new.id);
    end if;
  end if;
  return null;
end
$$;

revoke execute on function public.draft_auto_plans() from public, anon, authenticated;
revoke execute on function public.create_initiative(jsonb) from public, anon;
grant execute on function public.create_initiative(jsonb) to authenticated;
revoke execute on function public.tasks_after_insert() from public, anon, authenticated;
