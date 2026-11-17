-- M2.4: challenges from executives (with a deadline), points and awards tied to ADOPTION of ideas (never to how many were sent).

-- ============================================================ challenges
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade, -- null = group level
  title text not null check (length(title) between 3 and 200),
  description text not null default '' check (length(description) <= 3000),
  goal text not null default '' check (length(goal) <= 500), -- the year's target this challenge serves
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.ideas add column challenge_id uuid references public.challenges(id) on delete set null;
create index ideas_challenge_idx on public.ideas (challenge_id) where challenge_id is not null;
alter table public.challenges enable row level security;
grant select on public.challenges to authenticated;
create policy challenges_read on public.challenges for select to authenticated using (app.can_see_scope(company_id));

create function public.challenge_create(p_company uuid, p_title text, p_description text, p_goal text, p_closes timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not app.can_manage_scope(p_company) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_closes <= now() then raise exception 'err_invalid_input'; end if;
  insert into public.challenges (company_id, title, description, goal, closes_at, created_by)
    values (p_company, trim(p_title), trim(coalesce(p_description, '')), trim(coalesce(p_goal, '')), p_closes, auth.uid()) returning id into v;
  return v;
end;
$$;
create function public.challenge_close(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.challenges;
begin
  select * into c from public.challenges where id = p_id;
  if not found then raise exception 'err_not_found'; end if;
  if not app.can_manage_scope(c.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.challenges set status = 'closed' where id = p_id;
end;
$$;
/** The person who sent the idea ties it to a challenge that is open, visible to them and fits their company. */
create function public.idea_link_challenge(p_idea uuid, p_challenge uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.ideas; c public.challenges;
begin
  select * into i from public.ideas where id = p_idea for update;
  if not found or i.submitter_id <> auth.uid() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_challenge is null then update public.ideas set challenge_id = null where id = p_idea; return; end if;
  select * into c from public.challenges where id = p_challenge;
  if not found or not app.can_see_scope(c.company_id) then raise exception 'err_not_found'; end if;
  if c.status <> 'open' or c.closes_at <= now() then raise exception 'err_closed'; end if;
  if c.company_id is not null and c.company_id <> i.company_id then raise exception 'err_invalid_input'; end if;
  update public.ideas set challenge_id = p_challenge where id = p_idea;
end;
$$;
create function public.challenges_list() returns table (id uuid, company_id uuid, title text, description text, goal text, closes_at timestamptz, status text, ideas int, manage boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.company_id, c.title, c.description, c.goal, c.closes_at, c.status,
    (select count(*)::int from public.ideas i where i.challenge_id = c.id), app.can_manage_scope(c.company_id)
  from public.challenges c where app.can_see_scope(c.company_id) order by (c.status = 'open' and c.closes_at > now()) desc, c.closes_at;
$$;

-- ============================================================ points (rules are admin-set and public to every signed-in user)
create table public.recognition_rules (
  key text primary key check (key in ('piloted','scaled','outcome_verified','highlight','dare_to_try')),
  points int not null check (points between 0 and 1000)
);
insert into public.recognition_rules (key, points) values ('piloted', 10), ('scaled', 30), ('outcome_verified', 20), ('highlight', 15), ('dare_to_try', 15);
create table public.recognition_points (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  reason text not null references public.recognition_rules(key),
  ref text not null default '',
  points int not null check (points > 0),
  created_at timestamptz not null default now(),
  unique (idea_id, reason, ref) -- an event pays once
);
create index recognition_points_user_idx on public.recognition_points (user_id, created_at desc);
alter table public.recognition_rules enable row level security;
alter table public.recognition_points enable row level security;
grant select on public.recognition_rules, public.recognition_points to authenticated;
create policy rules_read on public.recognition_rules for select to authenticated using (app.is_active());
create policy points_read on public.recognition_points for select to authenticated using (user_id = auth.uid());

create function public.admin_set_points(p_key text, p_points int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.recognition_rules set points = p_points where key = p_key;
  if not found then raise exception 'err_not_found'; end if;
end;
$$;

create function app.award_points(p_user uuid, p_company uuid, p_idea uuid, p_reason text, p_ref text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare pts int;
begin
  select points into pts from public.recognition_rules where key = p_reason;
  if coalesce(pts, 0) <= 0 then return; end if;
  insert into public.recognition_points (user_id, company_id, idea_id, reason, ref, points) values (p_user, p_company, p_idea, p_reason, p_ref, pts) on conflict do nothing;
end;
$$;
revoke all on function app.award_points(uuid, uuid, uuid, text, text) from public;

-- points come from adoption only: an idea entering a pilot, being scaled, or an outcome confirmed by a second person
create function app.idea_stage_points() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage is distinct from old.stage and new.stage in ('piloting','scaled') then
    perform app.award_points(new.submitter_id, new.company_id, new.id, case new.stage when 'piloting' then 'piloted' else 'scaled' end);
  end if;
  return null;
end;
$$;
create trigger ideas_stage_points after update of stage on public.ideas for each row execute function app.idea_stage_points();
create function app.outcome_points() returns trigger language plpgsql security definer set search_path = '' as $$
declare i public.ideas;
begin
  if old.verified_at is null and new.verified_at is not null then
    select * into i from public.ideas where id = new.idea_id;
    perform app.award_points(i.submitter_id, i.company_id, i.id, 'outcome_verified', new.id::text);
  end if;
  return null;
end;
$$;
create trigger idea_outcomes_points after update of verified_at on public.idea_outcomes for each row execute function app.outcome_points();

-- ============================================================ awards: monthly highlight and "dare to try" (a pilot that failed but taught something)
create table public.awards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('monthly_highlight','dare_to_try')),
  month date not null,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  note text not null check (length(note) between 3 and 1000),
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (kind, month, idea_id)
);
create index awards_company_idx on public.awards (company_id, month desc);
alter table public.awards enable row level security;
grant select on public.awards to authenticated;
create policy awards_read on public.awards for select to authenticated using (app.is_active() and (company_id = any (app.my_company_ids()) or app.is_coordinator(company_id)));

create function public.award_grant(p_idea uuid, p_kind text, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.ideas; m date := (date_trunc('month', now() at time zone 'Asia/Bangkok'))::date; v uuid;
begin
  select * into i from public.ideas where id = p_idea for update;
  if not found then raise exception 'err_not_found'; end if;
  if not (app.is_coordinator(i.company_id) or app.is_exec(i.company_id)) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_kind = 'monthly_highlight' then
    if i.stage not in ('piloting','scaled') then raise exception 'err_invalid_input'; end if; -- highlights are for ideas that are being used
  elsif p_kind = 'dare_to_try' then
    if i.stage <> 'declined' or not exists (select 1 from public.idea_stage_events e where e.idea_id = p_idea and e.to_stage = 'piloting') then raise exception 'err_invalid_input'; end if; -- it must have been tried
  else
    raise exception 'err_invalid_input';
  end if;
  insert into public.awards (company_id, kind, month, idea_id, user_id, note, granted_by) values (i.company_id, p_kind, m, p_idea, i.submitter_id, trim(coalesce(p_note, '')), auth.uid()) returning id into v;
  perform app.award_points(i.submitter_id, i.company_id, p_idea, case p_kind when 'monthly_highlight' then 'highlight' else 'dare_to_try' end, m::text);
  perform app.notify(i.submitter_id, 'award_granted', i.title, '', '/recognition', 'award:' || v::text, jsonb_build_object('award', p_kind));
  return v;
end;
$$;

revoke all on function public.challenge_create(uuid, text, text, text, timestamptz), public.challenge_close(uuid), public.idea_link_challenge(uuid, uuid), public.challenges_list(),
  public.admin_set_points(text, int), public.award_grant(uuid, text, text) from public;
grant execute on function public.challenge_create(uuid, text, text, text, timestamptz), public.challenge_close(uuid), public.idea_link_challenge(uuid, uuid), public.challenges_list(),
  public.admin_set_points(text, int), public.award_grant(uuid, text, text) to authenticated;
