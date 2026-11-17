-- M3.2: communities by function (finance, HR, marketing, IT...) open to people from every company, and the annual group awards.

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,30}$'),
  name_th text not null check (length(name_th) between 2 and 80),
  name_en text not null default '' check (length(name_en) <= 80),
  description text not null default '' check (length(description) <= 500),
  status text not null default 'open' check (status in ('open','archived')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','moderator')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  parent_id uuid references public.community_posts(id) on delete cascade,
  body text not null check (length(body) between 1 and 3000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index community_posts_idx on public.community_posts (community_id, created_at);
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_posts enable row level security;

create function app.in_community(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.community_members m where m.community_id = p_id and m.user_id = auth.uid());
$$;
create function app.moderates_community(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and (app.is_central() or exists (select 1 from public.community_members m where m.community_id = p_id and m.user_id = auth.uid() and m.role = 'moderator'));
$$;
revoke all on function app.in_community(uuid), app.moderates_community(uuid) from public;
grant execute on function app.in_community(uuid), app.moderates_community(uuid) to authenticated;

grant select on public.communities, public.community_members, public.community_posts to authenticated;
create policy communities_read on public.communities for select to authenticated using (app.is_active()); -- anyone can see which communities exist, to join one
create policy community_members_read on public.community_members for select to authenticated using (app.in_community(community_id) or app.is_central());
create policy community_posts_read on public.community_posts for select to authenticated using ((app.in_community(community_id) and (not hidden or app.moderates_community(community_id))) or app.is_central());

create function public.community_create(p_key text, p_name_th text, p_name_en text, p_description text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not app.is_central() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  insert into public.communities (key, name_th, name_en, description, created_by) values (lower(trim(p_key)), trim(p_name_th), trim(coalesce(p_name_en, '')), trim(coalesce(p_description, '')), auth.uid()) returning id into v;
  return v;
end;
$$;
create function public.community_join(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_active() or cardinality(app.my_company_ids()) = 0 then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.communities where id = p_id and status = 'open') then raise exception 'err_not_found'; end if;
  insert into public.community_members (community_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end;
$$;
create function public.community_leave(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.community_members where community_id = p_id and user_id = auth.uid();
end;
$$;
create function public.community_set_moderator(p_id uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_central() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.community_members set role = case when p_on then 'moderator' else 'member' end where community_id = p_id and user_id = p_user;
  if not found then raise exception 'err_not_found'; end if;
end;
$$;
create function public.community_post(p_id uuid, p_body text, p_parent uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not app.in_community(p_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_parent is not null and not exists (select 1 from public.community_posts where id = p_parent and community_id = p_id and parent_id is null and not hidden) then raise exception 'err_invalid_input'; end if;
  if (select count(*) from public.community_posts where author_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then raise exception 'err_too_many'; end if;
  insert into public.community_posts (community_id, author_id, parent_id, body) values (p_id, auth.uid(), p_parent, trim(p_body)) returning id into v;
  perform app.live_ping('cm:' || p_id::text);
  return v;
end;
$$;
create function public.community_hide(p_post uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c uuid;
begin
  select community_id into c from public.community_posts where id = p_post;
  if c is null then raise exception 'err_not_found'; end if;
  if not app.moderates_community(c) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.community_posts set hidden = p_on where id = p_post;
  perform app.live_ping('cm:' || c::text);
end;
$$;
/** Member lists show name, company and department only. */
create function public.community_roster(p_id uuid) returns table (user_id uuid, display_name text, company_name text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.in_community(p_id) or app.is_central()) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  return query
    select m.user_id, p.display_name, coalesce((select c.name_th from public.memberships ms join public.companies c on c.id = ms.company_id where ms.user_id = m.user_id and ms.status = 'active' order by ms.is_primary desc limit 1), ''), m.role
    from public.community_members m join public.profiles p on p.id = m.user_id where m.community_id = p_id and p.status = 'active' order by m.role, p.display_name;
end;
$$;
create function public.communities_list() returns table (id uuid, key text, name_th text, name_en text, description text, members int, joined boolean, moderator boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.key, c.name_th, c.name_en, c.description, (select count(*)::int from public.community_members m where m.community_id = c.id),
    app.in_community(c.id), app.moderates_community(c.id)
  from public.communities c where app.is_active() and c.status = 'open' order by c.name_th;
$$;

-- ============================================================ annual group awards (granted by the central team)
create table public.annual_awards (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year between 2026 and 2100),
  category text not null check (category in ('idea_of_year','impact_of_year','dare_to_try_year','collaboration_of_year')),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  note text not null check (length(note) between 3 and 1000),
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (year, category, idea_id)
);
alter table public.annual_awards enable row level security;
grant select on public.annual_awards to authenticated;
create policy annual_read on public.annual_awards for select to authenticated using (app.is_active()); -- group-level recognition is public inside the group

create function public.annual_award_grant(p_idea uuid, p_category text, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.ideas; y int := extract(year from (now() at time zone 'Asia/Bangkok'))::int; v uuid;
begin
  if not app.is_central() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  select * into i from public.ideas where id = p_idea;
  if not found then raise exception 'err_not_found'; end if;
  if p_category = 'impact_of_year' then
    if not exists (select 1 from public.idea_outcomes o where o.idea_id = p_idea and o.verified_at is not null) then raise exception 'err_invalid_input'; end if; -- results confirmed by a second person
  elsif p_category = 'dare_to_try_year' then
    if not exists (select 1 from public.awards a where a.idea_id = p_idea and a.kind = 'dare_to_try') then raise exception 'err_invalid_input'; end if;
  elsif p_category in ('idea_of_year','collaboration_of_year') then
    if i.stage not in ('piloting','scaled') then raise exception 'err_invalid_input'; end if;
    if p_category = 'collaboration_of_year' and not exists (select 1 from public.teams t where t.idea_id = p_idea) and not exists (select 1 from public.idea_adoptions a where a.source_idea = p_idea) then raise exception 'err_invalid_input'; end if;
  else
    raise exception 'err_invalid_input';
  end if;
  insert into public.annual_awards (year, category, idea_id, company_id, user_id, note, granted_by) values (y, p_category, p_idea, i.company_id, i.submitter_id, trim(coalesce(p_note, '')), auth.uid()) returning id into v;
  perform app.award_points(i.submitter_id, i.company_id, p_idea, 'annual_award', y::text || ':' || p_category);
  perform app.notify(i.submitter_id, 'annual_award', i.title, '', '/recognition', 'annual:' || v::text, jsonb_build_object('award', p_category, 'year', y::text));
  return v;
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
  if p_topic like 'q:%' then return exists (select 1 from public.qa_sessions s where s.id = substr(p_topic, 3)::uuid and app.can_see_scope(s.company_id)); end if;
  if p_topic like 'cm:%' then return app.in_community(substr(p_topic, 4)::uuid); end if;
  return false;
exception when others then
  return false;
end;
$$;

revoke all on function public.community_create(text, text, text, text), public.community_join(uuid), public.community_leave(uuid), public.community_set_moderator(uuid, uuid, boolean),
  public.community_post(uuid, text, uuid), public.community_hide(uuid, boolean), public.community_roster(uuid), public.communities_list(), public.annual_award_grant(uuid, text, text) from public;
grant execute on function public.community_create(text, text, text, text), public.community_join(uuid), public.community_leave(uuid), public.community_set_moderator(uuid, uuid, boolean),
  public.community_post(uuid, text, uuid), public.community_hide(uuid, boolean), public.community_roster(uuid), public.communities_list(), public.annual_award_grant(uuid, text, text) to authenticated;
