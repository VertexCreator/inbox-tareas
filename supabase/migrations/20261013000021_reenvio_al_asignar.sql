-- Al asignar una iniciativa que viene de un correo, el script de Gmail reenvía ese correo (texto completo y
-- adjuntos) a la persona asignada con el asunto "Asignación TeamFlow - <asunto original>", y guarda el texto
-- del correo en la iniciativa para que el equipo lo lea en el dashboard (el equipo no ve el inbox).

alter table public.settings
  add column forward_on_assign boolean not null default true,
  add column dashboard_url text;

-- Texto del correo original guardado en la iniciativa.
create table public.task_email_content (
  task_id uuid primary key references public.tasks (id) on delete cascade,
  email_id uuid references public.emails (id) on delete set null,
  from_name text,
  from_email text,
  to_list text,
  cc_list text,
  subject text,
  sent_at timestamptz,
  body_text text,
  attachments jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

-- Cola de reenvíos: una fila por iniciativa, persona y correo.
create table public.email_forwards (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  member_id uuid not null references public.team_members (id) on delete cascade,
  email_id uuid not null references public.emails (id) on delete cascade,
  forward boolean not null default true,
  status text not null default 'pendiente' check (status in ('pendiente', 'enviado', 'omitido', 'error')),
  detail text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (task_id, member_id, email_id)
);
create index email_forwards_pending_idx on public.email_forwards (status) where status in ('pendiente', 'error');

-- Al asignar (o al vincular el correo a una iniciativa ya asignada), se pide el reenvío.
create function public.tasks_request_forward() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_id is null or new.assignee_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id
     and new.email_id is not distinct from old.email_id then
    return null;
  end if;
  insert into public.email_forwards (task_id, member_id, email_id, forward)
  values (new.id, new.assignee_id, new.email_id, (select forward_on_assign from public.settings where id = 1))
  on conflict (task_id, member_id, email_id) do nothing;
  return null;
end
$$;
create trigger tasks_request_forward after insert or update of assignee_id, email_id on public.tasks
for each row execute function public.tasks_request_forward();

-- Para el script: reenvíos pendientes (y los que fallaron, hasta 3 intentos).
create function public.pending_email_forwards(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_ingest_secret(p_secret);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'forward', f.forward,
      'has_content', exists (select 1 from public.task_email_content c where c.task_id = f.task_id and c.email_id = f.email_id),
      'gmail_message_id', e.gmail_message_id,
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
    from (select * from public.email_forwards
          where status = 'pendiente' or (status = 'error' and attempts < 3)
          order by created_at limit 10) f
    join public.tasks t on t.id = f.task_id
    join public.emails e on e.id = f.email_id
    join public.team_members m on m.id = f.member_id), '[]'::jsonb);
end
$$;

-- Para el script: resultado del reenvío y el texto del correo.
create function public.submit_email_forward(p_secret text, p_id bigint, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  f public.email_forwards%rowtype;
  c jsonb := p -> 'content';
  v_status text := p ->> 'status';
begin
  perform public.check_ingest_secret(p_secret);
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

-- Gerente: volver a reenviar (por ejemplo si falló o la persona lo borró).
create function public.retry_email_forward(p_task_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tasks%rowtype;
begin
  if not public.is_admin() then raise exception 'Solo el gerente puede reenviar correos'; end if;
  select * into t from public.tasks where id = p_task_id;
  if t.email_id is null or t.assignee_id is null then raise exception 'La iniciativa necesita un correo vinculado y un responsable'; end if;
  insert into public.email_forwards (task_id, member_id, email_id, forward)
  values (t.id, t.assignee_id, t.email_id, true)
  on conflict (task_id, member_id, email_id) do update
    set status = 'pendiente', forward = true, attempts = 0, detail = null, created_at = now();
end
$$;

-- El dashboard guarda su dirección pública para poner el enlace a la iniciativa en el correo.
create function public.remember_dashboard_url(p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() or p_url !~ '^https://' then return; end if;
  update public.settings set dashboard_url = p_url where id = 1 and dashboard_url is distinct from p_url;
end
$$;

-- Quién ve el correo en la iniciativa: el gerente, el responsable y quienes tienen subtareas en ella.
create function public.can_see_task_email(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.tasks t
    where t.id = p_task and (coalesce(t.assignee_id, t.suggested_assignee_id) = public.current_member_id()
                             or exists (select 1 from public.subtasks s where s.task_id = t.id and s.assignee_id = public.current_member_id())));
$$;

alter table public.task_email_content enable row level security;
alter table public.email_forwards enable row level security;
revoke all on public.task_email_content, public.email_forwards from anon;
revoke insert, update, delete on public.task_email_content, public.email_forwards from authenticated;
create policy task_email_content_select on public.task_email_content for select to authenticated
  using (public.can_see_task_email(task_id));
create policy email_forwards_select on public.email_forwards for select to authenticated
  using (public.is_admin() or member_id = public.current_member_id());

alter publication supabase_realtime add table public.task_email_content, public.email_forwards;

revoke execute on function public.tasks_request_forward() from public, anon, authenticated;
revoke execute on function public.pending_email_forwards(text), public.submit_email_forward(text, bigint, jsonb)
  from public, authenticated;
grant execute on function public.pending_email_forwards(text), public.submit_email_forward(text, bigint, jsonb) to anon;
revoke execute on function public.retry_email_forward(uuid), public.remember_dashboard_url(text), public.can_see_task_email(uuid)
  from public, anon;
grant execute on function public.retry_email_forward(uuid), public.remember_dashboard_url(text), public.can_see_task_email(uuid)
  to authenticated;
