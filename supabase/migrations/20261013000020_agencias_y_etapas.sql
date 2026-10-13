-- Agencias y etapas.
-- 1. Agencias: las agencias con las que trabaja el equipo (creativas, de medios, de eventos). Cada una tiene
--    dominios de correo; los correos de esos dominios quedan con su agencia, y los pendientes e iniciativas que
--    salen de ellos la heredan. El gerente la puede cambiar a mano.
-- 2. Etapas (antes "stickers"): el gerente las crea, renombra, ordena y borra; al borrar una, sus
--    iniciativas pasan a otra etapa.

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  color text not null default 'gray',
  domains text[] not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.emails add column agency_id uuid references public.agencies (id) on delete set null;
alter table public.list_items add column agency_id uuid references public.agencies (id) on delete set null;
alter table public.tasks add column agency_id uuid references public.agencies (id) on delete set null;
create index tasks_agency_idx on public.tasks (agency_id);
create index list_items_agency_idx on public.list_items (agency_id);

-- Agencia de un correo por el dominio del remitente ("agencia.com" también reconoce "mx.agencia.com").
create function public.agency_for_email(p_email text) returns uuid
language sql stable set search_path = public as $$
  select a.id from public.agencies a, unnest(a.domains) d
  where not a.archived and p_email is not null and length(trim(d)) > 0
    and (lower(p_email) like '%@' || lower(ltrim(trim(d), '@'))
         or lower(p_email) like '%.' || lower(ltrim(trim(d), '@')))
  order by length(d) desc limit 1;
$$;

create function public.emails_agency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agency_id is null then new.agency_id := public.agency_for_email(new.from_email); end if;
  return new;
end
$$;
create trigger emails_agency before insert or update of from_email on public.emails
for each row execute function public.emails_agency();

-- Pendientes e iniciativas heredan la agencia del correo (o del pendiente) si nadie la eligió.
create function public.list_items_agency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agency_id is null and new.email_id is not null then
    new.agency_id := (select agency_id from public.emails where id = new.email_id);
  end if;
  return new;
end
$$;
create trigger list_items_agency before insert on public.list_items
for each row execute function public.list_items_agency();

create function public.tasks_agency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agency_id is null then
    new.agency_id := coalesce(
      (select agency_id from public.list_items where id = new.list_item_id),
      (select agency_id from public.emails where id = new.email_id));
  end if;
  return new;
end
$$;
create trigger tasks_agency before insert on public.tasks
for each row execute function public.tasks_agency();

-- Si un pendiente cambia de agencia, su iniciativa también (si tenía la misma o ninguna).
create function public.list_items_agency_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.agency_id is distinct from old.agency_id and new.task_id is not null then
    update public.tasks set agency_id = new.agency_id
    where id = new.task_id and (agency_id is null or agency_id = old.agency_id);
  end if;
  return null;
end
$$;
create trigger list_items_agency_follow after update of agency_id on public.list_items
for each row execute function public.list_items_agency_follow();

-- Al crear una agencia o cambiar sus dominios, se aplica a lo que ya existe sin agencia.
create function public.agencies_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.emails e set agency_id = new.id
  where e.agency_id is null and public.agency_for_email(e.from_email) = new.id;
  update public.list_items i set agency_id = new.id
  where i.agency_id is null and i.email_id in (select id from public.emails where agency_id = new.id);
  update public.tasks t set agency_id = new.id
  where t.agency_id is null and (t.email_id in (select id from public.emails where agency_id = new.id)
                                 or t.list_item_id in (select id from public.list_items where agency_id = new.id));
  return null;
end
$$;
create trigger agencies_claim after insert or update of domains, archived on public.agencies
for each row execute function public.agencies_claim();

-- Etapas: borrar una moviendo sus iniciativas a otra, y reordenarlas de una vez.
create function public.delete_stage(p_id uuid, p_move_to uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el gerente puede borrar etapas'; end if;
  if exists (select 1 from public.tasks where sticker_id = p_id) then
    if p_move_to is null or p_move_to = p_id or not exists (select 1 from public.status_stickers where id = p_move_to) then
      raise exception 'Elige a qué etapa pasan sus iniciativas';
    end if;
    update public.tasks set sticker_id = p_move_to where sticker_id = p_id;
  end if;
  delete from public.status_stickers where id = p_id;
end
$$;

create function public.reorder_stages(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo el gerente puede ordenar las etapas'; end if;
  update public.status_stickers s set position = x.o - 1
  from unnest(p_ids) with ordinality x(id, o) where s.id = x.id;
end
$$;

-- Crear etapas también es solo del gerente (editar y borrar ya lo eran).
drop policy stickers_insert on public.status_stickers;
create policy stickers_insert on public.status_stickers for insert to authenticated with check (public.is_admin());

create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if (new.title, new.description, new.priority, new.effort_points, new.due_date, new.specialty, new.brand_id, new.brand_ids, new.agency_id)
       is distinct from (old.title, old.description, old.priority, old.effort_points, old.due_date, old.specialty, old.brand_id, old.brand_ids, old.agency_id) then
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

alter table public.agencies enable row level security;
revoke all on public.agencies from anon;
create policy agencies_select on public.agencies for select to authenticated using (public.is_member());
create policy agencies_admin on public.agencies for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.agencies to authenticated;

grant insert (agency_id) on public.tasks to authenticated;
grant update (agency_id) on public.tasks to authenticated;
grant insert (agency_id) on public.list_items to authenticated;
grant update (agency_id) on public.list_items to authenticated;

alter publication supabase_realtime add table public.agencies;

revoke execute on function public.agency_for_email(text), public.emails_agency(), public.list_items_agency(),
  public.tasks_agency(), public.list_items_agency_follow(), public.agencies_claim() from public, anon, authenticated;
revoke execute on function public.delete_stage(uuid, uuid), public.reorder_stages(uuid[]) from public, anon;
grant execute on function public.delete_stage(uuid, uuid), public.reorder_stages(uuid[]) to authenticated;
