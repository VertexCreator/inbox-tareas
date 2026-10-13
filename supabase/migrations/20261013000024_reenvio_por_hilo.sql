-- Si el correo vinculado ya no existe en Gmail (un borrador que luego se envió), el script lo busca por su hilo.
create or replace function public.pending_email_forwards(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.check_ingest_secret(p_secret);
  -- Cada pasada del script queda registrada: el dashboard calcula cuánto falta para la próxima.
  update public.ingest_state set last_forward_check = now() where id = 1;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'task_id', f.task_id,
      'forward', f.forward,
      'has_content', exists (select 1 from public.task_email_content c where c.task_id = f.task_id and c.email_id = f.email_id),
      'gmail_message_id', e.gmail_message_id,
      'gmail_thread_id', e.gmail_thread_id,
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
