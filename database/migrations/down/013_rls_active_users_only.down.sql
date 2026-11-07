-- Rollback 013: user INVITED/INACTIVE kembali bisa membaca data lewat API.
do $$
declare
  t text;
begin
  foreach t in array array[
    'activity_logs', 'meeting_action_items', 'meeting_agendas',
    'meeting_decisions', 'meeting_participants', 'meetings',
    'notification_events', 'notification_preferences', 'notifications',
    'project_managers', 'projects', 'task_suggestions', 'tasks', 'workstreams',
    'profiles'
  ] loop
    execute format('drop policy if exists "Only active users" on public.%I', t);
  end loop;
end
$$;
drop function if exists public.is_active_user();
delete from public.app_migrations where version = '013';
