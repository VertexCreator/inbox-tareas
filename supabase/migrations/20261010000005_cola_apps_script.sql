-- Ingesta con Google Apps Script: el script filtra la basura y deja los demás correos, ya limpios
-- y recortados, en una cola. Claude solo lee la cola (filas cortas), así gasta muchos menos tokens.

-- Listas que el script aplica sin IA. Se editan en el dashboard → Reglas.
alter table public.agent_priorities
  add column vip_senders text[] not null default '{}',
  add column junk_senders text[] not null default '{}';

create table public.email_queue (
  id bigint generated always as identity primary key,
  gmail_message_id text not null unique,
  gmail_thread_id text,
  from_name text,
  from_email text,
  subject text,
  received_at timestamptz,
  -- Cuerpo limpio (sin HTML, firmas ni texto citado), recortado por el script.
  snippet text,
  attachments text[] not null default '{}',
  is_vip boolean not null default false,
  -- Notificaciones automáticas (noreply, pestaña Notificaciones, listas): extracto más corto.
  is_automatic boolean not null default false,
  status text not null default 'pendiente' check (status in ('pendiente', 'procesado')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index email_queue_pending_idx on public.email_queue (received_at) where status = 'pendiente';

-- Clave del script y última vez que envió algo (para detectar si dejó de correr).
create table public.ingest_state (
  id int primary key default 1 check (id = 1),
  secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  last_ingest_at timestamptz,
  last_queued int not null default 0,
  last_junk int not null default 0
);
insert into public.ingest_state default values;

alter table public.email_queue enable row level security;
alter table public.ingest_state enable row level security;
revoke all on public.email_queue, public.ingest_state from anon;
revoke insert, update, delete on public.email_queue, public.ingest_state from authenticated;
create policy queue_admin on public.email_queue for select to authenticated using (public.is_admin());
create policy ingest_admin on public.ingest_state for select to authenticated using (public.is_admin());

-- ============================================================
-- Llamadas del Apps Script (con la publishable key + la clave del script)
-- ============================================================

create function public.check_ingest_secret(p_secret text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select secret from public.ingest_state where id = 1) then
    raise exception 'Clave del script inválida';
  end if;
end
$$;

create function public.ingest_config(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.check_ingest_secret(p_secret);
  return (select jsonb_build_object('vip_senders', vip_senders, 'junk_senders', junk_senders)
          from public.agent_priorities where id = 1);
end
$$;

-- La basura va directo a emails (cuenta en métricas, nunca llega a Claude); el resto, a la cola.
create function public.enqueue_emails(p_secret text, p_emails jsonb) returns jsonb
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
                                      received_at, snippet, attachments, is_vip, is_automatic)
      values (e ->> 'gmail_message_id', e ->> 'gmail_thread_id', left(e ->> 'from_name', 200),
              left(e ->> 'from_email', 200), left(e ->> 'subject', 300),
              (e ->> 'received_at')::timestamptz, left(e ->> 'snippet', 1000),
              coalesce(array(select left(jsonb_array_elements_text(e -> 'attachments'), 120) limit 10), '{}'),
              coalesce((e ->> 'is_vip')::boolean, false), coalesce((e ->> 'automatic')::boolean, false))
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

-- ============================================================
-- Agente y admin
-- ============================================================

-- El agente marca como procesados los correos de la cola que ya registró con ingest_email.
create function public.mark_queue_processed(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform public.require_admin_or_agent();
  update public.email_queue set status = 'procesado', processed_at = now()
  where id = any (p_ids) and status = 'pendiente';
  get diagnostics n = row_count;
  return n;
end
$$;

create function public.rotate_ingest_secret() returns text
language plpgsql security definer set search_path = public as $$
declare
  v text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  perform public.require_admin_or_agent();
  update public.ingest_state set secret = v where id = 1;
  return v;
end
$$;

revoke execute on function public.check_ingest_secret(text) from public, anon, authenticated;
revoke execute on function public.ingest_config(text) from public, authenticated;
revoke execute on function public.enqueue_emails(text, jsonb) from public, authenticated;
grant execute on function public.ingest_config(text) to anon;
grant execute on function public.enqueue_emails(text, jsonb) to anon;
revoke execute on function public.mark_queue_processed(bigint[]) from public, anon, authenticated;
revoke execute on function public.rotate_ingest_secret() from public, anon;
grant execute on function public.rotate_ingest_secret() to authenticated;
