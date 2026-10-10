-- Desde Hoy, el admin convierte un correo en pendiente: el pendiente guarda el vínculo al correo.
-- Solo un admin puede enlazar un correo (el equipo no ve los correos).
create function public.list_items_email_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_id is not null and auth.jwt() is not null and not public.is_admin() then
    raise exception 'Solo el administrador puede enlazar correos';
  end if;
  return new;
end
$$;
create trigger list_items_email_guard before insert or update of email_id on public.list_items
for each row execute function public.list_items_email_guard();
grant insert (email_id) on public.list_items to authenticated;
