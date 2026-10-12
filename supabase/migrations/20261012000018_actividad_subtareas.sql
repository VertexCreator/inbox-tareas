-- Las subtareas creadas junto con su iniciativa (misma operación) no se anotan una por una en la actividad:
-- ya queda la línea "asignó … con N subtareas". Solo se anotan las que se agregan después.
create or replace function public.subtasks_insert_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated'
     and (select created_at from public.tasks where id = new.task_id) < now() then
    perform public.log_activity('subtarea', format('agregó la subtarea "%s" a "%s"', new.title,
      (select title from public.tasks where id = new.task_id)), new.task_id);
  end if;
  return null;
end
$$;
revoke execute on function public.subtasks_insert_activity() from public, anon, authenticated;
