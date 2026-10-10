-- Elegir plantilla: más palabras clave coinciden; en empate, la que aparece antes en el título
-- ("Newsletter de lanzamiento" → Newsletter, no Lanzamiento de producto).
create function public.pick_template(p_title text, p_notes text) returns uuid
language sql stable security definer set search_path = public as $$
  select t.id
  from public.plan_templates t
  cross join lateral (
    select count(*) as hits,
           min(nullif(position(lower(k) in lower(p_title)), 0)) as first_in_title
    from unnest(t.keywords) k
    where position(lower(k) in lower(p_title || ' ' || coalesce(p_notes, ''))) > 0
  ) m
  where m.hits > 0
  order by m.hits desc, m.first_in_title nulls last, t.usage_count desc
  limit 1
$$;
revoke execute on function public.pick_template(text, text) from public, anon, authenticated;

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
