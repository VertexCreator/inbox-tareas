-- 1) El gerente cambia la prioridad de un correo (arrastrando en Hoy): queda fija y el agente aprende.
-- 2) Al crear una tarea a mano, se arman parámetros de búsqueda; el Apps Script busca en Gmail en los
--    últimos N días (Configuración) y se vincula el correo que mejor coincide.

-- ============================================================
-- 1. Prioridad manual
-- ============================================================

alter table public.emails add column priority_locked boolean not null default false;

create table public.priority_feedback (
  id bigint generated always as identity primary key,
  email_id uuid references public.emails (id) on delete set null,
  from_name text,
  from_email text,
  subject text,
  brand text,
  old_priority text,
  new_priority text not null,
  created_at timestamptz not null default now()
);

create function public.set_email_priority(p_email_id uuid, p_priority text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e public.emails%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo el gerente puede cambiar prioridades'; end if;
  if p_priority not in ('P1', 'P2', 'P3', 'ninguna') then raise exception 'Prioridad inválida'; end if;
  select * into e from public.emails where id = p_email_id;
  if not found then raise exception 'El correo no existe'; end if;
  if e.priority = p_priority then return; end if;
  update public.emails set priority = p_priority, priority_locked = true where id = p_email_id;
  insert into public.priority_feedback (email_id, from_name, from_email, subject, brand, old_priority, new_priority)
  values (e.id, e.from_name, e.from_email, e.subject, (select name from public.brands where id = e.brand_id), e.priority, p_priority);
end
$$;

create or replace function public.ingest_email(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.require_admin_or_agent();
  insert into public.emails (
    gmail_message_id, gmail_thread_id, from_name, from_email, subject, summary,
    category, priority, needs_reply, draft_created, reply_by, received_at, brand_id, suggested_brand,
    mentioned, addressed
  ) values (
    p ->> 'gmail_message_id', p ->> 'gmail_thread_id', p ->> 'from_name', p ->> 'from_email',
    p ->> 'subject', p ->> 'summary', coalesce(p ->> 'category', 'otros'),
    coalesce(p ->> 'priority', 'ninguna'), coalesce((p ->> 'needs_reply')::boolean, false),
    coalesce((p ->> 'draft_created')::boolean, false), (p ->> 'reply_by')::date,
    (p ->> 'received_at')::timestamptz,
    public.resolve_brand(coalesce(p ->> 'brand', p ->> 'suggested_brand')),
    case when public.resolve_brand(coalesce(p ->> 'brand', p ->> 'suggested_brand')) is null
         then nullif(trim(coalesce(p ->> 'suggested_brand', p ->> 'brand')), '') end,
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
    suggested_brand = case when coalesce(excluded.brand_id, public.emails.brand_id) is null
                           then coalesce(excluded.suggested_brand, public.emails.suggested_brand) end
  returning id into v_id;
  return v_id;
end
$$;

-- ============================================================
-- 2. Buscar el correo de una tarea creada a mano
-- ============================================================

alter table public.settings add column email_search_days int not null default 30
  check (email_search_days between 7 and 180);

create table public.email_search_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks (id) on delete cascade,
  list_item_id uuid references public.list_items (id) on delete cascade,
  query text not null,
  keywords text[] not null default '{}',
  brand_terms text[] not null default '{}',
  days int not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'vinculado', 'revisar', 'sin_coincidencia', 'cancelado')),
  linked_message_id text,
  created_at timestamptz not null default now(),
  searched_at timestamptz,
  check (task_id is not null or list_item_id is not null)
);
create index email_search_pending_idx on public.email_search_requests (created_at) where status = 'pendiente';

create table public.email_search_results (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.email_search_requests (id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  from_name text,
  from_email text,
  subject text,
  received_at timestamptz,
  snippet text,
  score numeric not null default 0
);
create index email_search_results_req_idx on public.email_search_results (request_id, score desc);

-- Palabras útiles para buscar: de 4+ letras, sin palabras comunes; primero las del título.
create function public.search_keywords(p_title text, p_description text) returns text[]
language sql immutable set search_path = public as $$
  with words as (
    select w, min(ord) as ord
    from regexp_split_to_table(lower(coalesce(p_title, '') || ' ' || coalesce(p_description, '')), '[^a-z0-9áéíóúüñ]+')
         with ordinality as t(w, ord)
    where length(w) >= 4
      and w not in ('para','como','esta','este','estos','estas','sobre','entre','desde','hasta','donde','cuando',
                    'tiene','hacer','todo','todos','toda','todas','nuevo','nueva','nuevos','nuevas','cada','pero',
                    'porque','también','tambien','ellos','ellas','nuestro','nuestra','favor','gracias','hola',
                    'saludos','semana','tarea','tareas','revisar','enviar','preparar','realizar','crear','hacer',
                    'with','from','that','this','have','will')
    group by w
  )
  select coalesce(array(select w from words order by ord limit 5), '{}')
$$;

create function public.brand_search_terms(p_brand uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(
    select distinct x from (
      select lower(name) as x from public.brands where id = p_brand
      union all
      select lower(a) from public.brands, unnest(aliases) a where id = p_brand
    ) s where x <> ''), '{}')
$$;

-- Consulta de Gmail: plazo + (la marca o sus dominios) + (alguna palabra clave).
create function public.build_email_query(p_title text, p_description text, p_brand uuid, p_days int) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_kw text[] := public.search_keywords(p_title, p_description);
  v_brand text[] := public.brand_search_terms(p_brand);
  v_brand_part text;
  v_kw_part text;
begin
  select string_agg(case when t like '@%' then format('from:%1$s to:%1$s cc:%1$s', substr(t, 2))
                         when t like '% %' then format('"%s"', t) else t end, ' ')
  into v_brand_part from unnest(v_brand) t;
  select string_agg(k, ' ') into v_kw_part from unnest(v_kw) k;
  return trim(format('newer_than:%sd %s %s', p_days,
    case when v_brand_part is not null then '{' || v_brand_part || '}' else '' end,
    case when v_kw_part is not null then '{' || v_kw_part || '}' else '' end));
end
$$;

-- Vista previa para el formulario (el gerente puede editarla antes de crear la tarea).
create function public.preview_email_query(p_title text, p_description text, p_brand uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el gerente'; end if;
  return public.build_email_query(p_title, p_description, p_brand,
    (select email_search_days from public.settings where id = 1));
end
$$;

create function public.request_email_search(p_task_id uuid, p_item_id uuid, p_query text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_desc text;
  v_brand uuid;
  v_days int := (select email_search_days from public.settings where id = 1);
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo el gerente puede buscar correos'; end if;
  if p_task_id is not null then
    select title, description, brand_id into v_title, v_desc, v_brand from public.tasks where id = p_task_id;
  else
    select title, notes, brand_id into v_title, v_desc, v_brand from public.list_items where id = p_item_id;
  end if;
  if v_title is null then raise exception 'No encontré la tarea'; end if;

  update public.email_search_requests set status = 'cancelado'
  where status = 'pendiente' and (task_id = p_task_id or list_item_id = p_item_id);

  insert into public.email_search_requests (task_id, list_item_id, query, keywords, brand_terms, days)
  values (p_task_id, p_item_id,
          coalesce(nullif(trim(p_query), ''), public.build_email_query(v_title, v_desc, v_brand, v_days)),
          public.search_keywords(v_title, v_desc), public.brand_search_terms(v_brand), v_days)
  returning id into v_id;
  return v_id;
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

  insert into public.tasks (title, description, brand_id, assignee_id, due_date, sticker_id, priority, effort_points, specialty, source)
  values (trim(p ->> 'title'), nullif(trim(p ->> 'description'), ''), nullif(p ->> 'brand_id', '')::uuid,
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

-- El script pide las búsquedas pendientes…
create function public.pending_email_searches(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_ingest_secret(p_secret);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'query', query) order by created_at)
                   from (select id, query, created_at from public.email_search_requests
                         where status = 'pendiente' order by created_at limit 10) r), '[]'::jsonb);
end
$$;

-- Vincula un candidato: guarda el correo (archivado, fuera de la bandeja) y lo asigna a la tarea o pendiente.
create function public.link_search_result(p_result_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.email_search_results%rowtype;
  q public.email_search_requests%rowtype;
  v_email uuid;
begin
  select * into r from public.email_search_results where id = p_result_id;
  if not found then raise exception 'Ese resultado no existe'; end if;
  select * into q from public.email_search_requests where id = r.request_id;

  insert into public.emails (gmail_message_id, gmail_thread_id, from_name, from_email, subject, summary,
                             category, priority, status, received_at, brand_id)
  values (r.gmail_message_id, r.gmail_thread_id, r.from_name, r.from_email, r.subject, left(r.snippet, 200),
          'Vinculado', 'ninguna', 'archivado', r.received_at,
          coalesce((select brand_id from public.tasks where id = q.task_id),
                   (select brand_id from public.list_items where id = q.list_item_id)))
  on conflict (gmail_message_id) do update set gmail_thread_id = coalesce(public.emails.gmail_thread_id, excluded.gmail_thread_id)
  returning id into v_email;

  if q.task_id is not null then
    update public.tasks set email_id = v_email where id = q.task_id;
  else
    update public.list_items set email_id = v_email where id = q.list_item_id;
  end if;
  update public.email_search_requests set status = 'vinculado', linked_message_id = r.gmail_message_id where id = q.id;
end
$$;

-- …y entrega lo que encontró. Se puntúa cada candidato y se vincula el mejor.
create function public.submit_email_search(p_secret text, p_request_id uuid, p_results jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  q public.email_search_requests%rowtype;
  x jsonb;
  v_text text;
  v_subject text;
  v_score numeric;
  v_age numeric;
  v_top record;
  v_second numeric;
  v_status text;
begin
  perform public.check_ingest_secret(p_secret);
  select * into q from public.email_search_requests where id = p_request_id and status = 'pendiente';
  if not found then return 'ignorada'; end if;

  for x in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) limit 10 loop
    v_subject := lower(coalesce(x ->> 'subject', ''));
    v_text := v_subject || ' ' || lower(coalesce(x ->> 'snippet', '')) || ' ' || lower(coalesce(x ->> 'from_email', ''));
    v_score := 0;
    -- palabra clave en el asunto vale 3, en el cuerpo 1; la marca (nombre, alias o dominio) 2
    select v_score + coalesce(sum(case when position(k in v_subject) > 0 then 3 when position(k in v_text) > 0 then 1 else 0 end), 0)
      into v_score from unnest(q.keywords) k;
    if exists (select 1 from unnest(q.brand_terms) b where position(ltrim(b, '@') in v_text) > 0) then
      v_score := v_score + 2;
    end if;
    -- más reciente, un poco mejor (hasta +1)
    v_age := extract(epoch from (now() - coalesce((x ->> 'received_at')::timestamptz, now()))) / 86400.0;
    v_score := v_score + greatest(0, 1 - v_age / greatest(q.days, 1));

    insert into public.email_search_results (request_id, gmail_message_id, gmail_thread_id, from_name, from_email,
                                             subject, received_at, snippet, score)
    values (q.id, x ->> 'gmail_message_id', x ->> 'gmail_thread_id', left(x ->> 'from_name', 200), left(x ->> 'from_email', 200),
            left(x ->> 'subject', 300), (x ->> 'received_at')::timestamptz, left(x ->> 'snippet', 400), round(v_score, 2));
  end loop;

  select id, score into v_top from public.email_search_results where request_id = q.id order by score desc, received_at desc limit 1;
  select score into v_second from public.email_search_results where request_id = q.id and id <> v_top.id order by score desc limit 1;

  if v_top.id is null then
    v_status := 'sin_coincidencia';
    update public.email_search_requests set status = v_status, searched_at = now() where id = q.id;
  elsif v_top.score >= 2 then
    perform public.link_search_result(v_top.id);
    -- si el segundo está muy cerca, se vincula igual pero se marca para revisar
    v_status := case when v_second is not null and v_top.score - v_second < 1 then 'revisar' else 'vinculado' end;
    update public.email_search_requests set status = v_status, searched_at = now() where id = q.id;
  else
    v_status := 'revisar';
    update public.email_search_requests set status = v_status, searched_at = now() where id = q.id;
  end if;
  return v_status;
end
$$;

-- El gerente elige otro candidato.
create function public.choose_search_result(p_result_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el gerente puede vincular correos'; end if;
  perform public.link_search_result(p_result_id);
end
$$;

create function public.unlink_task_email(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el gerente'; end if;
  update public.tasks set email_id = null where id = p_task_id;
end
$$;

-- Las reglas de edición del equipo aplican a usuarios con sesión; el script (clave pública) y el agente
-- entran por funciones que ya validan lo suyo.
create or replace function public.list_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.current_member_id());
    return new;
  end if;
  new.updated_at := now();
  if auth.role() = 'authenticated' and not public.is_admin() then
    if old.created_by is distinct from public.current_member_id() or old.status <> 'sin_planificar'
       or new.status is distinct from old.status or new.list_id is distinct from old.list_id then
      raise exception 'Solo puedes editar tus pendientes mientras no estén planificados';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.list_items_email_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_id is not null and auth.role() = 'authenticated' and not public.is_admin() then
    raise exception 'Solo el administrador puede enlazar correos';
  end if;
  return new;
end
$$;

create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
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

-- ============================================================
-- Seguridad
-- ============================================================

alter table public.priority_feedback enable row level security;
alter table public.email_search_requests enable row level security;
alter table public.email_search_results enable row level security;
revoke all on public.priority_feedback, public.email_search_requests, public.email_search_results from anon;
revoke insert, update, delete on public.priority_feedback, public.email_search_requests, public.email_search_results from authenticated;
create policy feedback_admin on public.priority_feedback for select to authenticated using (public.is_admin());
create policy search_req_admin on public.email_search_requests for select to authenticated using (public.is_admin());
create policy search_res_admin on public.email_search_results for select to authenticated using (public.is_admin());

revoke execute on function public.set_email_priority(uuid, text), public.preview_email_query(text, text, uuid),
  public.request_email_search(uuid, uuid, text), public.choose_search_result(bigint), public.unlink_task_email(uuid)
  from public, anon;
grant execute on function public.set_email_priority(uuid, text), public.preview_email_query(text, text, uuid),
  public.request_email_search(uuid, uuid, text), public.choose_search_result(bigint), public.unlink_task_email(uuid)
  to authenticated;
revoke execute on function public.search_keywords(text, text), public.brand_search_terms(uuid),
  public.build_email_query(text, text, uuid, int), public.link_search_result(bigint) from public, anon, authenticated;
revoke execute on function public.pending_email_searches(text), public.submit_email_search(text, uuid, jsonb) from public, authenticated;
grant execute on function public.pending_email_searches(text), public.submit_email_search(text, uuid, jsonb) to anon;
