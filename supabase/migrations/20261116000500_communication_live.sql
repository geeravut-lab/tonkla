-- M1.3: announcements (audiences, must-read acknowledgement), comments, reactions, in-app notifications, live signals.

-- ============================================================ live signals (LIVE-SYNC-KNOWLEDGE): a ping carries NO data
create function app.live_ping(p_topic text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'ping', p_topic, true);
exception when others then
  null; -- a failed signal must never fail the write; also a no-op where Realtime does not exist (tests)
end;
$$;
revoke all on function app.live_ping(text) from public;

-- ============================================================ notifications (in app)
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 1000), -- plain text: summary + "label: value" lines
  href text not null default '/' check (href ~ '^/[A-Za-z0-9/_\-?=&.%]*$'), -- internal paths only
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());

/** The only writer of notifications. Never raises: an event already happened, a lost message must not undo it. */
create function app.notify(p_user uuid, p_kind text, p_title text, p_body text, p_href text, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, title, body, href, dedupe_key)
  values (p_user, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 1000), p_href, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
exception when others then
  raise warning 'notify failed: %', sqlerrm;
end;
$$;
revoke all on function app.notify(uuid, text, text, text, text, text) from public;

create function app.notifications_ping() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.live_ping('u:' || new.user_id::text);
  return null;
end;
$$;
create trigger notifications_live after insert or update of read_at on public.notifications for each row execute function app.notifications_ping();

create function public.mark_notifications_read(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ============================================================ announcements
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  company_id uuid references public.companies(id) on delete cascade, -- null = group level
  kind text not null default 'news' check (kind in ('news','exec_message','success_story','must_read')),
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 10000),
  requires_ack boolean not null default false,
  ack_due_at timestamptz,
  publish_at timestamptz, expires_at timestamptz,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger announcements_touch before update on public.announcements for each row execute function app.set_updated_at();

create table public.announcement_audiences (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  audience_type text not null check (audience_type in ('group','business_unit','company','department','position')),
  target_id uuid,
  check ((audience_type = 'group') = (target_id is null))
);
create unique index announcement_audiences_uq on public.announcement_audiences (announcement_id, audience_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.announcement_receipts (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz, acked_at timestamptz,
  primary key (announcement_id, user_id)
);
create index announcement_receipts_user_idx on public.announcement_receipts (user_id, read_at);

create table public.announcement_comments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create index announcement_comments_idx on public.announcement_comments (announcement_id, created_at);

create table public.reactions (
  entity_type text not null check (entity_type in ('announcement','announcement_comment')),
  entity_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'like' check (kind = 'like'),
  created_at timestamptz not null default now(),
  primary key (entity_type, entity_id, user_id, kind)
);
alter table public.announcements enable row level security;
alter table public.announcement_audiences enable row level security;
alter table public.announcement_receipts enable row level security;
alter table public.announcement_comments enable row level security;
alter table public.reactions enable row level security;

-- ============================================================ helpers
create function app.company_coordinator_ids(p_company uuid) returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct r.user_id from public.role_assignments r join public.profiles p on p.id = r.user_id and p.status = 'active'
  where r.role = 'coordinator' and ((r.scope_type = 'company' and r.scope_id = p_company)
     or (r.scope_type = 'business_unit' and r.scope_id = (select c.business_unit_id from public.companies c where c.id = p_company)));
$$;

create function app.can_manage_announcement(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and exists (select 1 from public.announcements a where a.id = p_id and (
    a.author_id = auth.uid() or app.is_central() or (a.company_id is not null and app.is_coordinator(a.company_id))));
$$;
create function app.can_see_announcement(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active() and (app.can_manage_announcement(p_id) or exists (
    select 1 from public.announcements a join public.announcement_receipts r on r.announcement_id = a.id
    where a.id = p_id and a.status = 'published' and r.user_id = auth.uid()));
$$;
create function app.announcement_recipients(p_id uuid) returns table (user_id uuid) language sql stable security definer set search_path = '' as $$
  select distinct m.user_id
  from public.announcements a
  join public.memberships m on m.status = 'active'
  join public.profiles p on p.id = m.user_id and p.status = 'active'
  join public.companies c on c.id = m.company_id
  where a.id = p_id and (
    (not exists (select 1 from public.announcement_audiences x where x.announcement_id = a.id) and (a.company_id is null or m.company_id = a.company_id))
    or exists (select 1 from public.announcement_audiences x where x.announcement_id = a.id and (
         x.audience_type = 'group'
      or (x.audience_type = 'business_unit' and x.target_id = c.business_unit_id)
      or (x.audience_type = 'company' and x.target_id = m.company_id)
      or (x.audience_type = 'department' and x.target_id = m.department_id)
      or (x.audience_type = 'position' and x.target_id = m.position_id))));
$$;
revoke all on function app.company_coordinator_ids(uuid), app.can_manage_announcement(uuid), app.can_see_announcement(uuid), app.announcement_recipients(uuid) from public;
grant execute on function app.can_manage_announcement(uuid), app.can_see_announcement(uuid) to authenticated;

-- a company-level announcement may only address people inside that company
create function app.check_audience() returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.announcements;
begin
  select * into a from public.announcements where id = new.announcement_id;
  if a.status <> 'draft' then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if a.company_id is null then
    if not app.is_central() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  else
    if new.audience_type in ('group', 'business_unit') then raise exception 'err_forbidden' using errcode = '42501'; end if;
    if new.audience_type = 'company' and new.target_id <> a.company_id then raise exception 'err_forbidden' using errcode = '42501'; end if;
    if new.audience_type = 'department' and not exists (select 1 from public.departments d where d.id = new.target_id and d.company_id = a.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
    if new.audience_type = 'position' and not exists (select 1 from public.positions q where q.id = new.target_id and q.company_id = a.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  end if;
  return new;
end;
$$;
create trigger announcement_audiences_check before insert on public.announcement_audiences for each row execute function app.check_audience();

-- ============================================================ policies + grants
grant select on public.announcements to authenticated;
grant insert (author_id, company_id, kind, title, body, requires_ack, ack_due_at, expires_at) on public.announcements to authenticated;
grant update (kind, title, body, requires_ack, ack_due_at, expires_at, pinned) on public.announcements to authenticated;
-- author_id is checked directly too: INSERT ... RETURNING cannot see its own new row through a function's snapshot
create policy announcements_read on public.announcements for select to authenticated using (author_id = auth.uid() or app.can_see_announcement(id));
create policy announcements_insert on public.announcements for insert to authenticated with check (
  author_id = auth.uid() and status = 'draft' and app.is_active()
  and ((company_id is null and app.is_central()) or (company_id is not null and (app.is_coordinator(company_id) or app.is_exec(company_id)))));
create policy announcements_update on public.announcements for update to authenticated
  using (app.can_manage_announcement(id)) with check (app.can_manage_announcement(id));

grant select, insert, delete on public.announcement_audiences to authenticated;
create policy audiences_read on public.announcement_audiences for select to authenticated using (app.can_see_announcement(announcement_id));
create policy audiences_insert on public.announcement_audiences for insert to authenticated with check (app.can_manage_announcement(announcement_id));
create policy audiences_delete on public.announcement_audiences for delete to authenticated using (app.can_manage_announcement(announcement_id));

grant select on public.announcement_receipts to authenticated;
create policy receipts_read on public.announcement_receipts for select to authenticated
  using (user_id = auth.uid() or app.can_manage_announcement(announcement_id));

grant select, insert on public.announcement_comments to authenticated;
grant update (deleted_at) on public.announcement_comments to authenticated;
create policy comments_read on public.announcement_comments for select to authenticated using (app.can_see_announcement(announcement_id));
create policy comments_insert on public.announcement_comments for insert to authenticated with check (
  author_id = auth.uid() and app.can_see_announcement(announcement_id)
  and exists (select 1 from public.announcements a where a.id = announcement_id and a.status = 'published'));
create policy comments_delete_own_or_manager on public.announcement_comments for update to authenticated
  using (author_id = auth.uid() or app.can_manage_announcement(announcement_id)) with check (author_id = author_id);

create function app.can_see_reaction_target(p_type text, p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'announcement' then app.can_see_announcement(p_id)
    when 'announcement_comment' then exists (select 1 from public.announcement_comments c where c.id = p_id and app.can_see_announcement(c.announcement_id))
    else false end;
$$;
revoke all on function app.can_see_reaction_target(text, uuid) from public;
grant execute on function app.can_see_reaction_target(text, uuid) to authenticated;
grant select, insert, delete on public.reactions to authenticated;
create policy reactions_read on public.reactions for select to authenticated using (app.can_see_reaction_target(entity_type, entity_id));
create policy reactions_insert on public.reactions for insert to authenticated with check (user_id = auth.uid() and app.can_see_reaction_target(entity_type, entity_id));
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

-- ============================================================ triggers
create function app.comment_ping() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.live_ping('a:' || new.announcement_id::text);
  return null;
end;
$$;
create trigger announcement_comments_live after insert or update on public.announcement_comments for each row execute function app.comment_ping();

-- people who join later receive the announcements that already addressed their company/department/position
create function app.backfill_receipts() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' then
    insert into public.announcement_receipts (announcement_id, user_id)
    select a.id, new.user_id from public.announcements a
    where a.status = 'published' and (a.expires_at is null or a.expires_at > now())
      and exists (select 1 from app.announcement_recipients(a.id) r where r.user_id = new.user_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger memberships_backfill after insert or update of status on public.memberships for each row execute function app.backfill_receipts();

-- coordinators are told about join requests (in app + live)
create function app.join_request_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid; who text;
begin
  select coalesce(nullif(display_name, ''), '?') into who from public.profiles where id = new.user_id;
  if new.status = 'pending' then
    for cid in select app.company_coordinator_ids(new.company_id) loop
      perform app.notify(cid, 'join_request', who, 'ขอเข้าร่วมบริษัท', '/desk?company=' || new.company_id::text, 'join:' || new.id::text);
    end loop;
  end if;
  perform app.live_ping('co:' || new.company_id::text);
  perform app.live_ping('u:' || new.user_id::text);
  return null;
end;
$$;
create trigger join_requests_notify after insert or update of status on public.join_requests for each row execute function app.join_request_notify();

create function app.membership_ping() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.live_ping('u:' || new.user_id::text);
  perform app.live_ping('co:' || new.company_id::text);
  return null;
end;
$$;
create trigger memberships_live after insert or update of status on public.memberships for each row execute function app.membership_ping();

-- ============================================================ RPCs
create function public.publish_announcement(p_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare a public.announcements; n int; r record;
begin
  select * into a from public.announcements where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.can_manage_announcement(p_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if a.status <> 'draft' then raise exception 'err_invalid_input'; end if;
  if a.company_id is null and not app.is_central() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.announcements set status = 'published', publish_at = coalesce(publish_at, now()) where id = p_id;
  insert into public.announcement_receipts (announcement_id, user_id)
  select p_id, x.user_id from app.announcement_recipients(p_id) x on conflict do nothing;
  get diagnostics n = row_count;
  for r in select user_id from public.announcement_receipts where announcement_id = p_id and user_id <> a.author_id loop
    perform app.notify(r.user_id, case when a.requires_ack then 'must_read' else 'announcement' end, a.title,
      case when a.requires_ack then 'ต้องกดรับทราบ' else left(a.body, 140) end, '/news/' || p_id::text, 'ann:' || p_id::text);
  end loop;
  return n;
end;
$$;

create function public.archive_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.can_manage_announcement(p_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.announcements set status = 'archived', pinned = false where id = p_id and status in ('draft','published');
  if not found then raise exception 'err_no_rows'; end if;
end;
$$;

create function public.mark_announcement_read(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.announcement_receipts set read_at = coalesce(read_at, now()) where announcement_id = p_id and user_id = auth.uid() and read_at is null;
end;
$$;

create function public.ack_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.announcement_receipts r set acked_at = coalesce(r.acked_at, now()), read_at = coalesce(r.read_at, now())
  where r.announcement_id = p_id and r.user_id = auth.uid()
    and exists (select 1 from public.announcements a where a.id = p_id and a.status = 'published' and a.requires_ack);
  if not found then raise exception 'err_no_rows'; end if;
end;
$$;

create function public.announcement_readership(p_id uuid) returns table (user_id uuid, display_name text, read_at timestamptz, acked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.can_manage_announcement(p_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  return query select r.user_id, p.display_name, r.read_at, r.acked_at
    from public.announcement_receipts r join public.profiles p on p.id = r.user_id
    where r.announcement_id = p_id order by (r.acked_at is null), (r.read_at is null) desc, p.display_name;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]), public.publish_announcement(uuid), public.archive_announcement(uuid),
  public.mark_announcement_read(uuid), public.ack_announcement(uuid), public.announcement_readership(uuid) from public;
grant execute on function public.mark_notifications_read(uuid[]), public.publish_announcement(uuid), public.archive_announcement(uuid),
  public.mark_announcement_read(uuid), public.ack_announcement(uuid), public.announcement_readership(uuid) to authenticated;

-- ============================================================ who may listen to which live topic (decided in the database)
create function app.live_may_hear(p_topic text) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_topic = 'u:' || coalesce(auth.uid()::text, '') then return true; end if;
  if p_topic = 'central' then return app.is_central(); end if;
  if p_topic = 'adm' then return app.is_platform_admin(); end if;
  if p_topic like 'co:%' then return app.is_coordinator(substr(p_topic, 4)::uuid); end if;
  if p_topic like 'a:%' then return app.can_see_announcement(substr(p_topic, 3)::uuid); end if;
  return false;
exception when others then
  return false;
end;
$$;
revoke all on function app.live_may_hear(text) from public;
grant execute on function app.live_may_hear(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy live_signals_listen on realtime.messages for select to authenticated
      using (realtime.messages.extension = 'broadcast' and app.live_may_hear((select realtime.topic())))
    $p$;
  end if;
end $$;
