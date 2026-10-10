-- Resumen del agente estructurado por prioridad, para dibujarlo en tarjetas en Hoy.
-- summary sigue existiendo (texto corto) para la notificación y como respaldo.
alter table public.agent_runs add column summary_data jsonb;

create or replace function public.log_agent_run(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_data jsonb := p -> 'summary_data';
begin
  perform public.require_admin_or_agent();
  if v_data is not null and jsonb_typeof(v_data) <> 'object' then
    v_data := null;
  end if;
  insert into public.agent_runs (slot, emails_processed, tasks_created, summary, summary_data)
  values (p ->> 'slot', coalesce((p ->> 'emails_processed')::int, 0),
          coalesce((p ->> 'tasks_created')::int, 0), p ->> 'summary', v_data)
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function public.log_agent_run(jsonb) from public, anon, authenticated;
