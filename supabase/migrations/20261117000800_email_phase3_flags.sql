-- Phase 3 groundwork: e-mail as a second outside channel (urgent notices always, everything else only when the person opts in),
-- and the Phase 3 feature switches for rollout waves.

alter table public.notification_prefs add column email boolean not null default false;
grant update (email) on public.notification_prefs to authenticated;

create or replace function app.enqueue_line() returns trigger language plpgsql security definer set search_path = '' as $$
declare urgent boolean := app.kind_group(new.kind) = 'urgent';
begin
  if exists (select 1 from public.notification_channels c where c.user_id = new.user_id and c.channel = 'line' and c.status = 'active')
     and (urgent or coalesce((select p.line from public.notification_prefs p where p.user_id = new.user_id and p.grp = app.kind_group(new.kind)), true)) then
    insert into public.notification_queue (notification_id, user_id) values (new.id, new.user_id) on conflict do nothing;
  end if;
  -- e-mail: the address is looked up when sending (never stored here); urgent notices always, others only for people who switched it on
  if urgent or coalesce((select p.email from public.notification_prefs p where p.user_id = new.user_id and p.grp = app.kind_group(new.kind)), false) then
    insert into public.notification_queue (notification_id, user_id, channel) values (new.id, new.user_id, 'email') on conflict do nothing;
  end if;
  return null;
exception when others then
  raise warning 'enqueue failed: %', sqlerrm; -- never undo the notice because of the queue
  return null;
end;
$$;

alter table public.rollout_waves drop constraint rollout_waves_features_check;
alter table public.rollout_waves add constraint rollout_waves_features_check check (features <@ array[
  'anonymous_channel','emergency','qa','events','polls','challenges','idea_library','recognition','knowledge_base','group_dashboard',
  'teams','idea_adoption','pilot_budget','communities','annual_awards','ai_assistant']);
