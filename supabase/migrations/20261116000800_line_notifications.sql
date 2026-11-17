-- M1.6: notifications outside the app. LINE linking by one-time code, a delivery queue with retry keys, per-user preferences,
-- company webhook channels (Teams / Google Chat). All delivery tables are server-only (no browser policies).

create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('line')),
  address text, -- LINE userId; null while pending
  status text not null default 'pending' check (status in ('pending','active','stopped')),
  code_hash text, code_expires_at timestamptz,
  last_error text, verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, channel)
);
-- one LINE account belongs to exactly one person (a gap the ThaiPass implementation noted)
create unique index notification_channels_line_address on public.notification_channels (address) where channel = 'line' and address is not null;
create index notification_channels_code on public.notification_channels (code_hash) where status = 'pending';

create table public.notification_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  grp text not null check (grp in ('work','news','reminders')),
  line boolean not null default true,
  primary key (user_id, grp)
);
create table public.notification_queue (
  id uuid primary key default gen_random_uuid(), -- also the X-Line-Retry-Key: a repeat send is recognised by LINE and not delivered twice
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null default 'line',
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts int not null default 0, next_attempt_at timestamptz not null default now(),
  last_error text, created_at timestamptz not null default now(), sent_at timestamptz,
  unique (notification_id, channel)
);
create index notification_queue_due on public.notification_queue (next_attempt_at) where status = 'pending';
create table public.message_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid, channel text not null, kind text,
  status text not null check (status in ('sent','failed')), error text
);
create index message_log_idx on public.message_log (channel, at desc);
create table public.company_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('teams_webhook','gchat_webhook')),
  webhook_url text not null check (webhook_url ~ '^https://'),
  enabled boolean not null default true,
  events text[] not null default array['announcement','report_overdue'],
  last_error text, created_at timestamptz not null default now(),
  unique (company_id, kind)
);
create table public.company_queue (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.company_channels(id) on delete cascade,
  event text not null, title text not null, href text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts int not null default 0, next_attempt_at timestamptz not null default now(),
  last_error text, created_at timestamptz not null default now()
);
create index company_queue_due on public.company_queue (next_attempt_at) where status = 'pending';
create table public.line_link_attempts (
  id bigint generated always as identity primary key,
  line_user_id text not null, at timestamptz not null default now()
);
create index line_link_attempts_idx on public.line_link_attempts (line_user_id, at desc);

alter table public.notification_channels enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_queue enable row level security;
alter table public.message_log enable row level security;
alter table public.company_channels enable row level security;
alter table public.company_queue enable row level security;
alter table public.line_link_attempts enable row level security;

grant select, insert, update (line) on public.notification_prefs to authenticated;
create policy prefs_read on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy prefs_insert on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy prefs_update on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.message_log to authenticated;
create policy message_log_read on public.message_log for select to authenticated using (app.is_platform_admin());
-- notification_channels, notification_queue, company_channels, company_queue, line_link_attempts: no policy, no grant = server only

create function app.kind_group(p_kind text) returns text language sql immutable set search_path = '' as $$
  select case
    when p_kind in ('announcement','must_read') then 'news'
    when p_kind in ('report_due','report_overdue','report_escalated','idea_overdue','ack_reminder') then 'reminders'
    else 'work' end;
$$;

-- every in-app notice is also queued for LINE when the person linked LINE and did not switch that group off
create function app.enqueue_line() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.notification_channels c where c.user_id = new.user_id and c.channel = 'line' and c.status = 'active')
     and coalesce((select p.line from public.notification_prefs p where p.user_id = new.user_id and p.grp = app.kind_group(new.kind)), true) then
    insert into public.notification_queue (notification_id, user_id) values (new.id, new.user_id) on conflict do nothing;
  end if;
  return null;
exception when others then
  raise warning 'enqueue_line failed: %', sqlerrm; -- never undo the notice because of the queue
  return null;
end;
$$;
create trigger notifications_enqueue_line after insert on public.notifications for each row execute function app.enqueue_line();

-- people see the STATE of their own channel, never the address or the code hash
create function public.my_channels() returns table (channel text, status text, code_expires_at timestamptz, last_error text, verified_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.channel, c.status, c.code_expires_at, c.last_error, c.verified_at from public.notification_channels c where c.user_id = auth.uid();
$$;
create function public.unlink_channel(p_channel text) returns void language sql security definer set search_path = '' as $$
  delete from public.notification_channels where user_id = auth.uid() and channel = p_channel;
$$;
create function public.can_coordinate(p_company uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_coordinator(p_company);
$$;
revoke all on function public.my_channels(), public.unlink_channel(text), public.can_coordinate(uuid) from public;
grant execute on function public.my_channels(), public.unlink_channel(text), public.can_coordinate(uuid) to authenticated;
revoke all on function app.kind_group(text), app.enqueue_line() from public;

-- a link-state change is shown live to the person
create function app.channel_ping() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.live_ping('u:' || new.user_id::text);
  return null;
end;
$$;
create trigger notification_channels_live after insert or update on public.notification_channels for each row execute function app.channel_ping();

-- company webhook events
create function app.enqueue_company_event(p_company uuid, p_event text, p_title text, p_href text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.company_queue (channel_id, event, title, href)
  select c.id, p_event, left(p_title, 200), p_href from public.company_channels c where c.company_id = p_company and c.enabled and p_event = any (c.events);
exception when others then
  raise warning 'enqueue_company_event failed: %', sqlerrm;
end;
$$;
revoke all on function app.enqueue_company_event(uuid, text, text, text) from public;
create function app.announcement_company_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and old.status = 'draft' and new.company_id is not null then
    perform app.enqueue_company_event(new.company_id, 'announcement', new.title, '/news/' || new.id::text);
  end if;
  return null;
end;
$$;
create trigger announcements_company_event after update of status on public.announcements for each row execute function app.announcement_company_event();
create function app.report_company_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.escalation_level > old.escalation_level then
    perform app.enqueue_company_event(new.company_id, 'report_overdue', new.title, '/reports/' || new.id::text);
  end if;
  return null;
end;
$$;
create trigger reports_company_event after update of escalation_level on public.reports for each row execute function app.report_company_event();

-- the flush endpoint is called every 2 minutes from inside the database (pg_net); the secret lives in the server-only settings table
create function public.run_flush() returns void language plpgsql security definer set search_path = '' as $$
declare cfg jsonb;
begin
  select value into cfg from public.platform_settings where key = 'cron';
  if cfg is null or coalesce(cfg ->> 'url', '') = '' or coalesce(cfg ->> 'secret', '') = '' then return; end if;
  perform net.http_post(url := cfg ->> 'url', headers := jsonb_build_object('Authorization', 'Bearer ' || (cfg ->> 'secret'), 'Content-Type', 'application/json'), body := '{}'::jsonb);
exception when others then
  raise warning 'run_flush failed: %', sqlerrm;
end;
$$;
revoke all on function public.run_flush() from public, anon, authenticated;
grant execute on function public.run_flush() to service_role;

do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net not available: %', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    begin
      perform cron.unschedule('tonkla-flush');
    exception when others then null;
    end;
    perform cron.schedule('tonkla-flush', '*/2 * * * *', 'select public.run_flush()');
  end if;
end $$;
