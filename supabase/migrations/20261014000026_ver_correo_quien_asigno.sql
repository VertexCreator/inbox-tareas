-- El texto del correo en la iniciativa también lo ve quien la asignó desde su propio correo.
create or replace function public.can_see_task_email(p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.tasks t
    where t.id = p_task and (coalesce(t.assignee_id, t.suggested_assignee_id) = public.current_member_id()
                             or exists (select 1 from public.subtasks s where s.task_id = t.id and s.assignee_id = public.current_member_id())
                             or exists (select 1 from public.emails e where e.id = t.email_id and e.owner_member_id = public.current_member_id())));
$$;
