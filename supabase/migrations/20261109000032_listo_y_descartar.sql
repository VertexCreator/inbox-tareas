-- Lo que está por planificar se puede cerrar sin convertirlo en iniciativa: "✓ Listo" (ya se hizo) o "Descartar",
-- también cuando el agente ya dejó el plan listo para revisar. Se puede deshacer.

alter table public.list_items drop constraint list_items_status_check;
alter table public.list_items add constraint list_items_status_check
  check (status in ('sin_planificar', 'planificando', 'planificado', 'descartado', 'hecho'));

alter table public.list_items
  add column closed_at timestamptz,
  add column closed_by uuid references public.team_members (id) on delete set null,
  -- En qué estado estaba al cerrarlo, para deshacer.
  add column closed_from text;

create function public.close_item(p_item_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  it public.list_items%rowtype;
begin
  if not public.has_perm(public.current_member_id(), 'repartir') then
    raise exception 'Tu cargo no incluye repartir lo que está por planificar';
  end if;
  if p_status not in ('hecho', 'descartado') then raise exception 'Estado inválido'; end if;
  select * into it from public.list_items where id = p_item_id;
  if not found then raise exception 'No existe'; end if;
  if it.task_id is not null or it.status not in ('sin_planificar', 'planificando') then
    raise exception 'Esto ya no está por planificar';
  end if;
  perform set_config('teamflow.trusted', 'on', true);
  update public.plan_recommendations set status = 'descartada', updated_at = now()
  where list_item_id = it.id and status in ('borrador', 'afinada');
  update public.list_items
  set status = p_status, closed_from = it.status, closed_at = now(), closed_by = public.current_member_id(), updated_at = now()
  where id = it.id;
  perform public.log_activity('estado', format(case p_status when 'hecho' then 'marcó como listo "%s"' else 'descartó "%s"' end, it.title), null);
end
$$;

-- Deshacer: vuelve a como estaba; si tenía el plan listo, recupera ese plan.
create function public.reopen_item(p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  it public.list_items%rowtype;
  v_rec uuid;
begin
  if not public.has_perm(public.current_member_id(), 'repartir') then
    raise exception 'Tu cargo no incluye repartir lo que está por planificar';
  end if;
  select * into it from public.list_items where id = p_item_id;
  if not found or it.status not in ('hecho', 'descartado') then raise exception 'Ya no se puede deshacer'; end if;
  perform set_config('teamflow.trusted', 'on', true);
  if it.closed_from = 'planificando' then
    select id into v_rec from public.plan_recommendations
    where list_item_id = it.id and status = 'descartada' order by updated_at desc limit 1;
    update public.plan_recommendations
    set status = case when refined_by_ai then 'afinada' else 'borrador' end, updated_at = now()
    where id = v_rec;
  end if;
  update public.list_items
  set status = case when v_rec is not null then 'planificando' else 'sin_planificar' end,
      closed_from = null, closed_at = null, closed_by = null, updated_at = now()
  where id = it.id;
end
$$;

revoke execute on function public.close_item(uuid, text), public.reopen_item(uuid) from public, anon;
grant execute on function public.close_item(uuid, text), public.reopen_item(uuid) to authenticated;
