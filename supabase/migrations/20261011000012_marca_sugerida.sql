-- El agente deduce la marca de cada correo. Si existe (por nombre o alias) la asigna; si no, la deja sugerida
-- para que el gerente la cree con un clic.

alter table public.brands add column aliases text[] not null default '{}';
alter table public.emails
  add column brand_id uuid references public.brands (id) on delete set null,
  add column suggested_brand text;
alter table public.list_items add column suggested_brand text;

-- Busca una marca activa por nombre o alias (sin distinguir mayúsculas). Un alias que empieza con @ es un dominio.
create function public.resolve_brand(p_name text) returns uuid
language sql stable security definer set search_path = public as $$
  select b.id from public.brands b
  where not b.archived and nullif(trim(p_name), '') is not null
    and (lower(b.name) = lower(trim(p_name))
         or exists (select 1 from unnest(b.aliases) a where lower(a) = lower(trim(p_name))))
  order by (lower(b.name) = lower(trim(p_name))) desc
  limit 1
$$;

create or replace function public.ingest_email(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform public.require_admin_or_agent();
  insert into public.emails (
    gmail_message_id, gmail_thread_id, from_name, from_email, subject, summary,
    category, priority, needs_reply, draft_created, reply_by, received_at, brand_id, suggested_brand
  ) values (
    p ->> 'gmail_message_id', p ->> 'gmail_thread_id', p ->> 'from_name', p ->> 'from_email',
    p ->> 'subject', p ->> 'summary', coalesce(p ->> 'category', 'otros'),
    coalesce(p ->> 'priority', 'ninguna'), coalesce((p ->> 'needs_reply')::boolean, false),
    coalesce((p ->> 'draft_created')::boolean, false), (p ->> 'reply_by')::date,
    (p ->> 'received_at')::timestamptz,
    public.resolve_brand(coalesce(p ->> 'brand', p ->> 'suggested_brand')),
    case when public.resolve_brand(coalesce(p ->> 'brand', p ->> 'suggested_brand')) is null
         then nullif(trim(coalesce(p ->> 'suggested_brand', p ->> 'brand')), '') end
  )
  on conflict (gmail_message_id) do update set
    summary = excluded.summary, category = excluded.category, priority = excluded.priority,
    needs_reply = excluded.needs_reply,
    draft_created = public.emails.draft_created or excluded.draft_created,
    reply_by = excluded.reply_by,
    brand_id = coalesce(excluded.brand_id, public.emails.brand_id),
    suggested_brand = case when coalesce(excluded.brand_id, public.emails.brand_id) is null
                           then coalesce(excluded.suggested_brand, public.emails.suggested_brand) end
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.create_item_from_email(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email uuid;
  v_list uuid := (select id from public.lists where is_inbox);
  v_id uuid;
  v_brand uuid;
  v_suggested text;
begin
  perform public.require_admin_or_agent();
  select id into v_email from public.emails where gmail_message_id = p ->> 'gmail_message_id';
  if v_email is null then raise exception 'Primero registra el correo con ingest_email'; end if;
  select id into v_id from public.list_items where email_id = v_email and lower(title) = lower(p ->> 'title');
  if v_id is not null then return v_id; end if;

  -- Marca: la que diga el agente (nombre o alias); si no existe, queda como sugerida. Si no dice nada, la del correo.
  v_brand := public.resolve_brand(coalesce(p ->> 'brand', p ->> 'suggested_brand'));
  if v_brand is null then
    v_suggested := nullif(trim(coalesce(p ->> 'suggested_brand', p ->> 'brand')), '');
  end if;
  if v_brand is null and v_suggested is null then
    select brand_id, suggested_brand into v_brand, v_suggested from public.emails where id = v_email;
  end if;

  insert into public.list_items (list_id, title, notes, priority, due_date, email_id, brand_id, suggested_brand)
  values (v_list, trim(p ->> 'title'), nullif(p ->> 'notes', ''), nullif(p ->> 'priority', ''),
          (p ->> 'due_date')::date, v_email, v_brand, v_suggested)
  returning id into v_id;
  perform public.draft_plan(v_id, null);
  return v_id;
end
$$;

-- Crear (o reutilizar) la marca sugerida de un pendiente y asignarla a todo lo que la sugería.
create function public.accept_suggested_brand(p_item_id uuid, p_color text default 'violet') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_brand uuid;
begin
  if not public.is_admin() then raise exception 'Solo el gerente puede crear marcas'; end if;
  select suggested_brand into v_name from public.list_items where id = p_item_id;
  if v_name is null then raise exception 'Este pendiente no tiene marca sugerida'; end if;
  v_brand := public.resolve_brand(v_name);
  if v_brand is null then
    insert into public.brands (name, color) values (trim(v_name), coalesce(p_color, 'violet')) returning id into v_brand;
  end if;
  return v_brand;
end
$$;

-- Al crear una marca (desde el tablero o desde una sugerencia), se asigna a lo que la sugería.
create function public.brands_claim_suggestions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.list_items set brand_id = new.id, suggested_brand = null
  where brand_id is null and suggested_brand is not null
    and (lower(trim(suggested_brand)) = lower(new.name)
         or lower(trim(suggested_brand)) in (select lower(a) from unnest(new.aliases) a));
  update public.emails set brand_id = new.id, suggested_brand = null
  where brand_id is null and suggested_brand is not null
    and (lower(trim(suggested_brand)) = lower(new.name)
         or lower(trim(suggested_brand)) in (select lower(a) from unnest(new.aliases) a));
  return null;
end
$$;
create trigger brands_claim_suggestions after insert or update of name, aliases on public.brands
for each row execute function public.brands_claim_suggestions();

-- Al asignar marca a mano, la sugerencia ya no hace falta.
create function public.list_items_clear_suggestion() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.brand_id is not null then new.suggested_brand := null; end if;
  return new;
end
$$;
create trigger list_items_clear_suggestion before insert or update of brand_id on public.list_items
for each row execute function public.list_items_clear_suggestion();

grant update (suggested_brand) on public.list_items to authenticated;
grant insert (suggested_brand) on public.list_items to authenticated;

revoke execute on function public.resolve_brand(text) from public, anon, authenticated;
revoke execute on function public.accept_suggested_brand(uuid, text) from public, anon;
grant execute on function public.accept_suggested_brand(uuid, text) to authenticated;
revoke execute on function public.brands_claim_suggestions(), public.list_items_clear_suggestion() from public, anon, authenticated;
