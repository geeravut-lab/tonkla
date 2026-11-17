-- M1.5: ideas (process improvement, cost reduction, new product/service, new revenue) with a 5-stage pipeline,
-- published criteria, peer votes and comments, and measured outcomes.

create table public.idea_criteria (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name_th text not null, name_en text not null default '',
  weight int not null default 1 check (weight between 1 and 10),
  active boolean not null default true
);
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  submitter_id uuid not null references public.profiles(id),
  type_key text not null check (type_key in ('process_improvement','cost_reduction','new_product_service','new_revenue')),
  title text not null check (length(title) between 3 and 200),
  problem_or_opportunity text not null default '' check (length(problem_or_opportunity) <= 4000),
  target_customers text not null default '' check (length(target_customers) <= 2000),
  expected_benefit text not null default '' check (length(expected_benefit) <= 2000),
  resources_needed text not null default '' check (length(resources_needed) <= 2000),
  stage text not null default 'submitted' check (stage in ('submitted','screening','evaluating','piloting','scaled','declined')),
  stage_entered_at timestamptz not null default now(),
  owner_id uuid not null references public.profiles(id),
  respond_by timestamptz not null,
  first_response_at timestamptz,
  escalation_level int not null default 0 check (escalation_level between 0 and 2),
  decision_reason text not null default '' check (length(decision_reason) <= 3000),
  visibility text not null default 'company' check (visibility in ('company','group')),
  linked_report_id uuid references public.reports(id) on delete set null,
  vote_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger ideas_touch before update on public.ideas for each row execute function app.set_updated_at();
create index ideas_company_idx on public.ideas (company_id, stage, created_at desc);
create index ideas_submitter_idx on public.ideas (submitter_id, created_at desc);

create table public.idea_stage_events (
  id bigint generated always as identity primary key,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  actor_id uuid, from_stage text, to_stage text, type text not null default 'stage' check (type ~ '^[a-z_]{3,30}$'),
  note text not null default '' check (length(note) <= 3000), created_at timestamptz not null default now()
);
create index idea_stage_events_idx on public.idea_stage_events (idea_id, id);
create table public.idea_scores (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  criterion_id uuid not null references public.idea_criteria(id) on delete cascade,
  scorer_id uuid not null references public.profiles(id),
  score int not null check (score between 1 and 5),
  comment text not null default '' check (length(comment) <= 1000),
  primary key (idea_id, criterion_id, scorer_id)
);
create table public.idea_votes (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
create table public.idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index idea_comments_idx on public.idea_comments (idea_id, created_at);
create table public.idea_outcomes (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  metric text not null check (metric in ('money_saved_thb','time_saved_hours','revenue_added_thb')),
  value numeric not null check (value >= 0 and value <= 1000000000),
  period_start date not null, period_end date not null check (period_end >= period_start),
  note text not null default '' check (length(note) <= 1000),
  recorded_by uuid not null, verified_by uuid, verified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.idea_criteria enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_stage_events enable row level security;
alter table public.idea_scores enable row level security;
alter table public.idea_votes enable row level security;
alter table public.idea_comments enable row level security;
alter table public.idea_outcomes enable row level security;

create function app.can_see_idea(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.ideas i where i.id = p_id and (i.company_id = any (app.my_company_ids()) or app.is_coordinator(i.company_id)));
$$;
create function app.can_manage_idea(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.ideas i where i.id = p_id and (i.owner_id = auth.uid() or app.is_coordinator(i.company_id) or app.is_exec(i.company_id)));
$$;
revoke all on function app.can_see_idea(uuid), app.can_manage_idea(uuid) from public;
grant execute on function app.can_see_idea(uuid), app.can_manage_idea(uuid) to authenticated;

grant select on public.idea_criteria to authenticated;
create policy criteria_read on public.idea_criteria for select to authenticated using (company_id = any (app.my_company_ids()) or app.is_coordinator(company_id));
grant select on public.ideas to authenticated;
create policy ideas_read on public.ideas for select to authenticated using (submitter_id = auth.uid() or app.can_see_idea(id));
grant select on public.idea_stage_events, public.idea_scores, public.idea_votes, public.idea_outcomes to authenticated;
create policy idea_events_read on public.idea_stage_events for select to authenticated using (app.can_see_idea(idea_id));
create policy idea_scores_read on public.idea_scores for select to authenticated using (app.can_see_idea(idea_id)); -- criteria and scores are open: that is the point of "published criteria"
create policy idea_votes_read on public.idea_votes for select to authenticated using (app.can_see_idea(idea_id));
create policy idea_outcomes_read on public.idea_outcomes for select to authenticated using (app.can_see_idea(idea_id));
grant select, insert on public.idea_comments to authenticated;
create policy idea_comments_read on public.idea_comments for select to authenticated using (app.can_see_idea(idea_id));
create policy idea_comments_insert on public.idea_comments for insert to authenticated with check (author_id = auth.uid() and app.can_see_idea(idea_id));

create view public.group_ideas with (security_barrier = true) as
  select i.id, i.company_id, c.name_th as company_name, p.display_name as submitter_name, i.type_key, i.title, i.problem_or_opportunity, i.expected_benefit, i.stage, i.vote_count
  from public.ideas i join public.companies c on c.id = i.company_id join public.profiles p on p.id = i.submitter_id
  where i.visibility = 'group' and i.stage <> 'declined' and app.is_active();
grant select on public.group_ideas to authenticated;

-- ============================================================ triggers
create function app.idea_ping() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.live_ping('u:' || new.submitter_id::text);
  perform app.live_ping('u:' || new.owner_id::text);
  perform app.live_ping('co:' || new.company_id::text);
  perform app.live_ping('i:' || new.id::text);
  return null;
end;
$$;
create trigger ideas_live after insert or update on public.ideas for each row execute function app.idea_ping();
create function app.idea_child_ping() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.live_ping('i:' || new.idea_id::text);
  return null;
end;
$$;
create trigger idea_events_live after insert on public.idea_stage_events for each row execute function app.idea_child_ping();
create trigger idea_comments_live after insert on public.idea_comments for each row execute function app.idea_child_ping();
create trigger idea_scores_live after insert or update on public.idea_scores for each row execute function app.idea_child_ping();
create function app.idea_vote_count() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.ideas set vote_count = (select count(*) from public.idea_votes where idea_id = coalesce(new.idea_id, old.idea_id)) where id = coalesce(new.idea_id, old.idea_id);
  return null;
end;
$$;
create trigger idea_votes_count after insert or delete on public.idea_votes for each row execute function app.idea_vote_count();
create trigger audit_ideas after update on public.ideas
  for each row when (old.stage is distinct from new.stage or old.owner_id is distinct from new.owner_id or old.visibility is distinct from new.visibility)
  execute function app.audit_row_change('stage,owner_id,visibility', 'id');

create or replace function app.live_may_hear(p_topic text) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_topic = 'u:' || coalesce(auth.uid()::text, '') then return true; end if;
  if p_topic = 'central' then return app.is_central(); end if;
  if p_topic = 'adm' then return app.is_platform_admin(); end if;
  if p_topic like 'co:%' then return app.is_coordinator(substr(p_topic, 4)::uuid); end if;
  if p_topic like 'a:%' then return app.can_see_announcement(substr(p_topic, 3)::uuid); end if;
  if p_topic like 'r:%' then return app.can_see_report(substr(p_topic, 3)::uuid); end if;
  if p_topic like 'i:%' then return app.can_see_idea(substr(p_topic, 3)::uuid); end if;
  return false;
exception when others then
  return false;
end;
$$;

-- ============================================================ RPCs
create function public.submit_idea(p_id uuid, p_company uuid, p_type text, p_title text, p_problem text, p_customers text, p_benefit text, p_resources text, p_report uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner uuid; sla int; coord uuid;
begin
  if not app.is_active() or not (p_company = any (app.my_company_ids())) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_type not in ('process_improvement','cost_reduction','new_product_service','new_revenue') then raise exception 'err_invalid_input'; end if;
  if p_report is not null and not exists (select 1 from public.reports r where r.id = p_report and r.submitter_id = auth.uid()) then p_report := null; end if;
  owner := app.pick_owner(p_company, null);
  select response_sla_hours into sla from public.companies where id = p_company;
  insert into public.ideas (id, company_id, submitter_id, type_key, title, problem_or_opportunity, target_customers, expected_benefit, resources_needed, owner_id, respond_by, linked_report_id)
  values (coalesce(p_id, gen_random_uuid()), p_company, auth.uid(), p_type, trim(p_title), trim(coalesce(p_problem, '')), trim(coalesce(p_customers, '')), trim(coalesce(p_benefit, '')), trim(coalesce(p_resources, '')), owner, now() + make_interval(hours => sla), p_report)
  returning id into p_id;
  insert into public.idea_stage_events (idea_id, actor_id, to_stage, type) values (p_id, auth.uid(), 'submitted', 'submitted');
  perform app.notify(owner, 'idea_assigned', trim(p_title), '', '/ideas/' || p_id::text, 'idea_new:' || p_id::text || ':' || owner::text, '{}'::jsonb);
  for coord in select app.company_coordinator_ids(p_company) loop
    if coord <> owner then perform app.notify(coord, 'idea_new', trim(p_title), '', '/ideas/' || p_id::text, 'idea_new:' || p_id::text || ':' || coord::text, '{}'::jsonb); end if;
  end loop;
  return p_id;
end;
$$;

create function public.idea_transition(p_id uuid, p_to text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare i public.ideas; allowed boolean;
begin
  select * into i from public.ideas where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.can_manage_idea(p_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  allowed := case i.stage
    when 'submitted' then p_to in ('screening','declined')
    when 'screening' then p_to in ('evaluating','declined')
    when 'evaluating' then p_to in ('piloting','declined')
    when 'piloting' then p_to in ('scaled','evaluating','declined')
    else false end;
  if not allowed then raise exception 'err_invalid_input'; end if;
  if p_to in ('declined','scaled') and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'err_note_required'; end if; -- every idea is answered, a "no" has a reason
  update public.ideas set stage = p_to, stage_entered_at = now(), first_response_at = coalesce(first_response_at, now()),
    decision_reason = case when p_to in ('declined','scaled') then left(trim(p_note), 3000) else decision_reason end where id = p_id;
  insert into public.idea_stage_events (idea_id, actor_id, from_stage, to_stage, note) values (p_id, auth.uid(), i.stage, p_to, coalesce(p_note, ''));
  if i.submitter_id <> auth.uid() then
    perform app.notify(i.submitter_id, 'idea_stage', i.title, '', '/ideas/' || p_id::text, 'idea_st:' || p_id::text || ':' || p_to, jsonb_build_object('stage', p_to));
  end if;
end;
$$;

create function public.idea_assign(p_id uuid, p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.ideas;
begin
  select * into i from public.ideas where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.is_coordinator(i.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.memberships m where m.user_id = p_owner and m.company_id = i.company_id and m.status = 'active') then raise exception 'err_not_member'; end if;
  update public.ideas set owner_id = p_owner where id = p_id;
  insert into public.idea_stage_events (idea_id, actor_id, type) values (p_id, auth.uid(), 'assigned');
  if p_owner <> auth.uid() then perform app.notify(p_owner, 'idea_assigned', i.title, '', '/ideas/' || p_id::text, 'idea_as:' || p_id::text || ':' || p_owner::text, '{}'::jsonb); end if;
end;
$$;

create function public.idea_set_visibility(p_id uuid, p_visibility text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.ideas;
begin
  select * into i from public.ideas where id = p_id for update;
  if not found or not app.is_coordinator(i.company_id) or p_visibility not in ('company','group') then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.ideas set visibility = p_visibility where id = p_id;
  insert into public.idea_stage_events (idea_id, actor_id, type, note) values (p_id, auth.uid(), 'visibility', p_visibility);
end;
$$;

create function public.idea_toggle_vote(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare i public.ideas;
begin
  select * into i from public.ideas where id = p_id;
  if not found or not app.can_see_idea(p_id) or not (i.company_id = any (app.my_company_ids())) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if i.submitter_id = auth.uid() then raise exception 'err_own_idea'; end if; -- no voting for yourself
  if i.stage = 'declined' then raise exception 'err_invalid_input'; end if;
  if exists (select 1 from public.idea_votes where idea_id = p_id and user_id = auth.uid()) then
    delete from public.idea_votes where idea_id = p_id and user_id = auth.uid();
    return false;
  end if;
  insert into public.idea_votes (idea_id, user_id) values (p_id, auth.uid());
  return true;
end;
$$;

create function public.idea_score(p_idea uuid, p_criterion uuid, p_score int, p_comment text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.can_manage_idea(p_idea) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.idea_criteria c join public.ideas i on i.company_id = c.company_id where c.id = p_criterion and i.id = p_idea and c.active) then raise exception 'err_invalid_input'; end if;
  insert into public.idea_scores (idea_id, criterion_id, scorer_id, score, comment) values (p_idea, p_criterion, auth.uid(), p_score, left(coalesce(p_comment, ''), 1000))
  on conflict (idea_id, criterion_id, scorer_id) do update set score = excluded.score, comment = excluded.comment;
end;
$$;

create function public.idea_add_outcome(p_idea uuid, p_metric text, p_value numeric, p_start date, p_end date, p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.ideas; v uuid;
begin
  select * into i from public.ideas where id = p_idea;
  if not found or not app.can_manage_idea(p_idea) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if i.stage not in ('piloting','scaled') then raise exception 'err_invalid_input'; end if;
  insert into public.idea_outcomes (idea_id, metric, value, period_start, period_end, note, recorded_by)
  values (p_idea, p_metric, p_value, p_start, p_end, left(coalesce(p_note, ''), 1000), auth.uid()) returning id into v;
  insert into public.idea_stage_events (idea_id, actor_id, type) values (p_idea, auth.uid(), 'outcome');
  if i.submitter_id <> auth.uid() then perform app.notify(i.submitter_id, 'idea_outcome', i.title, '', '/ideas/' || p_idea::text, 'idea_out:' || v::text, '{}'::jsonb); end if;
  return v;
end;
$$;

create function public.idea_verify_outcome(p_outcome uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.idea_outcomes; c uuid;
begin
  select * into o from public.idea_outcomes where id = p_outcome for update;
  if not found then raise exception 'err_not_found'; end if;
  select company_id into c from public.ideas where id = o.idea_id;
  if not (app.is_coordinator(c) or app.is_exec(c)) or o.recorded_by = auth.uid() then raise exception 'err_forbidden' using errcode = '42501'; end if; -- a second person confirms the number
  update public.idea_outcomes set verified_by = auth.uid(), verified_at = now() where id = p_outcome;
end;
$$;

revoke all on function public.submit_idea(uuid, uuid, text, text, text, text, text, text, uuid), public.idea_transition(uuid, text, text),
  public.idea_assign(uuid, uuid), public.idea_set_visibility(uuid, text), public.idea_toggle_vote(uuid), public.idea_score(uuid, uuid, int, text),
  public.idea_add_outcome(uuid, text, numeric, date, date, text), public.idea_verify_outcome(uuid) from public;
grant execute on function public.submit_idea(uuid, uuid, text, text, text, text, text, text, uuid), public.idea_transition(uuid, text, text),
  public.idea_assign(uuid, uuid), public.idea_set_visibility(uuid, text), public.idea_toggle_vote(uuid), public.idea_score(uuid, uuid, int, text),
  public.idea_add_outcome(uuid, text, numeric, date, date, text), public.idea_verify_outcome(uuid) to authenticated;

-- criteria management by the company coordinator
create function public.set_criteria(p_company uuid, p_id uuid, p_name_th text, p_weight int, p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := p_id;
begin
  if not app.is_coordinator(p_company) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.idea_criteria (company_id, name_th, weight, active) values (p_company, left(trim(p_name_th), 160), p_weight, coalesce(p_active, true)) returning id into v;
  else
    update public.idea_criteria set name_th = left(trim(p_name_th), 160), weight = p_weight, active = coalesce(p_active, true) where id = p_id and company_id = p_company;
    if not found then raise exception 'err_not_found'; end if;
  end if;
  return v;
end;
$$;
revoke all on function public.set_criteria(uuid, uuid, text, int, boolean) from public;
grant execute on function public.set_criteria(uuid, uuid, text, int, boolean) to authenticated;

-- new companies also receive the template's published criteria (extends the earlier version)
create or replace function public.admin_create_company(p_code text, p_name_th text, p_name_en text, p_bu uuid, p_template uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; sla int := 48; cfg jsonb; item jsonb;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_code !~ '^[a-z0-9-]{2,32}$' or length(trim(coalesce(p_name_th, ''))) < 1 then raise exception 'err_invalid_input'; end if;
  if p_template is not null then
    select config into cfg from public.company_templates where id = p_template;
    if cfg is null then raise exception 'err_not_found'; end if;
    sla := coalesce((cfg ->> 'response_sla_hours')::int, 48);
  end if;
  insert into public.companies (code, name_th, name_en, business_unit_id, template_id, response_sla_hours)
  values (p_code, left(trim(p_name_th), 160), left(trim(coalesce(p_name_en, '')), 160), p_bu, p_template, sla) returning id into v;
  if cfg is not null then
    for item in select * from jsonb_array_elements(coalesce(cfg -> 'report_categories', '[]'::jsonb)) loop
      insert into public.report_categories (company_id, key, name_th, name_en, default_severity)
      values (v, item ->> 'key', item ->> 'th', coalesce(item ->> 'en', ''), coalesce(item ->> 'severity', 'medium'));
    end loop;
    for item in select * from jsonb_array_elements(coalesce(cfg -> 'idea_criteria', '[]'::jsonb)) loop
      insert into public.idea_criteria (company_id, name_th, name_en, weight) values (v, item ->> 'th', coalesce(item ->> 'en', ''), coalesce((item ->> 'weight')::int, 1));
    end loop;
  end if;
  return v;
end;
$$;

-- the tick also watches ideas (same deadline rule as reports)
insert into public.automation_rules (key, params) values ('idea_escalate_coordinator', '{"hours": 0}') on conflict (key) do nothing;
create or replace function public.run_tick() returns jsonb language plpgsql security definer set search_path = '' as $$
declare t0 timestamptz := clock_timestamp(); r record; u uuid; n_due int := 0; n_o1 int := 0; n_o2 int := 0; n_ack int := 0; n_idea int := 0; hrs numeric;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') and not (select rolbypassrls from pg_roles where rolname = current_user) then
    raise exception 'err_forbidden' using errcode = '42501';
  end if;
  if app.rule_enabled('report_due_soon') then
    hrs := app.rule_hours('report_due_soon', 12);
    for r in select id, owner_id, title, respond_by from public.reports where first_response_at is null and status = 'submitted' and respond_by > now() and respond_by <= now() + make_interval(secs => hrs * 3600) loop
      perform app.notify(r.owner_id, 'report_due', r.title, '', '/reports/' || r.id::text, 'rep_due:' || r.id::text, jsonb_build_object('hours', greatest(1, ceil(extract(epoch from (r.respond_by - now())) / 3600))::int));
      n_due := n_due + 1;
    end loop;
  end if;
  if app.rule_enabled('report_escalate_coordinator') then
    hrs := app.rule_hours('report_escalate_coordinator', 0);
    for r in select id, owner_id, company_id, title from public.reports where first_response_at is null and status = 'submitted' and escalation_level = 0 and respond_by + make_interval(secs => hrs * 3600) < now() for update loop
      update public.reports set escalation_level = 1 where id = r.id;
      insert into public.report_events (report_id, actor_id, type, note) values (r.id, null, 'escalated_coordinator', '');
      for u in select r.owner_id union select app.company_coordinator_ids(r.company_id) loop
        perform app.notify(u, 'report_overdue', r.title, '', '/reports/' || r.id::text, 'rep_o1:' || r.id::text || ':' || u::text, '{}'::jsonb);
      end loop;
      n_o1 := n_o1 + 1;
    end loop;
  end if;
  if app.rule_enabled('report_escalate_central') then
    hrs := app.rule_hours('report_escalate_central', 24);
    for r in select id, title, company_id from public.reports where first_response_at is null and status = 'submitted' and escalation_level = 1 and respond_by + make_interval(secs => hrs * 3600) < now() for update loop
      update public.reports set escalation_level = 2 where id = r.id;
      insert into public.report_events (report_id, actor_id, type, note) values (r.id, null, 'escalated_central', '');
      for u in select ra.user_id from public.role_assignments ra join public.profiles p on p.id = ra.user_id and p.status = 'active' where ra.scope_type = 'group' and ra.role in ('central_team','group_owner') loop
        perform app.notify(u, 'report_escalated', r.title, '', '/reports/' || r.id::text, 'rep_o2:' || r.id::text || ':' || u::text, '{}'::jsonb);
      end loop;
      n_o2 := n_o2 + 1;
    end loop;
  end if;
  if app.rule_enabled('idea_escalate_coordinator') then
    hrs := app.rule_hours('idea_escalate_coordinator', 0);
    for r in select id, owner_id, company_id, title from public.ideas where first_response_at is null and stage = 'submitted' and escalation_level = 0 and respond_by + make_interval(secs => hrs * 3600) < now() for update loop
      update public.ideas set escalation_level = 1 where id = r.id;
      insert into public.idea_stage_events (idea_id, actor_id, type) values (r.id, null, 'escalated');
      for u in select r.owner_id union select app.company_coordinator_ids(r.company_id) loop
        perform app.notify(u, 'idea_overdue', r.title, '', '/ideas/' || r.id::text, 'idea_o1:' || r.id::text || ':' || u::text, '{}'::jsonb);
      end loop;
      n_idea := n_idea + 1;
    end loop;
  end if;
  if app.rule_enabled('ack_reminder') then
    hrs := app.rule_hours('ack_reminder', 24);
    for r in select a.id as aid, a.title, x.user_id from public.announcements a join public.announcement_receipts x on x.announcement_id = a.id
      where a.status = 'published' and a.requires_ack and x.acked_at is null and a.ack_due_at is not null and a.ack_due_at <= now() + make_interval(secs => hrs * 3600) loop
      perform app.notify(r.user_id, 'ack_reminder', r.title, '', '/news/' || r.aid::text, 'ackrem:' || r.aid::text || ':' || r.user_id::text, '{}'::jsonb);
      n_ack := n_ack + 1;
    end loop;
  end if;
  update public.automation_rules set last_run_at = now(), last_count = case key when 'report_due_soon' then n_due when 'report_escalate_coordinator' then n_o1 when 'report_escalate_central' then n_o2 when 'ack_reminder' then n_ack when 'idea_escalate_coordinator' then n_idea end;
  insert into public.cron_ticks (summary, duration_ms) values (jsonb_build_object('due', n_due, 'overdue', n_o1, 'central', n_o2, 'ack', n_ack, 'ideas', n_idea), (extract(epoch from clock_timestamp() - t0) * 1000)::int);
  return jsonb_build_object('due', n_due, 'overdue', n_o1, 'central', n_o2, 'ack', n_ack, 'ideas', n_idea);
end;
$$;
revoke all on function public.run_tick() from public, anon, authenticated;
grant execute on function public.run_tick() to service_role;
