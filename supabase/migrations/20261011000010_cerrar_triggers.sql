-- Las funciones de trigger no necesitan EXECUTE para dispararse: se cierran en la API.
revoke execute on function public.assignment_activity(), public.list_items_activity(), public.list_items_email_guard(),
  public.list_items_guard(), public.subtasks_activity(), public.subtasks_guard(), public.tasks_activity(),
  public.tasks_guard(), public.sync_specialties(), public.priorities_render_trigger(), public.tasks_after_insert(),
  public.touch_updated_at() from public, anon, authenticated;
alter function public.level_label(int) set search_path = public;
