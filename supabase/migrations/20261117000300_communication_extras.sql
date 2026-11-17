-- M2.3: emergency reports, Q&A / town hall, events with RSVP, polls.
-- Scope rule shared by Q&A, events and polls: company_id NULL = group level (created by the central team, seen by every active member),
-- otherwise one company (created by its coordinator or executive, seen by its members and coordinators).

create function app.can_see_scope(p_company uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and (
    app.is_central()
    or (p_company is null and cardinality(app.my_company_ids()) > 0)
    or (p_company is not null and (p_company = any (app.my_company_ids()) or app.is_coordinator(p_company))));
$$;
create function app.can_manage_scope(p_company uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and ((p_company is null and app.is_central()) or (p_company is not null and (app.is_coordinator(p_company) or app.is_exec(p_company))));
$$;
revoke all on function app.can_see_scope(uuid), app.can_manage_scope(uuid) from public;
grant execute on function app.can_see_scope(uuid), app.can_manage_scope(uuid) to authenticated;

create function app.central_user_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct r.user_id from public.role_assignments r join public.profiles p on p.id = r.user_id and p.status = 'active'
  where r.scope_type = 'group' and r.role in ('central_team','group_owner');
$$;
revoke all on function app.central_user_ids() from public;

-- urgent notices skip the person's "work" preference: an emergency must reach them
create or replace function app.kind_group(p_kind text) returns text language sql immutable set search_path = '' as $$
  select case
    when p_kind in ('announcement','must_read') then 'news'
    when p_kind in ('report_due','report_overdue','report_escalated','idea_overdue','ack_reminder') then 'reminders'
    when p_kind in ('emergency_new','emergency_escalated') then 'urgent'
    else 'work' end;
$$;
create or replace function app.enqueue_line() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.notification_channels c where c.user_id = new.user_id and c.channel = 'line' and c.status = 'active')
     and (app.kind_group(new.kind) = 'urgent'
          or coalesce((select p.line from public.notification_prefs p where p.user_id = new.user_id and p.grp = app.kind_group(new.kind)), true)) then
    insert into public.notification_queue (notification_id, user_id) values (new.id, new.user_id) on conflict do nothing;
  end if;
  return null;
exception when others then
  raise warning 'enqueue_line failed: %', sqlerrm;
  return null;
end;
$$;

-- ============================================================ emergency reports
create table public.emergency_incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id),
  category text not null check (category in ('safety','health','security','facility','other')),
  place text not null check (length(place) between 1 and 200),
  body text not null check (length(body) between 1 and 2000),
  phone text check (phone is null or phone ~ '^[0-9+() -]{5,20}$'),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  handled_by uuid references public.profiles(id),
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index emergency_company_idx on public.emergency_incidents (company_id, status, created_at desc);
create table public.emergency_events (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.emergency_incidents(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('created','status','note')),
  body text not null default '' check (length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index emergency_events_idx on public.emergency_events (incident_id, id);
alter table public.emergency_incidents enable row level security;
alter table public.emergency_events enable row level security;

create function app.can_see_incident(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.emergency_incidents i where i.id = p_id and (i.reporter_id = auth.uid() or app.is_coordinator(i.company_id)));
$$;
revoke all on function app.can_see_incident(uuid) from public;
grant execute on function app.can_see_incident(uuid) to authenticated;
grant select on public.emergency_incidents, public.emergency_events to authenticated;
create policy emergency_read on public.emergency_incidents for select to authenticated using (reporter_id = auth.uid() or (app.is_active() and app.is_coordinator(company_id)));
create policy emergency_events_read on public.emergency_events for select to authenticated using (app.can_see_incident(incident_id));

create function public.report_emergency(p_company uuid, p_category text, p_place text, p_body text, p_phone text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; u uuid; cname text;
begin
  if not app.is_active() or not (p_company = any (app.my_company_ids())) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.emergency_incidents where reporter_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then raise exception 'err_too_many'; end if;
  insert into public.emergency_incidents (company_id, reporter_id, category, place, body, phone)
    values (p_company, auth.uid(), p_category, trim(p_place), trim(p_body), nullif(trim(coalesce(p_phone, '')), '')) returning id into v;
  insert into public.emergency_events (incident_id, actor_id, kind) values (v, auth.uid(), 'created');
  select name_th into cname from public.companies where id = p_company;
  -- the notice carries the kind of event and the company only: the details stay inside the app
  for u in select app.company_coordinator_ids(p_company) union select app.central_user_ids() loop
    perform app.notify(u, 'emergency_new', 'emergency', '', '/emergency/' || v::text, 'em:' || v::text || ':' || u::text, jsonb_build_object('category', p_category, 'company', cname));
  end loop;
  perform app.live_ping('co:' || p_company::text);
  perform app.live_ping('central');
  return v;
end;
$$;

create function public.emergency_set_status(p_id uuid, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare i public.emergency_incidents;
begin
  select * into i from public.emergency_incidents where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.is_active() or not app.is_coordinator(i.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_status not in ('acknowledged','resolved') or i.status = 'resolved' then raise exception 'err_invalid_input'; end if;
  update public.emergency_incidents set status = p_status, handled_by = coalesce(handled_by, auth.uid()), updated_at = now() where id = p_id;
  insert into public.emergency_events (incident_id, actor_id, kind, body) values (p_id, auth.uid(), 'status', p_status);
  if length(trim(coalesce(p_note, ''))) > 0 then insert into public.emergency_events (incident_id, actor_id, kind, body) values (p_id, auth.uid(), 'note', left(trim(p_note), 2000)); end if;
  perform app.notify(i.reporter_id, 'emergency_update', 'emergency', '', '/emergency/' || p_id::text, 'emu:' || p_id::text || ':' || p_status, jsonb_build_object('status', p_status));
  perform app.live_ping('u:' || i.reporter_id::text);
end;
$$;

create function public.emergency_add_note(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.emergency_incidents; u uuid; n bigint;
begin
  select * into i from public.emergency_incidents where id = p_id;
  if not found or not app.can_see_incident(p_id) then raise exception 'err_not_found'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'err_invalid_input'; end if;
  insert into public.emergency_events (incident_id, actor_id, kind, body) values (p_id, auth.uid(), 'note', left(trim(p_body), 2000)) returning id into n;
  if auth.uid() = i.reporter_id then
    for u in select coalesce(i.handled_by, c) from app.company_coordinator_ids(i.company_id) c limit 1 loop
      perform app.notify(u, 'emergency_note', 'emergency', '', '/emergency/' || p_id::text, 'emn:' || n::text, '{}'::jsonb);
    end loop;
  else
    perform app.notify(i.reporter_id, 'emergency_note', 'emergency', '', '/emergency/' || p_id::text, 'emn:' || n::text, '{}'::jsonb);
  end if;
end;
$$;

/** Nobody picked it up within 10 minutes: tell the central team once. Runs every minute from pg_cron. */
create function public.run_emergency_escalation() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; u uuid; n int := 0; cname text;
begin
  for r in select * from public.emergency_incidents where status = 'open' and escalated_at is null and created_at < now() - interval '10 minutes' for update skip locked loop
    update public.emergency_incidents set escalated_at = now() where id = r.id;
    select name_th into cname from public.companies where id = r.company_id;
    for u in select app.central_user_ids() loop
      perform app.notify(u, 'emergency_escalated', 'emergency', '', '/emergency/' || r.id::text, 'eme:' || r.id::text || ':' || u::text, jsonb_build_object('category', r.category, 'company', cname));
    end loop;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.run_emergency_escalation() from public;

-- ============================================================ Q&A / town hall
create table public.qa_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  title text not null check (length(title) between 3 and 200),
  description text not null default '' check (length(description) <= 2000),
  created_by uuid not null references public.profiles(id),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);
create table public.qa_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.qa_sessions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(body) between 3 and 500),
  hide_name boolean not null default false, -- hides the name from other employees; the hosts can still see who asked (told on the form)
  status text not null default 'open' check (status in ('open','answered','hidden')),
  answer text check (answer is null or length(answer) <= 3000),
  answered_by uuid references public.profiles(id),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index qa_questions_idx on public.qa_questions (session_id, created_at);
create table public.qa_votes (
  question_id uuid not null references public.qa_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (question_id, user_id)
);
alter table public.qa_sessions enable row level security;
alter table public.qa_questions enable row level security;
alter table public.qa_votes enable row level security;
grant select on public.qa_sessions, public.qa_questions, public.qa_votes to authenticated;
create policy qa_sessions_read on public.qa_sessions for select to authenticated using (app.can_see_scope(company_id));
-- the table itself shows a question only to its author and the hosts; everyone else reads through qa_list(), which hides names
create policy qa_questions_read on public.qa_questions for select to authenticated using (
  author_id = auth.uid() or exists (select 1 from public.qa_sessions s where s.id = session_id and app.can_manage_scope(s.company_id)));
create policy qa_votes_read on public.qa_votes for select to authenticated using (user_id = auth.uid());

create function public.qa_create_session(p_company uuid, p_title text, p_description text, p_closes timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not app.can_manage_scope(p_company) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_closes <= now() then raise exception 'err_invalid_input'; end if;
  insert into public.qa_sessions (company_id, title, description, created_by, closes_at) values (p_company, trim(p_title), trim(coalesce(p_description, '')), auth.uid(), p_closes) returning id into v;
  return v;
end;
$$;
create function public.qa_close_session(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.qa_sessions;
begin
  select * into s from public.qa_sessions where id = p_id;
  if not found then raise exception 'err_not_found'; end if;
  if not app.can_manage_scope(s.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.qa_sessions set status = 'closed' where id = p_id;
  perform app.live_ping('q:' || p_id::text);
end;
$$;
create function public.qa_ask(p_session uuid, p_body text, p_hide boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.qa_sessions; v uuid;
begin
  select * into s from public.qa_sessions where id = p_session;
  if not found or not app.can_see_scope(s.company_id) then raise exception 'err_not_found'; end if;
  if s.status <> 'open' or s.closes_at <= now() then raise exception 'err_closed'; end if;
  if (select count(*) from public.qa_questions where session_id = p_session and author_id = auth.uid()) >= 5 then raise exception 'err_too_many'; end if;
  insert into public.qa_questions (session_id, author_id, body, hide_name) values (p_session, auth.uid(), trim(p_body), coalesce(p_hide, false)) returning id into v;
  perform app.live_ping('q:' || p_session::text);
  return v;
end;
$$;
create function public.qa_vote(p_question uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare q public.qa_questions; s public.qa_sessions; n int;
begin
  select * into q from public.qa_questions where id = p_question;
  if not found then raise exception 'err_not_found'; end if;
  select * into s from public.qa_sessions where id = q.session_id;
  if not app.can_see_scope(s.company_id) then raise exception 'err_not_found'; end if;
  if s.status <> 'open' or s.closes_at <= now() or q.status = 'hidden' then raise exception 'err_closed'; end if;
  delete from public.qa_votes where question_id = p_question and user_id = auth.uid();
  get diagnostics n = row_count;
  if n = 0 then insert into public.qa_votes (question_id, user_id) values (p_question, auth.uid()); end if; -- a second press takes the vote back
  perform app.live_ping('q:' || q.session_id::text);
  return n = 0;
end;
$$;
create function public.qa_answer(p_question uuid, p_answer text) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.qa_questions; s public.qa_sessions;
begin
  select * into q from public.qa_questions where id = p_question for update;
  if not found then raise exception 'err_not_found'; end if;
  select * into s from public.qa_sessions where id = q.session_id;
  if not app.can_manage_scope(s.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_answer, ''))) = 0 then raise exception 'err_invalid_input'; end if;
  update public.qa_questions set answer = left(trim(p_answer), 3000), status = 'answered', answered_by = auth.uid(), answered_at = now() where id = p_question;
  perform app.notify(q.author_id, 'qa_answered', 'qa', '', '/qa/' || q.session_id::text, 'qa:' || p_question::text, '{}'::jsonb);
  perform app.live_ping('q:' || q.session_id::text);
end;
$$;
create function public.qa_hide(p_question uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.qa_questions; s public.qa_sessions;
begin
  select * into q from public.qa_questions where id = p_question;
  if not found then raise exception 'err_not_found'; end if;
  select * into s from public.qa_sessions where id = q.session_id;
  if not app.can_manage_scope(s.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.qa_questions set status = case when p_on then 'hidden' when answer is not null then 'answered' else 'open' end where id = p_question;
  perform app.live_ping('q:' || q.session_id::text);
end;
$$;
/** The list everyone reads: names are hidden where the asker chose so (hosts and the asker still see them); hidden questions only for hosts. */
create function public.qa_list(p_session uuid) returns table (id uuid, body text, status text, answer text, answered_at timestamptz, asker text, votes int, voted boolean, mine boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare s public.qa_sessions; host boolean;
begin
  select * into s from public.qa_sessions where public.qa_sessions.id = p_session;
  if not found or not app.can_see_scope(s.company_id) then raise exception 'err_not_found'; end if;
  host := app.can_manage_scope(s.company_id);
  return query
    select q.id, q.body, q.status, q.answer, q.answered_at,
      case when q.hide_name and not host and q.author_id <> auth.uid() then null else (select pr.display_name from public.profiles pr where pr.id = q.author_id) end,
      (select count(*)::int from public.qa_votes v where v.question_id = q.id),
      exists (select 1 from public.qa_votes v where v.question_id = q.id and v.user_id = auth.uid()),
      q.author_id = auth.uid(), q.created_at
    from public.qa_questions q
    where q.session_id = p_session and (host or q.status <> 'hidden')
    order by (q.status = 'answered') desc, (select count(*) from public.qa_votes v where v.question_id = q.id) desc, q.created_at;
end;
$$;

-- ============================================================ events with RSVP
create table public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  title text not null check (length(title) between 3 and 200),
  description text not null default '' check (length(description) <= 3000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '' check (length(location) <= 200),
  link text check (link is null or link ~ '^https://[^[:space:]]{3,255}$'),
  capacity int check (capacity is null or capacity between 1 and 100000),
  status text not null default 'published' check (status in ('published','cancelled')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index events_start_idx on public.events (starts_at);
create table public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('going','maybe','no')),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
grant select on public.events, public.event_rsvps to authenticated;
create policy events_read on public.events for select to authenticated using (app.can_see_scope(company_id));
create policy rsvps_read on public.event_rsvps for select to authenticated using (user_id = auth.uid()); -- the guest list comes from event_guests() for hosts only

create function public.event_create(p_company uuid, p_title text, p_description text, p_starts timestamptz, p_ends timestamptz, p_location text, p_link text, p_capacity int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not app.can_manage_scope(p_company) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  insert into public.events (company_id, title, description, starts_at, ends_at, location, link, capacity, created_by)
    values (p_company, trim(p_title), trim(coalesce(p_description, '')), p_starts, p_ends, trim(coalesce(p_location, '')), nullif(trim(coalesce(p_link, '')), ''), p_capacity, auth.uid()) returning id into v;
  return v;
end;
$$;
create function public.event_cancel(p_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare e public.events; r record; n int := 0;
begin
  select * into e from public.events where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.can_manage_scope(e.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if e.status = 'cancelled' then return 0; end if;
  update public.events set status = 'cancelled' where id = p_id;
  for r in select user_id from public.event_rsvps where event_id = p_id and response in ('going','maybe') loop
    perform app.notify(r.user_id, 'event_cancelled', 'event', '', '/events/' || p_id::text, 'evc:' || p_id::text || ':' || r.user_id::text, jsonb_build_object('title', e.title));
    n := n + 1;
  end loop;
  return n;
end;
$$;
create function public.event_rsvp(p_id uuid, p_response text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events; going int; was text;
begin
  if p_response not in ('going','maybe','no') then raise exception 'err_invalid_input'; end if;
  select * into e from public.events where id = p_id for update; -- the lock keeps the capacity count honest when two people answer at once
  if not found or not app.can_see_scope(e.company_id) then raise exception 'err_not_found'; end if;
  if e.status <> 'published' or coalesce(e.ends_at, e.starts_at) < now() then raise exception 'err_closed'; end if;
  select response into was from public.event_rsvps where event_id = p_id and user_id = auth.uid();
  if p_response = 'going' and e.capacity is not null and was is distinct from 'going' then
    select count(*) into going from public.event_rsvps where event_id = p_id and response = 'going';
    if going >= e.capacity then raise exception 'err_event_full'; end if;
  end if;
  insert into public.event_rsvps (event_id, user_id, response) values (p_id, auth.uid(), p_response)
    on conflict (event_id, user_id) do update set response = excluded.response, updated_at = now();
end;
$$;
/** Events with the numbers everyone may see (how many are going) and the caller's own answer. */
create function public.events_list(p_from timestamptz default now() - interval '1 day') returns table (id uuid, company_id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz, location text, link text, capacity int, status text, going int, maybe int, mine text, manage boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.company_id, e.title, e.description, e.starts_at, e.ends_at, e.location, e.link, e.capacity, e.status,
    (select count(*)::int from public.event_rsvps r where r.event_id = e.id and r.response = 'going'),
    (select count(*)::int from public.event_rsvps r where r.event_id = e.id and r.response = 'maybe'),
    (select r.response from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()),
    app.can_manage_scope(e.company_id)
  from public.events e where app.can_see_scope(e.company_id) and coalesce(e.ends_at, e.starts_at) >= p_from order by e.starts_at;
$$;
create function public.event_guests(p_id uuid) returns table (user_id uuid, display_name text, response text)
language plpgsql stable security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where public.events.id = p_id;
  if not found or not app.can_manage_scope(e.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  return query select r.user_id, p.display_name, r.response from public.event_rsvps r join public.profiles p on p.id = r.user_id where r.event_id = p_id order by r.response, p.display_name;
end;
$$;

-- ============================================================ polls
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  question text not null check (length(question) between 3 and 300),
  multi boolean not null default false,
  results_mode text not null default 'after_vote' check (results_mode in ('after_vote','after_close')),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (length(label) between 1 and 120),
  pos int not null
);
create index poll_options_idx on public.poll_options (poll_id, pos);
-- a ballot: who voted is known (to stop double votes), what each person chose is readable only by that person
create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (poll_id, user_id, option_id)
);
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
grant select on public.polls, public.poll_options, public.poll_votes to authenticated;
create policy polls_read on public.polls for select to authenticated using (app.can_see_scope(company_id));
create policy poll_options_read on public.poll_options for select to authenticated using (exists (select 1 from public.polls p where p.id = poll_id and app.can_see_scope(p.company_id)));
create policy poll_votes_read on public.poll_votes for select to authenticated using (user_id = auth.uid());

create function public.poll_create(p_company uuid, p_question text, p_options text[], p_multi boolean, p_mode text, p_closes timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; i int; o text;
begin
  if not app.can_manage_scope(p_company) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_closes <= now() or cardinality(p_options) < 2 or cardinality(p_options) > 10 or p_mode not in ('after_vote','after_close') then raise exception 'err_invalid_input'; end if;
  insert into public.polls (company_id, question, multi, results_mode, closes_at, created_by) values (p_company, trim(p_question), coalesce(p_multi, false), p_mode, p_closes, auth.uid()) returning id into v;
  i := 0;
  foreach o in array p_options loop
    if length(trim(o)) = 0 then raise exception 'err_invalid_input'; end if;
    insert into public.poll_options (poll_id, label, pos) values (v, left(trim(o), 120), i);
    i := i + 1;
  end loop;
  return v;
end;
$$;
create function public.poll_close(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.polls;
begin
  select * into p from public.polls where id = p_id;
  if not found then raise exception 'err_not_found'; end if;
  if not app.can_manage_scope(p.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.polls set status = 'closed' where id = p_id;
end;
$$;
create function public.poll_vote(p_id uuid, p_options uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.polls; o uuid;
begin
  select * into p from public.polls where id = p_id;
  if not found or not app.can_see_scope(p.company_id) then raise exception 'err_not_found'; end if;
  if p.status <> 'open' or p.closes_at <= now() then raise exception 'err_closed'; end if;
  if cardinality(p_options) < 1 or (not p.multi and cardinality(p_options) <> 1) then raise exception 'err_invalid_input'; end if;
  if exists (select 1 from public.poll_votes where poll_id = p_id and user_id = auth.uid()) then raise exception 'err_already_done'; end if; -- one ballot per person; it cannot be changed
  foreach o in array (select array_agg(distinct x) from unnest(p_options) x) loop
    if not exists (select 1 from public.poll_options where id = o and poll_id = p_id) then raise exception 'err_invalid_input'; end if;
    insert into public.poll_votes (poll_id, option_id, user_id) values (p_id, o, auth.uid());
  end loop;
end;
$$;
/** Counts only. Everyone sees them once the poll closed (or right after voting, by the poll's setting); hosts always. Nobody sees who chose what. */
create function public.poll_results(p_id uuid) returns table (option_id uuid, label text, votes int, voters int)
language plpgsql stable security definer set search_path = '' as $$
declare p public.polls; done boolean; closed boolean;
begin
  select * into p from public.polls where id = p_id;
  if not found or not app.can_see_scope(p.company_id) then raise exception 'err_not_found'; end if;
  closed := p.status = 'closed' or p.closes_at <= now();
  done := exists (select 1 from public.poll_votes where poll_id = p_id and user_id = auth.uid());
  if not (closed or app.can_manage_scope(p.company_id) or (p.results_mode = 'after_vote' and done)) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  return query select o.id, o.label, (select count(*)::int from public.poll_votes v where v.option_id = o.id),
    (select count(distinct v.user_id)::int from public.poll_votes v where v.poll_id = p_id) from public.poll_options o where o.poll_id = p_id order by o.pos;
end;
$$;

-- ============================================================ live topic for a Q&A page
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
  if p_topic like 'q:%' then return exists (select 1 from public.qa_sessions s where s.id = substr(p_topic, 3)::uuid and app.can_see_scope(s.company_id)); end if;
  return false;
exception when others then
  return false;
end;
$$;

-- ============================================================ permissions of the public functions: signed-in users only (each one checks inside)
revoke all on function public.report_emergency(uuid, text, text, text, text), public.emergency_set_status(uuid, text, text), public.emergency_add_note(uuid, text),
  public.qa_create_session(uuid, text, text, timestamptz), public.qa_close_session(uuid), public.qa_ask(uuid, text, boolean), public.qa_vote(uuid), public.qa_answer(uuid, text), public.qa_hide(uuid, boolean), public.qa_list(uuid),
  public.event_create(uuid, text, text, timestamptz, timestamptz, text, text, int), public.event_cancel(uuid), public.event_rsvp(uuid, text), public.events_list(timestamptz), public.event_guests(uuid),
  public.poll_create(uuid, text, text[], boolean, text, timestamptz), public.poll_close(uuid), public.poll_vote(uuid, uuid[]), public.poll_results(uuid) from public;
grant execute on function public.report_emergency(uuid, text, text, text, text), public.emergency_set_status(uuid, text, text), public.emergency_add_note(uuid, text),
  public.qa_create_session(uuid, text, text, timestamptz), public.qa_close_session(uuid), public.qa_ask(uuid, text, boolean), public.qa_vote(uuid), public.qa_answer(uuid, text), public.qa_hide(uuid, boolean), public.qa_list(uuid),
  public.event_create(uuid, text, text, timestamptz, timestamptz, text, text, int), public.event_cancel(uuid), public.event_rsvp(uuid, text), public.events_list(timestamptz), public.event_guests(uuid),
  public.poll_create(uuid, text, text[], boolean, text, timestamptz), public.poll_close(uuid), public.poll_vote(uuid, uuid[]), public.poll_results(uuid) to authenticated;

-- ============================================================ scheduling: unattended emergencies are escalated within a minute of the 10-minute mark
do $$
begin
  if to_regnamespace('cron') is not null then
    begin
      perform cron.unschedule('tonkla-emergency');
    exception when others then null;
    end;
    perform cron.schedule('tonkla-emergency', '* * * * *', 'select public.run_emergency_escalation()');
  end if;
end $$;
