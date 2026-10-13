-- Correo de cada miembro del equipo.
-- Cada persona conecta su Gmail con un script personal (lo copia desde "Mi correo" con su clave incluida).
-- Sin Claude: la prioridad se calcula con reglas y con lo que la persona corrige. Cada quien ve solo su correo.
-- Puede crear y asignar iniciativas desde su correo; el reenvío lo hace su propio script.
-- Opcional, si el gerente lo habilita por persona: pedir al agente del gerente que analice un correo puntual.

alter table public.team_members add column ai_analysis_allowed boolean not null default false;
alter table public.settings add column ai_analysis_daily_limit int not null default 10
  check (ai_analysis_daily_limit between 1 and 100);
alter table public.emails
  add column owner_member_id uuid references public.team_members (id) on delete cascade,
  add column body_preview text;
create index emails_owner_idx on public.emails (owner_member_id, status);
alter table public.email_forwards add column sender_member_id uuid references public.team_members (id) on delete set null;

-- La carga del equipo también dice quién puede pedir análisis.
create or replace view public.member_load with (security_invoker = true) as
SELECT m.id, m.name, m.email, m.specialties, m.capacity_points, m.is_admin, m.active, m.available,
    (COALESCE(t.pts, 0::bigint) + COALESCE(s.cnt, 0::bigint))::integer AS open_points,
    COALESCE(t.cnt, 0::bigint)::integer AS open_tasks,
    round((COALESCE(t.pts, 0::bigint) + COALESCE(s.cnt, 0::bigint))::numeric / m.capacity_points::numeric, 2) AS load_ratio,
    m.skill_levels,
    COALESCE(s.cnt, 0::bigint)::integer AS open_subtasks,
    m.can_own,
    m.ai_analysis_allowed
   FROM team_members m
     LEFT JOIN LATERAL ( SELECT sum(tasks.effort_points) AS pts, count(*) AS cnt
           FROM tasks
          WHERE COALESCE(tasks.assignee_id, tasks.suggested_assignee_id) = m.id AND (tasks.status = ANY (ARRAY['por_hacer'::text, 'en_curso'::text]))) t ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS cnt
           FROM subtasks st JOIN tasks tk ON tk.id = st.task_id
          WHERE st.assignee_id = m.id AND NOT st.done AND (tk.status = ANY (ARRAY['por_hacer'::text, 'en_curso'::text]))
            AND COALESCE(tk.assignee_id, tk.suggested_assignee_id) IS DISTINCT FROM m.id) s ON true;

-- Cada quien ve su correo: el gerente, el de su bandeja (sin dueño); cada miembro, el suyo.
drop policy emails_admin on public.emails;
create policy emails_select on public.emails for select to authenticated
  using ((owner_member_id is null and public.is_admin()) or owner_member_id = public.current_member_id());
create policy emails_admin_insert on public.emails for insert to authenticated
  with check (owner_member_id is null and public.is_admin());
create policy emails_admin_update on public.emails for update to authenticated
  using (owner_member_id is null and public.is_admin()) with check (owner_member_id is null and public.is_admin());
create policy emails_admin_delete on public.emails for delete to authenticated
  using (owner_member_id is null and public.is_admin());

-- ============================================================
-- Buzón de cada miembro: su clave personal y el estado de su script
-- ============================================================

create table public.member_mailboxes (
  member_id uuid primary key references public.team_members (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  last_ingest_at timestamptz,
  last_forward_check timestamptz,
  last_count int not null default 0,
  last_junk int not null default 0
);

create function public.member_by_token(p_token text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid;
begin
  select b.member_id into v from public.member_mailboxes b join public.team_members m on m.id = b.member_id
  where b.token = p_token and m.active;
  if v is null then raise exception 'Clave del script inválida: copia el script de nuevo desde Mi correo'; end if;
  return v;
end
$$;

-- Para la página "Mi correo": crea el buzón si no existe y devuelve la clave (solo a su dueño).
create function public.my_gmail_connection() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.current_member_id();
  b public.member_mailboxes%rowtype;
begin
  if v_member is null then raise exception 'No perteneces al equipo'; end if;
  insert into public.member_mailboxes (member_id) values (v_member) on conflict (member_id) do nothing;
  select * into b from public.member_mailboxes where member_id = v_member;
  return jsonb_build_object('token', b.token, 'created_at', b.created_at, 'last_ingest_at', b.last_ingest_at,
                            'last_forward_check', b.last_forward_check, 'last_count', b.last_count, 'last_junk', b.last_junk);
end
$$;

create function public.regenerate_my_gmail_token() returns void
language sql security definer set search_path = public as $$
  update public.member_mailboxes set token = encode(extensions.gen_random_bytes(24), 'hex')
  where member_id = public.current_member_id();
$$;

-- Reglas que aprende de cada persona: "los correos de este remitente son P1".
create table public.member_priority_rules (
  member_id uuid not null references public.team_members (id) on delete cascade,
  sender text not null,
  priority text not null check (priority in ('P1', 'P2', 'P3', 'ninguna')),
  updated_at timestamptz not null default now(),
  primary key (member_id, sender)
);

-- Lo que necesita el script de la persona: remitentes VIP y basura, cómo la nombran y las marcas.
create function public.member_ingest_config(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.member_by_token(p_token);
  m public.team_members%rowtype;
begin
  select * into m from public.team_members where id = v_member;
  return (select jsonb_build_object(
    'vip_senders', a.vip_senders, 'junk_senders', a.junk_senders,
    'my_aliases', array_remove(array[lower(m.name), lower(split_part(m.name, ' ', 1)), lower(split_part(m.email, '@', 1))], ''),
    'brands', coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'aliases', b.aliases)) from public.brands b where not b.archived), '[]'::jsonb))
    from public.agent_priorities a where a.id = 1);
end
$$;

-- Prioridad sin IA: lo que la persona ya corrigió manda; después, si le escriben a ella o la mencionan,
-- si piden algo y si hay plazo.
create function public.classify_member_email(p_member uuid, e jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from text := lower(coalesce(e ->> 'from_email', ''));
  v_text text := translate(lower(coalesce(e ->> 'subject', '') || ' ' || coalesce(e ->> 'snippet', '') || ' ' || coalesce(e ->> 'mention_excerpts', '')),
                           'áéíóúüñ', 'aeiouun');
  v_rule text;
  v_direct boolean := coalesce(e ->> 'addressed', '') = 'para' or coalesce((e ->> 'mentioned')::boolean, false);
  v_urgent boolean;
  v_tomorrow boolean;
  v_ask boolean;
  v_brand boolean := jsonb_typeof(e -> 'brands_mentioned') = 'array' and jsonb_array_length(e -> 'brands_mentioned') > 0;
  v_priority text;
begin
  select priority into v_rule from public.member_priority_rules
  where member_id = p_member and (sender = v_from or sender = '@' || split_part(v_from, '@', 2))
  order by (sender = v_from) desc limit 1;

  v_urgent := v_text ~ '\m(urgente|urge|hoy|asap|cuanto antes|lo antes posible|inmediato|esta tarde|hoy mismo)\M';
  v_tomorrow := v_text ~ '\mmanana\M';
  v_ask := v_text ~ '\m(confirmar|confirma|confirmen|aprobar|aprueba|aprueben|enviar|envia|envien|enviame|revisar|revisa|revisen|necesito|necesitamos|favor|podrias|puedes|pueden|solicito|solicitamos|pendiente|requiero|requerimos)\M'
           or position('?' in v_text) > 0;

  if v_rule is not null then
    v_priority := v_rule;
  elsif coalesce((e ->> 'automatic')::boolean, false) then
    v_priority := case when v_direct and v_urgent then 'P2' else 'ninguna' end;
  elsif v_direct and (v_urgent or v_tomorrow) and v_ask then
    v_priority := 'P1';
  elsif (v_direct and v_ask) or coalesce((e ->> 'mentioned')::boolean, false) or coalesce((e ->> 'is_vip')::boolean, false) then
    v_priority := 'P2';
  elsif v_direct or v_brand then
    v_priority := 'P3';
  else
    v_priority := 'ninguna';
  end if;

  return jsonb_build_object(
    'priority', v_priority,
    'needs_reply', v_direct and v_priority in ('P1', 'P2'),
    'reply_by', case when v_priority = 'ninguna' then null when v_urgent then current_date when v_tomorrow then current_date + 1 end,
    'summary', nullif(left(regexp_replace(coalesce(e ->> 'snippet', ''), '\s+', ' ', 'g'), 220), ''));
end
$$;

-- El script de la persona entrega sus correos: se clasifican y quedan en su bandeja.
create function public.member_enqueue_emails(p_token text, p_emails jsonb) returns jsonb
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

-- La persona mueve un correo de prioridad (y la base aprende ese remitente) o lo marca como atendido.
create function public.set_my_email_priority(p_email_id uuid, p_priority text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e public.emails%rowtype;
begin
  if p_priority not in ('P1', 'P2', 'P3', 'ninguna') then raise exception 'Prioridad inválida'; end if;
  select * into e from public.emails where id = p_email_id and owner_member_id = public.current_member_id();
  if not found then raise exception 'Ese correo no es tuyo'; end if;
  update public.emails set priority = p_priority, priority_locked = true where id = e.id;
  if coalesce(e.from_email, '') <> '' then
    insert into public.member_priority_rules (member_id, sender, priority)
    values (e.owner_member_id, lower(e.from_email), p_priority)
    on conflict (member_id, sender) do update set priority = excluded.priority, updated_at = now();
  end if;
end
$$;

create function public.mark_my_email(p_email_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pendiente', 'respondido', 'archivado') then raise exception 'Estado inválido'; end if;
  update public.emails set status = p_status where id = p_email_id and owner_member_id = public.current_member_id();
  if not found then raise exception 'Ese correo no es tuyo'; end if;
end
$$;

-- ============================================================
-- Reenvío: el script de quien asignó (gerente o miembro) envía el correo desde su Gmail
-- ============================================================

create or replace function public.tasks_request_forward() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_id is null or new.assignee_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id
     and new.email_id is not distinct from old.email_id then
    return null;
  end if;
  insert into public.email_forwards (task_id, member_id, email_id, forward, sender_member_id)
  values (new.id, new.assignee_id, new.email_id, (select forward_on_assign from public.settings where id = 1),
          (select owner_member_id from public.emails where id = new.email_id))
  on conflict (task_id, member_id, email_id) do nothing;
  return null;
end
$$;

create or replace function public.pending_email_forwards(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_ingest_secret(p_secret);
  -- Cada pasada del script queda registrada: el dashboard calcula cuánto falta para la próxima.
  update public.ingest_state set last_forward_check = now() where id = 1;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'task_id', f.task_id,
      'forward', f.forward,
      'has_content', exists (select 1 from public.task_email_content c where c.task_id = f.task_id and c.email_id = f.email_id),
      'gmail_message_id', e.gmail_message_id,
      'gmail_thread_id', e.gmail_thread_id,
      'to_email', m.email,
      'to_name', m.name,
      'task_title', t.title,
      'task_description', t.description,
      'due_date', t.due_date,
      'priority', t.priority,
      'brands', (select string_agg(b.name, ' + ' order by array_position(t.brand_ids, b.id))
                 from public.brands b where b.id = any (t.brand_ids)),
      'subtasks', (select coalesce(jsonb_agg(jsonb_build_object('title', s.title, 'due_date', s.due_date,
                                                                'assignee', (select name from public.team_members where id = s.assignee_id))
                                             order by s.position), '[]'::jsonb)
                   from public.subtasks s where s.task_id = t.id),
      'dashboard_url', (select dashboard_url from public.settings where id = 1)
    ) order by f.created_at)
    from (select x.* from public.email_forwards x join public.emails xe on xe.id = x.email_id and xe.owner_member_id is null
          where x.status = 'pendiente' or (x.status = 'error' and x.attempts < 3)
          order by x.created_at limit 10) f
    join public.tasks t on t.id = f.task_id
    join public.emails e on e.id = f.email_id
    join public.team_members m on m.id = f.member_id), '[]'::jsonb);
end
$$;

create function public.member_pending_forwards(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
begin
  v_member := public.member_by_token(p_token);
  update public.member_mailboxes set last_forward_check = now() where member_id = v_member;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'task_id', f.task_id,
      'forward', f.forward,
      'has_content', exists (select 1 from public.task_email_content c where c.task_id = f.task_id and c.email_id = f.email_id),
      'gmail_message_id', e.gmail_message_id,
      'gmail_thread_id', e.gmail_thread_id,
      'to_email', m.email,
      'to_name', m.name,
      'task_title', t.title,
      'task_description', t.description,
      'due_date', t.due_date,
      'priority', t.priority,
      'brands', (select string_agg(b.name, ' + ' order by array_position(t.brand_ids, b.id))
                 from public.brands b where b.id = any (t.brand_ids)),
      'subtasks', (select coalesce(jsonb_agg(jsonb_build_object('title', s.title, 'due_date', s.due_date,
                                                                'assignee', (select name from public.team_members where id = s.assignee_id))
                                             order by s.position), '[]'::jsonb)
                   from public.subtasks s where s.task_id = t.id),
      'dashboard_url', (select dashboard_url from public.settings where id = 1)
    ) order by f.created_at)
    from (select x.* from public.email_forwards x join public.emails xe on xe.id = x.email_id and xe.owner_member_id = v_member
          where x.status = 'pendiente' or (x.status = 'error' and x.attempts < 3)
          order by x.created_at limit 10) f
    join public.tasks t on t.id = f.task_id
    join public.emails e on e.id = f.email_id
    join public.team_members m on m.id = f.member_id), '[]'::jsonb);
end
$$;

create function public.apply_forward_result(p_id bigint, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  f public.email_forwards%rowtype;
  c jsonb := p -> 'content';
  v_status text := p ->> 'status';
begin
  select * into f from public.email_forwards where id = p_id;
  if not found then return 'no existe'; end if;
  if v_status not in ('enviado', 'omitido', 'error') then raise exception 'Estado inválido'; end if;

  if c is not null and jsonb_typeof(c) = 'object' then
    insert into public.task_email_content (task_id, email_id, from_name, from_email, to_list, cc_list, subject,
                                           sent_at, body_text, attachments, fetched_at)
    values (f.task_id, f.email_id, left(c ->> 'from_name', 200), left(c ->> 'from_email', 200),
            left(c ->> 'to', 2000), left(c ->> 'cc', 2000), left(c ->> 'subject', 500),
            nullif(c ->> 'date', '')::timestamptz, left(c ->> 'body_text', 60000),
            coalesce(case when jsonb_typeof(c -> 'attachments') = 'array' then c -> 'attachments' end, '[]'::jsonb), now())
    on conflict (task_id) do update set
      email_id = excluded.email_id, from_name = excluded.from_name, from_email = excluded.from_email,
      to_list = excluded.to_list, cc_list = excluded.cc_list, subject = excluded.subject, sent_at = excluded.sent_at,
      body_text = excluded.body_text, attachments = excluded.attachments, fetched_at = now();
  end if;

  update public.email_forwards
  set status = v_status, detail = left(p ->> 'detail', 500), attempts = attempts + 1,
      sent_at = case when v_status = 'enviado' then now() else sent_at end
  where id = p_id;

  if v_status = 'enviado' then
    perform public.log_activity('correo', format('reenvió el correo de "%s" a %s',
      (select title from public.tasks where id = f.task_id),
      (select name from public.team_members where id = f.member_id)), f.task_id);
  end if;
  return v_status;
end
$$;

create or replace function public.submit_email_forward(p_secret text, p_id bigint, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_ingest_secret(p_secret);
  return public.apply_forward_result(p_id, p);
end
$$;

create function public.member_submit_forward(p_token text, p_id bigint, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.member_by_token(p_token);
begin
  if not exists (select 1 from public.email_forwards f join public.emails e on e.id = f.email_id
                 where f.id = p_id and e.owner_member_id = v_member) then
    raise exception 'Ese reenvío no es de tu correo';
  end if;
  return public.apply_forward_result(p_id, p);
end
$$;

-- Cuándo pasó por última vez cada script (el del gerente y los de cada miembro), para el contador.
create or replace function public.forward_schedule() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_member() then jsonb_build_object(
    'last_check', (select last_forward_check from public.ingest_state where id = 1),
    'every_minutes', 5,
    'members', coalesce((select jsonb_object_agg(member_id, last_forward_check) from public.member_mailboxes
                         where last_forward_check is not null), '{}'::jsonb))
  end;
$$;

drop policy email_forwards_select on public.email_forwards;
create policy email_forwards_select on public.email_forwards for select to authenticated
  using (public.is_admin() or member_id = public.current_member_id() or sender_member_id = public.current_member_id());

-- ============================================================
-- Análisis del agente a pedido (solo para quien el gerente habilite)
-- ============================================================

create table public.email_analysis_requests (
  id bigint generated always as identity primary key,
  email_id uuid not null references public.emails (id) on delete cascade,
  member_id uuid not null references public.team_members (id) on delete cascade,
  wants_reply boolean not null default false,
  status text not null default 'pendiente' check (status in ('pendiente', 'listo', 'error', 'cancelado')),
  result jsonb,
  detail text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index email_analysis_pending_idx on public.email_analysis_requests (status) where status = 'pendiente';

create function public.request_email_analysis(p_email_id uuid, p_wants_reply boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.current_member_id();
  v_id bigint;
  v_limit int := (select ai_analysis_daily_limit from public.settings where id = 1);
begin
  if not exists (select 1 from public.team_members where id = v_member and ai_analysis_allowed and active) then
    raise exception 'El gerente no te ha habilitado el análisis del agente';
  end if;
  if not exists (select 1 from public.emails where id = p_email_id and owner_member_id = v_member) then
    raise exception 'Ese correo no es tuyo';
  end if;
  select id into v_id from public.email_analysis_requests where email_id = p_email_id and status = 'pendiente';
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.email_analysis_requests
      where member_id = v_member and created_at >= date_trunc('day', now()) and status <> 'cancelado') >= v_limit then
    raise exception 'Llegaste al límite de % análisis por día', v_limit;
  end if;
  insert into public.email_analysis_requests (email_id, member_id, wants_reply)
  values (p_email_id, v_member, coalesce(p_wants_reply, false)) returning id into v_id;
  return v_id;
end
$$;

-- Para el agente (Planificador): los correos que el equipo pidió analizar.
create function public.pending_email_analyses() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin_or_agent();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'wants_reply', r.wants_reply, 'member', m.name,
      'from_name', e.from_name, 'from_email', e.from_email, 'subject', e.subject, 'received_at', e.received_at,
      'addressed', e.addressed, 'mentioned', e.mentioned,
      'brands', (select coalesce(jsonb_agg(b.name), '[]'::jsonb) from public.brands b where b.id = any (e.brand_ids)),
      'body', coalesce(e.body_preview, e.summary)) order by r.created_at)
    from (select * from public.email_analysis_requests where status = 'pendiente' order by created_at limit 10) r
    join public.emails e on e.id = r.email_id
    join public.team_members m on m.id = r.member_id), '[]'::jsonb);
end
$$;

create function public.submit_email_analysis(p_id bigint, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin_or_agent();
  update public.email_analysis_requests
  set status = case when p ? 'error' then 'error' else 'listo' end,
      result = case when p ? 'error' then null else p end,
      detail = left(p ->> 'error', 500), done_at = now()
  where id = p_id and status = 'pendiente';
end
$$;

-- ============================================================
-- Seguridad
-- ============================================================

alter table public.member_mailboxes enable row level security;
alter table public.member_priority_rules enable row level security;
alter table public.email_analysis_requests enable row level security;
revoke all on public.member_mailboxes, public.member_priority_rules, public.email_analysis_requests from anon;
revoke all on public.member_mailboxes from authenticated;
grant select (member_id, created_at, last_ingest_at, last_forward_check, last_count, last_junk) on public.member_mailboxes to authenticated;
revoke insert, update, delete on public.member_priority_rules, public.email_analysis_requests from authenticated;
create policy mailboxes_select on public.member_mailboxes for select to authenticated
  using (member_id = public.current_member_id() or public.is_admin());
create policy priority_rules_select on public.member_priority_rules for select to authenticated
  using (member_id = public.current_member_id());
create policy analysis_select on public.email_analysis_requests for select to authenticated
  using (member_id = public.current_member_id());

alter publication supabase_realtime add table public.emails, public.email_analysis_requests;

revoke execute on function public.member_by_token(text), public.classify_member_email(uuid, jsonb),
  public.apply_forward_result(bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.member_ingest_config(text), public.member_enqueue_emails(text, jsonb),
  public.member_pending_forwards(text), public.member_submit_forward(text, bigint, jsonb) from public, authenticated;
grant execute on function public.member_ingest_config(text), public.member_enqueue_emails(text, jsonb),
  public.member_pending_forwards(text), public.member_submit_forward(text, bigint, jsonb) to anon;
revoke execute on function public.my_gmail_connection(), public.regenerate_my_gmail_token(),
  public.set_my_email_priority(uuid, text), public.mark_my_email(uuid, text),
  public.request_email_analysis(uuid, boolean) from public, anon;
grant execute on function public.my_gmail_connection(), public.regenerate_my_gmail_token(),
  public.set_my_email_priority(uuid, text), public.mark_my_email(uuid, text),
  public.request_email_analysis(uuid, boolean) to authenticated;
revoke execute on function public.pending_email_analyses(), public.submit_email_analysis(bigint, jsonb) from public, anon, authenticated;

create or replace function public.retry_email_forward(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = p_task_id;
  if not (public.is_admin() or exists (select 1 from public.emails e where e.id = t.email_id and e.owner_member_id = public.current_member_id())) then
    raise exception 'Solo el gerente o quien asignó desde su correo puede reenviarlo';
  end if;
  if t.email_id is null or t.assignee_id is null then raise exception 'La iniciativa necesita un correo vinculado y un responsable'; end if;
  insert into public.email_forwards (task_id, member_id, email_id, forward, sender_member_id)
  values (t.id, t.assignee_id, t.email_id, true, (select owner_member_id from public.emails where id = t.email_id))
  on conflict (task_id, member_id, email_id) do update
    set status = 'pendiente', forward = true, attempts = 0, detail = null, created_at = now();
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

create or replace function public.list_items_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.current_member_id());
    return new;
  end if;
  new.updated_at := now();
  if current_setting('teamflow.trusted', true) = 'on' then return new; end if;
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
  if new.email_id is not null and auth.role() = 'authenticated' and not public.is_admin()
     and coalesce(current_setting('teamflow.trusted', true), '') <> 'on' then
    raise exception 'Solo el administrador puede enlazar correos';
  end if;
  return new;
end
$$;
