-- M2.2: anonymous complaint channel. By construction it holds NO reference to the reporter or to any company:
-- no user id, no company id, no IP, and only the DAY of creation. It is readable only by explicitly appointed central-team handlers
-- (not by platform admins, not by company coordinators). The reporter follows the case with a code + secret, without signing in.

create table public.anonymous_reports (
  id uuid primary key default gen_random_uuid(),
  case_code text not null unique check (case_code ~ '^AN-[A-HJ-NP-Z2-9]{8}$'),
  secret_hash text not null,
  category text not null check (category in ('complaint','fraud','harassment','other')),
  title text not null check (length(title) between 3 and 200),
  body text not null check (length(body) between 1 and 5000),
  status text not null default 'received' check (status in ('received','reviewing','resolved','closed')),
  day date not null default ((now() at time zone 'Asia/Bangkok')::date) -- day only: a precise time could be matched to a login time
);
create table public.anonymous_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.anonymous_reports(id) on delete cascade,
  kind text not null check (kind in ('status','reply','note','followup')),
  body text not null default '' check (length(body) <= 3000),
  day date not null default ((now() at time zone 'Asia/Bangkok')::date)
);
create index anonymous_events_idx on public.anonymous_events (report_id, id);
create table public.anonymous_handlers (user_id uuid primary key references public.profiles(id) on delete cascade, granted_by uuid, granted_at timestamptz not null default now());
-- spam control without linking a person to a case: how many tokens a person asked for today (never what they wrote)
create table public.anon_token_quota (user_id uuid not null references public.profiles(id) on delete cascade, day date not null default ((now() at time zone 'Asia/Bangkok')::date), n int not null default 0, primary key (user_id, day));
create table public.anon_used_tokens (nonce_hash text primary key, day date not null default ((now() at time zone 'Asia/Bangkok')::date)); -- replay protection; the nonce is random and tied to nobody

alter table public.anonymous_reports enable row level security;
alter table public.anonymous_events enable row level security;
alter table public.anonymous_handlers enable row level security;
alter table public.anon_token_quota enable row level security;
alter table public.anon_used_tokens enable row level security;

create function app.is_anon_handler() returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.anonymous_handlers h where h.user_id = auth.uid()) and app.is_central();
$$;
revoke all on function app.is_anon_handler() from public;
grant execute on function app.is_anon_handler() to authenticated;
grant select on public.anonymous_reports, public.anonymous_events to authenticated;
create policy anon_reports_read on public.anonymous_reports for select to authenticated using (app.is_anon_handler());
create policy anon_events_read on public.anonymous_events for select to authenticated using (app.is_anon_handler());
grant select on public.anonymous_handlers to authenticated;
create policy anon_handlers_read on public.anonymous_handlers for select to authenticated using (app.is_platform_admin() or user_id = auth.uid()); -- admins see WHO handles, never the cases

create function public.admin_set_anon_handler(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_on then
    if not exists (select 1 from public.role_assignments r where r.user_id = p_user and r.scope_type = 'group' and r.role in ('central_team','group_owner')) then raise exception 'err_not_central'; end if;
    insert into public.anonymous_handlers (user_id, granted_by) values (p_user, auth.uid()) on conflict do nothing;
  else
    delete from public.anonymous_handlers where user_id = p_user;
  end if;
end;
$$;

/** A signed-in member asks for a one-time token: at most 3 per day. Returns whether a token may be issued (the route signs it). */
create function public.anon_take_token() returns boolean
language plpgsql security definer set search_path = '' as $$
declare cnt int;
begin
  if not app.is_active() or cardinality(app.my_company_ids()) = 0 then return false; end if;
  insert into public.anon_token_quota (user_id, n) values (auth.uid(), 1) on conflict (user_id, day) do update set n = public.anon_token_quota.n + 1 returning public.anon_token_quota.n into cnt;
  return cnt <= 3;
end;
$$;

-- written by the server only (service role), after it verified the signed token
create function public.anon_submit(p_nonce_hash text, p_code text, p_secret_hash text, p_category text, p_title text, p_body text) returns text
language plpgsql security definer set search_path = '' as $$
declare h uuid; v uuid;
begin
  insert into public.anon_used_tokens (nonce_hash) values (p_nonce_hash); -- a replayed token violates the primary key
  insert into public.anonymous_reports (case_code, secret_hash, category, title, body) values (p_code, p_secret_hash, p_category, trim(p_title), trim(p_body)) returning id into v;
  insert into public.anonymous_events (report_id, kind, body) values (v, 'status', 'received');
  -- handlers learn that a case exists, never what it says; the title of the notice is the case code only
  for h in select user_id from public.anonymous_handlers loop
    perform app.notify(h, 'anon_new', p_code, '', '/anonymous', 'anon:' || v::text || ':' || h::text, '{}'::jsonb);
  end loop;
  perform app.live_ping('anon');
  return p_code;
end;
$$;
create function public.anon_status(p_code text, p_secret_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.anonymous_reports;
begin
  select * into r from public.anonymous_reports where case_code = upper(trim(p_code)) and secret_hash = p_secret_hash;
  if not found then raise exception 'err_anon_not_found'; end if; -- same answer for a wrong code and a wrong secret
  return jsonb_build_object('code', r.case_code, 'status', r.status, 'day', r.day,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'body', e.body, 'day', e.day) order by e.id) from public.anonymous_events e where e.report_id = r.id and e.kind in ('reply','followup','status')), '[]'::jsonb));
end;
$$;
create function public.anon_followup(p_code text, p_secret_hash text, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.anonymous_reports; h uuid;
begin
  select * into r from public.anonymous_reports where case_code = upper(trim(p_code)) and secret_hash = p_secret_hash;
  if not found then raise exception 'err_anon_not_found'; end if;
  if r.status = 'closed' then raise exception 'err_invalid_input'; end if;
  insert into public.anonymous_events (report_id, kind, body) values (r.id, 'followup', left(trim(p_message), 3000));
  for h in select user_id from public.anonymous_handlers loop
    perform app.notify(h, 'anon_followup', r.case_code, '', '/anonymous', 'anonf:' || r.id::text || ':' || h::text || ':' || (select count(*) from public.anonymous_events where report_id = r.id)::text, '{}'::jsonb);
  end loop;
  perform app.live_ping('anon');
end;
$$;

-- handler actions
create function public.anon_set_status(p_id uuid, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_anon_handler() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_status not in ('reviewing','resolved','closed') then raise exception 'err_invalid_input'; end if;
  update public.anonymous_reports set status = p_status where id = p_id;
  if not found then raise exception 'err_not_found'; end if;
  insert into public.anonymous_events (report_id, kind, body) values (p_id, 'status', p_status);
  if length(trim(coalesce(p_note, ''))) > 0 then insert into public.anonymous_events (report_id, kind, body) values (p_id, 'reply', left(trim(p_note), 3000)); end if;
end;
$$;
create function public.anon_reply(p_id uuid, p_kind text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_anon_handler() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_kind not in ('reply','note') or length(trim(coalesce(p_body, ''))) = 0 then raise exception 'err_invalid_input'; end if; -- 'reply' is shown to the reporter, 'note' stays internal
  insert into public.anonymous_events (report_id, kind, body) values (p_id, p_kind, left(trim(p_body), 3000));
end;
$$;

create or replace function app.live_may_hear(p_topic text) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_topic = 'u:' || coalesce(auth.uid()::text, '') then return true; end if;
  if p_topic = 'central' then return app.is_central(); end if;
  if p_topic = 'adm' then return app.is_platform_admin(); end if;
  if p_topic = 'anon' then return app.is_anon_handler(); end if;
  if p_topic like 'co:%' then return app.is_coordinator(substr(p_topic, 4)::uuid); end if;
  if p_topic like 'a:%' then return app.can_see_announcement(substr(p_topic, 3)::uuid); end if;
  if p_topic like 'r:%' then return app.can_see_report(substr(p_topic, 3)::uuid); end if;
  if p_topic like 'i:%' then return app.can_see_idea(substr(p_topic, 3)::uuid); end if;
  return false;
exception when others then
  return false;
end;
$$;

-- retention: used tokens and quotas are only needed for a day or two
create or replace function public.prune_old_data() returns jsonb language plpgsql security definer set search_path = '' as $$
declare a int; b int; c int; d int;
begin
  delete from public.message_log where at < now() - interval '90 days'; get diagnostics a = row_count;
  delete from public.line_link_attempts where at < now() - interval '1 day'; get diagnostics b = row_count;
  delete from public.notification_queue where status <> 'pending' and created_at < now() - interval '30 days'; get diagnostics c = row_count;
  delete from public.company_queue where status <> 'pending' and created_at < now() - interval '30 days'; get diagnostics d = row_count;
  delete from public.cron_ticks where at < now() - interval '30 days';
  delete from public.anon_used_tokens where day < (now() at time zone 'Asia/Bangkok')::date - 2;
  delete from public.anon_token_quota where day < (now() at time zone 'Asia/Bangkok')::date - 2;
  return jsonb_build_object('message_log', a, 'attempts', b, 'queue', c, 'company_queue', d);
end;
$$;

revoke all on function public.admin_set_anon_handler(uuid, boolean), public.anon_take_token(), public.anon_submit(text, text, text, text, text, text),
  public.anon_status(text, text), public.anon_followup(text, text, text), public.anon_set_status(uuid, text, text), public.anon_reply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_anon_handler(uuid, boolean), public.anon_take_token(), public.anon_set_status(uuid, text, text), public.anon_reply(uuid, text, text) to authenticated;
grant execute on function public.anon_submit(text, text, text, text, text, text), public.anon_status(text, text), public.anon_followup(text, text, text) to service_role;

create function public.admin_set_anon_handler_email(p_email text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if u is null then raise exception 'err_no_such_account'; end if;
  perform public.admin_set_anon_handler(u, p_on);
end;
$$;
revoke all on function public.admin_set_anon_handler_email(text, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_anon_handler_email(text, boolean) to authenticated;
