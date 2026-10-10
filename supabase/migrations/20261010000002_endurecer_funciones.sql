-- Las funciones internas solo se usan dentro de otras SECURITY DEFINER; no hace falta exponerlas.
-- is_member / is_admin / current_member_id siguen expuestas: las usan las políticas RLS y el dashboard.
-- approve_task / reassign_task siguen expuestas a propósito: validan admin por dentro.
revoke execute on function public.actor_label() from authenticated;
revoke execute on function public.require_admin_or_agent() from authenticated;
alter function public.touch_updated_at() set search_path = public;
