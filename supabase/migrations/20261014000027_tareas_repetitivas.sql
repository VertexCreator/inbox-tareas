-- Tareas repetitivas: se programan una vez (todos los días, cada semana, cada 15 días o cada mes) y la base
-- crea cada repetición como una tarea normal, sola, con pg_cron (cada hora revisa si toca crear alguna).
-- Los miembros programan las suyas (asignadas a sí mismos); el gerente, para cualquier persona.

create extension if not exists pg_cron with schema pg_catalog;

alter table public.settings add column timezone text not null default 'America/Caracas';

create table public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  brand_ids uuid[] not null default '{}',
  agency_id uuid references public.agencies (id) on delete set null,
  assignee_id uuid not null references public.team_members (id) on delete cascade,
  created_by uuid references public.team_members (id) on delete set null,
  frequency text not null check (frequency in ('diaria', 'semanal', 'quincenal', 'mensual')),
  weekdays int[] not null default '{}',          -- semanal: 1 = lunes … 7 = domingo
  workdays_only boolean not null default false,   -- diaria: solo de lunes a viernes
  start_date date not null,
  end_date date,
  next_date date not null,
  due_offset int not null default 0 check (due_offset between 0 and 60),
  priority text not null default 'P2' check (priority in ('P1', 'P2', 'P3')),
  effort_points int not null default 1,
  subtasks text[] not null default '{}',
  active boolean not null default true,
  last_generated date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_tasks_due_idx on public.recurring_tasks (next_date) where active;

alter table public.tasks
  add column recurring_id uuid references public.recurring_tasks (id) on delete set null,
  add column recurrence_date date;
create unique index tasks_recurrence_uniq on public.tasks (recurring_id, recurrence_date) where recurring_id is not null;

-- Hoy en la zona horaria del equipo.
create function public.team_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.settings where id = 1), 'America/Caracas'))::date;
$$;

-- ¿Toca una repetición ese día?
create function public.recurrence_matches(r public.recurring_tasks, d date) returns boolean
language sql immutable as $$
  select d >= r.start_date and (r.end_date is null or d <= r.end_date) and case r.frequency
    when 'diaria' then not r.workdays_only or extract(isodow from d) <= 5
    when 'semanal' then extract(isodow from d)::int = any (
      case when cardinality(r.weekdays) > 0 then r.weekdays else array[extract(isodow from r.start_date)::int] end)
    when 'quincenal' then (d - r.start_date) % 14 = 0
    when 'mensual' then extract(day from d) = least(extract(day from r.start_date),
      extract(day from (date_trunc('month', d) + interval '1 month - 1 day')))
  end;
$$;

-- Próxima repetición desde una fecha (null si ya terminó).
create function public.next_occurrence(r public.recurring_tasks, p_from date) returns date
language sql stable as $$
  select min(d)::date from generate_series(greatest(p_from, r.start_date), greatest(p_from, r.start_date) + 400, interval '1 day') d
  where public.recurrence_matches(r, d::date);
$$;

-- Crea las repeticiones que tocan hoy (o la última que se pasó, sin llenar de atrasadas).
create function public.generate_recurring_tasks(p_id uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  r public.recurring_tasks%rowtype;
  v_today date := public.team_today();
  v_occ date;
  v_task uuid;
  v_next date;
  v_count int := 0;
  v_pos int;
  s text;
begin
  for r in select * from public.recurring_tasks
           where active and next_date <= v_today and (p_id is null or id = p_id)
           for update skip locked loop
    select max(d)::date into v_occ from generate_series(r.next_date, v_today, interval '1 day') d
    where public.recurrence_matches(r, d::date);

    if v_occ is not null then
      v_task := null;
      insert into public.tasks (title, description, brand_id, brand_ids, agency_id, assignee_id, due_date, priority,
                                effort_points, source, recurring_id, recurrence_date, assignment_mode, assignment_reason)
      values (r.title || ' · ' || to_char(v_occ, 'DD/MM'), r.description, r.brand_ids[1], r.brand_ids, r.agency_id,
              r.assignee_id, v_occ + r.due_offset, r.priority, r.effort_points, 'manual', r.id, v_occ,
              'manual', 'Tarea repetitiva')
      on conflict (recurring_id, recurrence_date) where recurring_id is not null do nothing
      returning id into v_task;
      if v_task is not null then
        v_count := v_count + 1;
        v_pos := 0;
        foreach s in array r.subtasks loop
          if length(trim(s)) > 0 then
            insert into public.subtasks (task_id, title, assignee_id, due_date, position)
            values (v_task, trim(s), r.assignee_id, v_occ + r.due_offset, v_pos);
            v_pos := v_pos + 1;
          end if;
        end loop;
      end if;
    end if;

    v_next := public.next_occurrence(r, v_today + 1);
    update public.recurring_tasks
    set last_generated = coalesce(v_occ, last_generated),
        next_date = coalesce(v_next, next_date),
        active = v_next is not null,
        updated_at = now()
    where id = r.id;
  end loop;
  return v_count;
end
$$;

-- Las repeticiones van a quien las programó aunque no sea responsable de iniciativas.
create or replace function public.tasks_owner_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recurring_id is null and new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from public.team_members where id = new.assignee_id and can_own and active) then
    raise exception '% no está autorizado como responsable de iniciativas',
      coalesce((select name from public.team_members where id = new.assignee_id), 'Esa persona');
  end if;
  return new;
end
$$;

create function public.can_edit_recurring(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.recurring_tasks
    where id = p_id and (created_by = public.current_member_id() or assignee_id = public.current_member_id()));
$$;

-- Crear o editar. Un miembro solo programa para sí mismo; el gerente, para cualquiera del equipo.
create function public.save_recurring_task(p jsonb) returns uuid
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

  v_assignee := case when public.is_admin() then coalesce(nullif(p ->> 'assignee_id', '')::uuid, v_me) else v_me end;
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
      assignee_id = case when public.is_admin() then v_assignee else assignee_id end,
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

create function public.set_recurring_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.recurring_tasks%rowtype;
begin
  if not public.can_edit_recurring(p_id) then raise exception 'No puedes cambiar esta tarea repetitiva'; end if;
  select * into r from public.recurring_tasks where id = p_id;
  update public.recurring_tasks
  set active = p_active,
      next_date = case when p_active then coalesce(public.next_occurrence(r, case when r.last_generated >= public.team_today()
                                                                                     then public.team_today() + 1 else public.team_today() end), next_date)
                       else next_date end,
      updated_at = now()
  where id = p_id;
  if p_active then perform public.generate_recurring_tasks(p_id); end if;
end
$$;

-- Borrar la programación. Las tareas ya creadas se quedan.
create function public.delete_recurring_task(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_recurring(p_id) then raise exception 'No puedes borrar esta tarea repetitiva'; end if;
  delete from public.recurring_tasks where id = p_id;
end
$$;

alter table public.recurring_tasks enable row level security;
revoke all on public.recurring_tasks from anon;
revoke insert, update, delete on public.recurring_tasks from authenticated;
create policy recurring_select on public.recurring_tasks for select to authenticated
  using (public.is_admin() or assignee_id = public.current_member_id() or created_by = public.current_member_id());

alter publication supabase_realtime add table public.recurring_tasks;

revoke execute on function public.generate_recurring_tasks(uuid), public.recurrence_matches(public.recurring_tasks, date),
  public.next_occurrence(public.recurring_tasks, date), public.can_edit_recurring(uuid) from public, anon, authenticated;
revoke execute on function public.save_recurring_task(jsonb), public.set_recurring_active(uuid, boolean),
  public.delete_recurring_task(uuid), public.team_today() from public, anon;
grant execute on function public.save_recurring_task(jsonb), public.set_recurring_active(uuid, boolean),
  public.delete_recurring_task(uuid), public.team_today() to authenticated;

-- Cada hora (al minuto 5) se crean las repeticiones del día.
select cron.schedule('teamflow-tareas-repetitivas', '5 * * * *', $$select public.generate_recurring_tasks()$$);
