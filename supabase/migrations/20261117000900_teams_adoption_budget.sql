-- M3.1: cross-department / cross-company teams around an idea, "adopt at my company" for ideas opened to the group, small pilot budgets with fast approval.

-- ============================================================ teams
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid references public.ideas(id) on delete set null,
  name text not null check (length(name) between 3 and 120),
  purpose text not null default '' check (length(purpose) <= 1000),
  lead_id uuid not null references public.profiles(id),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);
create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','active','declined')),
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create table public.team_posts (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index team_posts_idx on public.team_posts (team_id, id);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_posts enable row level security;

create function app.in_team(p_team uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.team_members m where m.team_id = p_team and m.user_id = auth.uid() and m.status in ('invited','active'));
$$;
create function app.active_in_team(p_team uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.team_members m where m.team_id = p_team and m.user_id = auth.uid() and m.status = 'active');
$$;
revoke all on function app.in_team(uuid), app.active_in_team(uuid) from public;
grant execute on function app.in_team(uuid), app.active_in_team(uuid) to authenticated;

grant select on public.teams, public.team_members, public.team_posts to authenticated;
create policy teams_read on public.teams for select to authenticated using (lead_id = auth.uid() or app.in_team(id) or app.is_central());
create policy team_members_read on public.team_members for select to authenticated using (app.in_team(team_id) or app.is_central() or exists (select 1 from public.teams t where t.id = team_id and t.lead_id = auth.uid()));
create policy team_posts_read on public.team_posts for select to authenticated using (app.active_in_team(team_id) or app.is_central());

-- a team member from another company may read the idea the team works on
create or replace function app.can_see_idea(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.ideas i where i.id = p_id and (
    i.company_id = any (app.my_company_ids()) or app.is_coordinator(i.company_id)
    or exists (select 1 from public.teams t join public.team_members m on m.team_id = t.id where t.idea_id = i.id and m.user_id = auth.uid() and m.status = 'active')));
$$;

/** Who can start a team: the idea's owner, coordinators, executives of its company, and the central team. The creator leads it. */
create function public.team_create(p_idea uuid, p_name text, p_purpose text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.ideas; v uuid;
begin
  if not app.is_active() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_idea is not null then
    select * into i from public.ideas where id = p_idea;
    if not found or not (i.owner_id = auth.uid() or app.is_coordinator(i.company_id) or app.is_exec(i.company_id)) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  elsif not app.is_central() then
    raise exception 'err_forbidden' using errcode = '42501';
  end if;
  insert into public.teams (idea_id, name, purpose, lead_id) values (p_idea, trim(p_name), trim(coalesce(p_purpose, '')), auth.uid()) returning id into v;
  insert into public.team_members (team_id, user_id, status, invited_by) values (v, auth.uid(), 'active', auth.uid());
  return v;
end;
$$;

/** Finding people to invite: coordinators, executives and the central team may look across companies by name (at least 2 letters). */
create function public.team_candidates(p_query text) returns table (user_id uuid, display_name text, company_name text, department text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.is_central() or exists (select 1 from public.role_assignments r where r.user_id = auth.uid() and r.role in ('coordinator','company_exec'))) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if length(trim(coalesce(p_query, ''))) < 2 then return; end if;
  return query
    select p.id, p.display_name, c.name_th, coalesce(d.name_th, '')
    from public.profiles p
    join public.memberships m on m.user_id = p.id and m.status = 'active'
    join public.companies c on c.id = m.company_id
    left join public.departments d on d.id = m.department_id
    where p.status = 'active' and p.display_name ilike '%' || replace(replace(trim(p_query), '%', ''), '_', '') || '%'
    order by p.display_name limit 20;
end;
$$;

create function public.team_invite(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.teams;
begin
  select * into t from public.teams where id = p_team for update;
  if not found or t.lead_id <> auth.uid() or t.status <> 'open' then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then raise exception 'err_not_found'; end if;
  insert into public.team_members (team_id, user_id, status, invited_by) values (p_team, p_user, 'invited', auth.uid())
    on conflict (team_id, user_id) do update set status = case when public.team_members.status = 'declined' then 'invited' else public.team_members.status end;
  perform app.notify(p_user, 'team_invited', t.name, '', '/teams/' || p_team::text, 'team:' || p_team::text || ':' || p_user::text, jsonb_build_object('team', t.name));
end;
$$;
create function public.team_respond(p_team uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.teams;
begin
  select * into t from public.teams where id = p_team;
  update public.team_members set status = case when p_accept then 'active' else 'declined' end where team_id = p_team and user_id = auth.uid() and status = 'invited';
  if not found then raise exception 'err_not_found'; end if;
  if t.lead_id <> auth.uid() then perform app.notify(t.lead_id, 'team_joined', t.name, '', '/teams/' || p_team::text, 'teamr:' || p_team::text || ':' || auth.uid()::text, jsonb_build_object('team', t.name, 'accepted', case when p_accept then 'yes' else 'no' end)); end if;
end;
$$;
create function public.team_post(p_team uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.teams; u uuid;
begin
  select * into t from public.teams where id = p_team;
  if not found or not app.active_in_team(p_team) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if t.status <> 'open' then raise exception 'err_closed'; end if;
  insert into public.team_posts (team_id, author_id, body) values (p_team, auth.uid(), trim(p_body));
  for u in select user_id from public.team_members where team_id = p_team and status = 'active' and user_id <> auth.uid() loop
    perform app.notify(u, 'team_post', t.name, '', '/teams/' || p_team::text, 'teamp:' || p_team::text || ':' || u::text || ':' || (select count(*) from public.team_posts where team_id = p_team)::text, jsonb_build_object('team', t.name));
  end loop;
end;
$$;
create function public.team_close(p_team uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.teams set status = 'closed' where id = p_team and (lead_id = auth.uid() or app.is_central());
  if not found then raise exception 'err_forbidden' using errcode = '42501'; end if;
end;
$$;

-- ============================================================ adopt at my company
create table public.idea_adoptions (
  source_idea uuid not null references public.ideas(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  new_idea uuid not null references public.ideas(id) on delete cascade,
  adopted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (source_idea, company_id)
);
alter table public.idea_adoptions enable row level security;
grant select on public.idea_adoptions to authenticated;
create policy adoptions_read on public.idea_adoptions for select to authenticated using (app.can_see_idea(source_idea) or app.can_see_idea(new_idea));

alter table public.recognition_rules drop constraint recognition_rules_key_check;
alter table public.recognition_rules add constraint recognition_rules_key_check check (key in ('piloted','scaled','outcome_verified','highlight','dare_to_try','adopted_elsewhere','annual_award'));
insert into public.recognition_rules (key, points) values ('adopted_elsewhere', 25), ('annual_award', 100);

/**
 * A coordinator or executive of another company takes an idea that was opened to the group (and is already being used) as a starting point:
 * a new idea is created in their company, linked to the original. The original author is told and earns points; the card shows no name of the adopter's staff.
 */
create function public.idea_adopt(p_source uuid, p_company uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.ideas; v uuid; owner uuid; sla int;
begin
  if not (app.is_coordinator(p_company) or app.is_exec(p_company)) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  select * into s from public.ideas where id = p_source;
  if not found or s.visibility <> 'group' or s.stage not in ('piloting','scaled') then raise exception 'err_invalid_input'; end if;
  if s.company_id = p_company then raise exception 'err_invalid_input'; end if;
  if exists (select 1 from public.idea_adoptions where source_idea = p_source and company_id = p_company) then raise exception 'err_already_done'; end if;
  owner := app.pick_owner(p_company, null);
  select response_sla_hours into sla from public.companies where id = p_company;
  insert into public.ideas (company_id, submitter_id, type_key, title, problem_or_opportunity, target_customers, expected_benefit, resources_needed, owner_id, respond_by)
    values (p_company, auth.uid(), s.type_key, s.title, s.problem_or_opportunity, s.target_customers, s.expected_benefit, s.resources_needed, owner, now() + make_interval(hours => sla)) returning id into v;
  insert into public.idea_stage_events (idea_id, actor_id, to_stage, type, note) values (v, auth.uid(), 'submitted', 'submitted', 'adopted');
  insert into public.idea_adoptions (source_idea, company_id, new_idea, adopted_by) values (p_source, p_company, v, auth.uid());
  perform app.award_points(s.submitter_id, s.company_id, s.id, 'adopted_elsewhere', p_company::text);
  perform app.notify(s.submitter_id, 'idea_adopted', s.title, '', '/ideas/' || s.id::text, 'adopt:' || p_source::text || ':' || p_company::text, jsonb_build_object('company', (select name_th from public.companies where id = p_company)));
  if s.owner_id <> s.submitter_id then perform app.notify(s.owner_id, 'idea_adopted', s.title, '', '/ideas/' || s.id::text, 'adopto:' || p_source::text || ':' || p_company::text, jsonb_build_object('company', (select name_th from public.companies where id = p_company))); end if;
  perform app.notify(owner, 'idea_assigned', s.title, '', '/ideas/' || v::text, 'idea_new:' || v::text || ':' || owner::text, '{}'::jsonb);
  return v;
end;
$$;
/** How many companies adopted an idea (everyone who may read the idea sees the number, not the staff). */
create function public.idea_adoption_count(p_idea uuid) returns int language sql stable security definer set search_path = '' as $$
  select case when app.can_see_idea(p_idea) or exists (select 1 from public.ideas i where i.id = p_idea and i.visibility = 'group' and app.is_active()) then (select count(*)::int from public.idea_adoptions where source_idea = p_idea) else 0 end;
$$;

-- ============================================================ pilot budgets
alter table public.companies add column pilot_cap_thb int not null default 20000 check (pilot_cap_thb between 0 and 10000000);
create table public.pilot_budgets (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  amount_thb numeric not null check (amount_thb > 0 and amount_thb <= 10000000),
  purpose text not null check (length(purpose) between 3 and 500),
  status text not null default 'requested' check (status in ('requested','approved','rejected')),
  requested_by uuid not null references public.profiles(id),
  decide_by timestamptz not null, -- fast approval: answered within 48 hours, otherwise the central team is told
  decided_by uuid references public.profiles(id), decided_at timestamptz, decision_note text not null default '' check (length(decision_note) <= 1000),
  spent_thb numeric not null default 0 check (spent_thb >= 0),
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  check (spent_thb <= amount_thb)
);
create index pilot_budgets_idx on public.pilot_budgets (company_id, status, created_at desc);
create table public.pilot_spends (
  id bigint generated always as identity primary key,
  budget_id uuid not null references public.pilot_budgets(id) on delete cascade,
  amount_thb numeric not null check (amount_thb > 0), note text not null default '' check (length(note) <= 300),
  recorded_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
alter table public.pilot_budgets enable row level security;
alter table public.pilot_spends enable row level security;
grant select on public.pilot_budgets, public.pilot_spends to authenticated;
create policy budgets_read on public.pilot_budgets for select to authenticated using (requested_by = auth.uid() or app.is_coordinator(company_id) or app.is_exec(company_id) or app.can_manage_idea(idea_id));
create policy spends_read on public.pilot_spends for select to authenticated using (exists (select 1 from public.pilot_budgets b where b.id = budget_id and (b.requested_by = auth.uid() or app.is_coordinator(b.company_id) or app.is_exec(b.company_id) or app.can_manage_idea(b.idea_id))));

create function public.admin_set_pilot_cap(p_company uuid, p_cap int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() and not app.is_central() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.companies set pilot_cap_thb = p_cap where id = p_company;
  if not found then raise exception 'err_not_found'; end if;
end;
$$;

create function public.budget_request(p_idea uuid, p_amount numeric, p_purpose text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.ideas; cap int; v uuid; u uuid;
begin
  select * into i from public.ideas where id = p_idea;
  if not found or not app.can_manage_idea(p_idea) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if i.stage not in ('evaluating','piloting') then raise exception 'err_invalid_input'; end if; -- money is for trying an idea, not for one nobody has looked at
  select pilot_cap_thb into cap from public.companies where id = i.company_id;
  if p_amount > cap then raise exception 'err_over_cap'; end if;
  if exists (select 1 from public.pilot_budgets where idea_id = p_idea and status = 'requested') then raise exception 'err_already_done'; end if;
  insert into public.pilot_budgets (idea_id, company_id, amount_thb, purpose, requested_by, decide_by) values (p_idea, i.company_id, p_amount, trim(p_purpose), auth.uid(), now() + interval '48 hours') returning id into v;
  for u in select app.company_coordinator_ids(i.company_id) union select r.user_id from public.role_assignments r join public.profiles p on p.id = r.user_id and p.status = 'active' where r.role = 'company_exec' and r.scope_type = 'company' and r.scope_id = i.company_id loop
    if u <> auth.uid() then perform app.notify(u, 'budget_requested', i.title, '', '/budgets', 'bud:' || v::text || ':' || u::text, jsonb_build_object('amount', p_amount::text)); end if;
  end loop;
  return v;
end;
$$;
create function public.budget_decide(p_id uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare b public.pilot_budgets; i public.ideas;
begin
  select * into b from public.pilot_budgets where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not (app.is_coordinator(b.company_id) or app.is_exec(b.company_id)) or b.requested_by = auth.uid() then raise exception 'err_forbidden' using errcode = '42501'; end if; -- a second person decides
  if b.status <> 'requested' then raise exception 'err_already_done'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'err_note_required'; end if;
  update public.pilot_budgets set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = left(trim(coalesce(p_note, '')), 1000) where id = p_id;
  select * into i from public.ideas where id = b.idea_id;
  perform app.notify(b.requested_by, 'budget_decided', i.title, '', '/ideas/' || b.idea_id::text, 'budd:' || p_id::text, jsonb_build_object('decision', case when p_approve then 'approved' else 'rejected' end));
end;
$$;
create function public.budget_spend(p_id uuid, p_amount numeric, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare b public.pilot_budgets;
begin
  select * into b from public.pilot_budgets where id = p_id for update;
  if not found or b.status <> 'approved' or not app.can_manage_idea(b.idea_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_amount <= 0 or b.spent_thb + p_amount > b.amount_thb then raise exception 'err_over_budget'; end if; -- never beyond what was approved
  update public.pilot_budgets set spent_thb = spent_thb + p_amount where id = p_id;
  insert into public.pilot_spends (budget_id, amount_thb, note, recorded_by) values (p_id, p_amount, left(trim(coalesce(p_note, '')), 300), auth.uid());
end;
$$;
/** Nobody answered within 48 hours: the central team is told once. */
create function public.run_budget_escalation() returns int language plpgsql security definer set search_path = '' as $$
declare r record; u uuid; n int := 0;
begin
  for r in select b.*, i.title from public.pilot_budgets b join public.ideas i on i.id = b.idea_id where b.status = 'requested' and b.escalated_at is null and b.decide_by < now() for update of b skip locked loop
    update public.pilot_budgets set escalated_at = now() where id = r.id;
    for u in select app.central_user_ids() loop
      perform app.notify(u, 'budget_overdue', r.title, '', '/budgets', 'budo:' || r.id::text || ':' || u::text, jsonb_build_object('amount', r.amount_thb::text));
    end loop;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.run_budget_escalation() from public;

revoke all on function public.team_create(uuid, text, text), public.team_candidates(text), public.team_invite(uuid, uuid), public.team_respond(uuid, boolean), public.team_post(uuid, text), public.team_close(uuid),
  public.idea_adopt(uuid, uuid), public.idea_adoption_count(uuid), public.admin_set_pilot_cap(uuid, int), public.budget_request(uuid, numeric, text), public.budget_decide(uuid, boolean, text), public.budget_spend(uuid, numeric, text) from public;
grant execute on function public.team_create(uuid, text, text), public.team_candidates(text), public.team_invite(uuid, uuid), public.team_respond(uuid, boolean), public.team_post(uuid, text), public.team_close(uuid),
  public.idea_adopt(uuid, uuid), public.idea_adoption_count(uuid), public.admin_set_pilot_cap(uuid, int), public.budget_request(uuid, numeric, text), public.budget_decide(uuid, boolean, text), public.budget_spend(uuid, numeric, text) to authenticated;

do $$
begin
  if to_regnamespace('cron') is not null then
    begin perform cron.unschedule('tonkla-budget'); exception when others then null; end;
    perform cron.schedule('tonkla-budget', '17 * * * *', 'select public.run_budget_escalation()');
  end if;
end $$;
