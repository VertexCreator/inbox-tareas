-- Correos con muchos destinatarios: el script detecta si te mencionan (@Sofía Gómez), si estás en Para o en
-- copia y qué marcas nombran, y recorta el párrafo donde te mencionan para que Claude lea lo que te piden a ti.

alter table public.agent_priorities
  add column my_aliases text[] not null default '{"sofía gómez","sofia gomez","sofía","sgomez"}';

alter table public.email_queue
  add column to_count int not null default 0,
  add column cc_count int not null default 0,
  add column addressed text check (addressed in ('para', 'copia', 'lista')),
  add column mentioned boolean not null default false,
  add column mention_excerpts text,
  add column brands_mentioned text[] not null default '{}';

alter table public.emails
  add column mentioned boolean not null default false,
  add column addressed text check (addressed in ('para', 'copia', 'lista'));

create or replace function public.ingest_config(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.check_ingest_secret(p_secret);
  return (select jsonb_build_object(
            'vip_senders', vip_senders, 'junk_senders', junk_senders, 'my_aliases', my_aliases,
            'brands', coalesce((select jsonb_agg(jsonb_build_object('name', b.name, 'aliases', b.aliases))
                                from public.brands b where not b.archived), '[]'::jsonb))
          from public.agent_priorities where id = 1);
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
                                      to_count, cc_count, addressed, mentioned, mention_excerpts, brands_mentioned)
      values (e ->> 'gmail_message_id', e ->> 'gmail_thread_id', left(e ->> 'from_name', 200),
              left(e ->> 'from_email', 200), left(e ->> 'subject', 300),
              (e ->> 'received_at')::timestamptz, left(e ->> 'snippet', 1000),
              coalesce(array(select left(jsonb_array_elements_text(e -> 'attachments'), 120) limit 10), '{}'),
              coalesce((e ->> 'is_vip')::boolean, false), coalesce((e ->> 'automatic')::boolean, false),
              coalesce((e ->> 'to_count')::int, 0), coalesce((e ->> 'cc_count')::int, 0),
              nullif(e ->> 'addressed', ''), coalesce((e ->> 'mentioned')::boolean, false),
              left(e ->> 'mention_excerpts', 1500),
              coalesce(array(select left(jsonb_array_elements_text(e -> 'brands_mentioned'), 60) limit 10), '{}'))
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
    summary = excluded.summary, category = excluded.category, priority = excluded.priority,
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

insert into public.brands (name, color, aliases) values
  ('Vaseline', 'blue', '{vaseline}'),
  ('Peros', 'orange', '{peros}'),
  ('Energizer', 'green', '{energizer}'),
  ('OGX', 'violet', '{ogx}'),
  ('Axe', 'red', '{axe}')
on conflict (name) do nothing;
