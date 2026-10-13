-- Iniciativas multimarca: un correo o una iniciativa puede involucrar varias marcas de la compañía.
-- brand_id sigue siendo la marca principal (todo lo que ya existe sigue funcionando) y brand_ids guarda
-- todas, con la principal primero. Con dos o más marcas, la iniciativa es multimarca.
-- Si el correo trae iniciativas distintas por marca, el agente crea pendientes separados (uno por marca).

alter table public.emails add column brand_ids uuid[] not null default '{}';
alter table public.list_items add column brand_ids uuid[] not null default '{}';
alter table public.tasks add column brand_ids uuid[] not null default '{}';
update public.emails set brand_ids = array[brand_id] where brand_id is not null;
update public.list_items set brand_ids = array[brand_id] where brand_id is not null;
update public.tasks set brand_ids = array[brand_id] where brand_id is not null;
create index tasks_brand_ids_idx on public.tasks using gin (brand_ids);
create index emails_brand_ids_idx on public.emails using gin (brand_ids);

-- Lo que dice el correo de cada marca (un párrafo por marca), para que Claude distinga una iniciativa
-- compartida de pedidos distintos por marca.
alter table public.email_queue add column brand_excerpts jsonb not null default '{}';

-- Lista de marcas sin repetidas, sin las que no existen y en el orden recibido.
create function public.clean_brand_ids(p uuid[]) returns uuid[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(x order by o), '{}')
  from (select x, min(o) o from unnest(p) with ordinality t(x, o)
        where x is not null and exists (select 1 from public.brands b where b.id = x) group by x) s;
$$;

create function public.brand_id_array(p jsonb) returns uuid[]
language sql stable set search_path = public as $$
  select public.clean_brand_ids(array(
    select nullif(x, '')::uuid from jsonb_array_elements_text(
      case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x where nullif(x, '') is not null));
$$;

-- Marcas por nombre o alias (para el agente): "brand" es la principal, "brands" todas las involucradas.
create function public.resolve_brands(p jsonb) returns uuid[]
language sql stable set search_path = public as $$
  select public.clean_brand_ids(array(
    select public.resolve_brand(n) from (
      select p ->> 'brand' n, 0 o
      union all
      select x, o from jsonb_array_elements_text(
        case when jsonb_typeof(p -> 'brands') = 'array' then p -> 'brands' else '[]'::jsonb end)
        with ordinality t(x, o)) s
    order by o));
$$;

-- Primer nombre que no es marca conocida (queda como sugerida para que el gerente la cree).
create function public.unknown_brand(p jsonb) returns text
language sql stable set search_path = public as $$
  select n from (
    select nullif(trim(p ->> 'suggested_brand'), '') n, 0 o
    union all select nullif(trim(p ->> 'brand'), ''), 1
    union all select nullif(trim(x), ''), 1 + o from jsonb_array_elements_text(
      case when jsonb_typeof(p -> 'brands') = 'array' then p -> 'brands' else '[]'::jsonb end)
      with ordinality t(x, o)) s
  where n is not null and public.resolve_brand(n) is null
  order by o limit 1;
$$;

-- Mantiene juntas la principal y la lista:
-- · cambia solo la principal → reemplaza a la anterior en la lista;
-- · cambia solo la lista → la principal pasa a ser la primera;
-- · la principal siempre va primero.
create function public.brand_ids_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v uuid[] := coalesce(new.brand_ids, '{}');
begin
  if tg_op = 'UPDATE' then
    if new.brand_id is distinct from old.brand_id and new.brand_ids is not distinct from old.brand_ids then
      v := array_remove(v, old.brand_id);
    elsif new.brand_ids is distinct from old.brand_ids and new.brand_id is not distinct from old.brand_id then
      new.brand_id := null;
    end if;
  end if;
  if new.brand_id is not null then v := array_prepend(new.brand_id, v); end if;
  v := public.clean_brand_ids(v);
  new.brand_ids := v;
  new.brand_id := v[1];
  return new;
end
$$;
create trigger brand_ids_sync before insert or update of brand_id, brand_ids on public.emails
for each row execute function public.brand_ids_sync();
create trigger brand_ids_sync before insert or update of brand_id, brand_ids on public.list_items
for each row execute function public.brand_ids_sync();
create trigger brand_ids_sync before insert or update of brand_id, brand_ids on public.tasks
for each row execute function public.brand_ids_sync();

-- Si se borra una marca, sale de todas las listas.
create function public.brands_remove_from_lists() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.emails set brand_ids = array_remove(brand_ids, old.id) where old.id = any (brand_ids);
  update public.list_items set brand_ids = array_remove(brand_ids, old.id) where old.id = any (brand_ids);
  update public.tasks set brand_ids = array_remove(brand_ids, old.id) where old.id = any (brand_ids);
  return old;
end
$$;
create trigger brands_remove_from_lists after delete on public.brands
for each row execute function public.brands_remove_from_lists();

-- Al crear una marca sugerida, se suma a lo que la sugería (sin quitar las marcas que ya tenía).
create or replace function public.brands_claim_suggestions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.list_items set brand_ids = brand_ids || new.id, suggested_brand = null
  where suggested_brand is not null
    and (lower(trim(suggested_brand)) = lower(new.name)
         or lower(trim(suggested_brand)) in (select lower(a) from unnest(new.aliases) a));
  update public.emails set brand_ids = brand_ids || new.id, suggested_brand = null
  where suggested_brand is not null
    and (lower(trim(suggested_brand)) = lower(new.name)
         or lower(trim(suggested_brand)) in (select lower(a) from unnest(new.aliases) a));
  return new;
end
$$;

-- La sugerencia se limpia al elegir marca a mano en un pendiente que no tenía; si ya tenía marcas
-- (multimarca con una marca nueva sugerida), la sugerencia se mantiene.
create or replace function public.list_items_clear_suggestion() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.brand_id is null and new.brand_id is not null then new.suggested_brand := null; end if;
  return new;
end
$$;

create or replace function public.ingest_email(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_brands uuid[] := public.resolve_brands(p);
begin
  perform public.require_admin_or_agent();
  insert into public.emails (
    gmail_message_id, gmail_thread_id, from_name, from_email, subject, summary,
    category, priority, needs_reply, draft_created, reply_by, received_at, brand_id, brand_ids, suggested_brand,
    mentioned, addressed
  ) values (
    p ->> 'gmail_message_id', p ->> 'gmail_thread_id', p ->> 'from_name', p ->> 'from_email',
    p ->> 'subject', p ->> 'summary', coalesce(p ->> 'category', 'otros'),
    coalesce(p ->> 'priority', 'ninguna'), coalesce((p ->> 'needs_reply')::boolean, false),
    coalesce((p ->> 'draft_created')::boolean, false), (p ->> 'reply_by')::date,
    (p ->> 'received_at')::timestamptz,
    v_brands[1], v_brands, public.unknown_brand(p),
    coalesce((p ->> 'mentioned')::boolean, false), nullif(p ->> 'addressed', '')
  )
  on conflict (gmail_message_id) do update set
    summary = excluded.summary, category = excluded.category,
    priority = case when public.emails.priority_locked then public.emails.priority else excluded.priority end,
    needs_reply = excluded.needs_reply,
    draft_created = public.emails.draft_created or excluded.draft_created,
    reply_by = excluded.reply_by,
    mentioned = public.emails.mentioned or excluded.mentioned,
    addressed = coalesce(excluded.addressed, public.emails.addressed),
    brand_id = coalesce(excluded.brand_id, public.emails.brand_id),
    brand_ids = case when cardinality(excluded.brand_ids) > 0 then excluded.brand_ids else public.emails.brand_ids end,
    suggested_brand = coalesce(excluded.suggested_brand,
                               case when cardinality(excluded.brand_ids) = 0 then public.emails.suggested_brand end)
  returning id into v_id;
  return v_id;
end
$$;

-- Pendiente desde un correo. Con "brand" o "brands" usa esas marcas (un pendiente por marca o uno
-- multimarca); si no dice nada, hereda todas las marcas del correo.
create or replace function public.create_item_from_email(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email public.emails%rowtype;
  v_list uuid := (select id from public.lists where is_inbox);
  v_id uuid;
  v_brands uuid[] := public.resolve_brands(p);
  v_suggested text := public.unknown_brand(p);
begin
  perform public.require_admin_or_agent();
  select * into v_email from public.emails where gmail_message_id = p ->> 'gmail_message_id';
  if not found then raise exception 'Primero registra el correo con ingest_email'; end if;
  select id into v_id from public.list_items where email_id = v_email.id and lower(title) = lower(p ->> 'title');
  if v_id is not null then return v_id; end if;

  if cardinality(v_brands) = 0 and v_suggested is null then
    v_brands := v_email.brand_ids;
    v_suggested := v_email.suggested_brand;
  end if;

  insert into public.list_items (list_id, title, notes, priority, due_date, email_id, brand_id, brand_ids, suggested_brand)
  values (v_list, trim(p ->> 'title'), nullif(p ->> 'notes', ''), nullif(p ->> 'priority', ''),
          (p ->> 'due_date')::date, v_email.id, v_brands[1], v_brands, v_suggested)
  returning id into v_id;
  perform public.draft_plan(v_id, null);
  return v_id;
end
$$;
create or replace function public.enqueue_emails(p_secret text, p_emails jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  n int;
  v_queued int := 0;
  v_junk int := 0;
begin
  perform public.check_ingest_secret(p_secret);
  if jsonb_typeof(p_emails) <> 'array' or jsonb_array_length(p_emails) > 200 then
    raise exception 'Se esperaba una lista de hasta 200 correos';
  end if;

  for e in select value from jsonb_array_elements(p_emails) loop
    if coalesce(e ->> 'gmail_message_id', '') = '' then continue; end if;

    if coalesce((e ->> 'junk')::boolean, false) then
      insert into public.emails (gmail_message_id, gmail_thread_id, from_name, from_email, subject,
                                 category, priority, needs_reply, received_at)
      values (e ->> 'gmail_message_id', e ->> 'gmail_thread_id', left(e ->> 'from_name', 200),
              left(e ->> 'from_email', 200), left(e ->> 'subject', 300),
              coalesce(e ->> 'junk_category', 'Promociones'), 'ninguna', false,
              (e ->> 'received_at')::timestamptz)
      on conflict (gmail_message_id) do nothing;
      get diagnostics n = row_count;
      v_junk := v_junk + n;
    else
      insert into public.email_queue (gmail_message_id, gmail_thread_id, from_name, from_email, subject,
                                      received_at, snippet, attachments, is_vip, is_automatic,
                                      to_count, cc_count, addressed, mentioned, mention_excerpts, brands_mentioned, brand_excerpts)
      values (e ->> 'gmail_message_id', e ->> 'gmail_thread_id', left(e ->> 'from_name', 200),
              left(e ->> 'from_email', 200), left(e ->> 'subject', 300),
              (e ->> 'received_at')::timestamptz, left(e ->> 'snippet', 1000),
              coalesce(array(select left(jsonb_array_elements_text(e -> 'attachments'), 120) limit 10), '{}'),
              coalesce((e ->> 'is_vip')::boolean, false), coalesce((e ->> 'automatic')::boolean, false),
              coalesce((e ->> 'to_count')::int, 0), coalesce((e ->> 'cc_count')::int, 0),
              nullif(e ->> 'addressed', ''), coalesce((e ->> 'mentioned')::boolean, false),
              left(e ->> 'mention_excerpts', 1500),
              coalesce(array(select left(jsonb_array_elements_text(e -> 'brands_mentioned'), 60) limit 10), '{}'),
              coalesce((select jsonb_object_agg(left(k, 60), left(v, 500))
                        from (select key k, value #>> '{}' v from jsonb_each(coalesce(e -> 'brand_excerpts', '{}'::jsonb))
                              limit 10) x), '{}'::jsonb))
      on conflict (gmail_message_id) do nothing;
      get diagnostics n = row_count;
      v_queued := v_queued + n;
    end if;
  end loop;

  update public.ingest_state
  set last_ingest_at = now(), last_queued = v_queued, last_junk = v_junk
  where id = 1;
  return jsonb_build_object('en_cola', v_queued, 'basura', v_junk);
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

create or replace function public.create_initiative(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  x jsonb;
  v_pos int := 0;
begin
  if not public.is_admin() then raise exception 'Solo el gerente puede crear iniciativas directas'; end if;
  if coalesce(trim(p ->> 'title'), '') = '' then raise exception 'La iniciativa necesita un nombre'; end if;

  insert into public.tasks (title, description, brand_id, brand_ids, assignee_id, due_date, sticker_id, priority, effort_points, specialty, source)
  values (trim(p ->> 'title'), nullif(trim(p ->> 'description'), ''), nullif(p ->> 'brand_id', '')::uuid,
          public.brand_id_array(p -> 'brand_ids'),
          nullif(p ->> 'assignee_id', '')::uuid, nullif(p ->> 'due_date', '')::date,
          nullif(p ->> 'sticker_id', '')::uuid, coalesce(nullif(p ->> 'priority', ''), 'P2'),
          coalesce((p ->> 'effort_points')::int, 2), nullif(p ->> 'specialty', ''), 'manual')
  returning id into v_id;

  -- Buscar en Gmail el correo relacionado (salvo que el gerente lo desactive).
  if coalesce((p ->> 'search_email')::boolean, true) then
    perform public.request_email_search(v_id, null, nullif(trim(p ->> 'search_query'), ''));
  end if;

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
  if not public.is_admin() then raise exception 'Solo el gerente puede crear desde correos'; end if;
  select * into v_email from public.emails where id = (p ->> 'email_id')::uuid;
  if not found then raise exception 'El correo no existe'; end if;
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
                              effort_points, specialty, list_item_id, email_id, source)
    values (v_title, nullif(trim(p ->> 'description'), ''), nullif(p ->> 'brand_id', '')::uuid,
            public.brand_id_array(p -> 'brand_ids'), v_owner,
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

create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if (new.title, new.description, new.priority, new.effort_points, new.due_date, new.specialty, new.brand_id, new.brand_ids)
       is distinct from (old.title, old.description, old.priority, old.effort_points, old.due_date, old.specialty, old.brand_id, old.brand_ids) then
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
grant insert (brand_ids) on public.tasks to authenticated;
grant update (brand_ids) on public.tasks to authenticated;
grant insert (brand_ids) on public.list_items to authenticated;
grant update (brand_ids) on public.list_items to authenticated;

revoke execute on function public.clean_brand_ids(uuid[]), public.brand_id_array(jsonb), public.resolve_brands(jsonb),
  public.unknown_brand(jsonb), public.brand_ids_sync(), public.brands_remove_from_lists() from public, anon, authenticated;
