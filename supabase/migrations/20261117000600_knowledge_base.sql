-- M2.5: knowledge base (policies, manuals, forms, templates by scope) and best practices written automatically from solved reports.

create table public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade, -- null = group level, otherwise one company
  kind text not null check (kind in ('policy','manual','form','template')),
  title text not null check (length(title) between 3 and 200),
  description text not null default '' check (length(description) <= 1000),
  url text check (url is null or url ~ '^https://[^[:space:]]{3,255}$'), -- the file stays in the tool each company already uses (SharePoint, Drive...)
  body text not null default '' check (length(body) <= 20000),
  version int not null default 1,
  status text not null default 'published' check (status in ('published','archived')),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (url is not null or length(trim(body)) > 0) -- a document is a link, a text, or both
);
create index kb_documents_scope_idx on public.kb_documents (company_id, kind, status);
alter table public.kb_documents enable row level security;
grant select on public.kb_documents to authenticated;
-- readers see published documents of their scope; managers also see archived ones
create policy kb_read on public.kb_documents for select to authenticated using (app.can_see_scope(company_id) and (status = 'published' or app.can_manage_scope(company_id)));

create function public.kb_save(p_id uuid, p_company uuid, p_kind text, p_title text, p_description text, p_url text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := p_id; d public.kb_documents;
begin
  if not app.can_manage_scope(p_company) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.kb_documents (company_id, kind, title, description, url, body, created_by)
      values (p_company, p_kind, trim(p_title), trim(coalesce(p_description, '')), nullif(trim(coalesce(p_url, '')), ''), trim(coalesce(p_body, '')), auth.uid()) returning id into v;
  else
    select * into d from public.kb_documents where id = p_id for update;
    if not found then raise exception 'err_not_found'; end if;
    if d.company_id is distinct from p_company or not app.can_manage_scope(d.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if; -- a document never moves to another scope
    update public.kb_documents set kind = p_kind, title = trim(p_title), description = trim(coalesce(p_description, '')), url = nullif(trim(coalesce(p_url, '')), ''), body = trim(coalesce(p_body, '')),
      version = version + 1, updated_by = auth.uid(), updated_at = now() where id = p_id;
  end if;
  return v;
end;
$$;
create function public.kb_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.kb_documents;
begin
  select * into d from public.kb_documents where id = p_id;
  if not found then raise exception 'err_not_found'; end if;
  if p_status not in ('published','archived') then raise exception 'err_invalid_input'; end if;
  if not app.can_manage_scope(d.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.kb_documents set status = p_status, updated_by = auth.uid(), updated_at = now() where id = p_id;
end;
$$;

-- ============================================================ best practices: a solved report leaves its lesson behind
-- Only the title, the category and the resolution note are copied. The description, attachments and the people stay in the report.
create table public.best_practices (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  category_key text,
  category_name text not null default '',
  title text not null check (length(title) between 3 and 200),
  solution text not null check (length(solution) between 10 and 3000),
  visibility text not null default 'company' check (visibility in ('company','group')), -- opening it to the group is a coordinator's decision
  shared_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index best_practices_company_idx on public.best_practices (company_id, created_at desc);
alter table public.best_practices enable row level security;
grant select on public.best_practices to authenticated;
create policy practices_read on public.best_practices for select to authenticated using (
  app.is_active() and (company_id = any (app.my_company_ids()) or app.is_coordinator(company_id) or visibility = 'group'));

create function app.report_best_practice() returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.report_categories;
begin
  if new.status in ('resolved','closed') and new.status is distinct from old.status and length(trim(new.resolution_note)) >= 10 and new.merged_into_id is null then
    select * into c from public.report_categories where id = new.category_id;
    insert into public.best_practices (report_id, company_id, category_key, category_name, title, solution)
      values (new.id, new.company_id, c.key, coalesce(c.name_th, ''), new.title, left(trim(new.resolution_note), 3000)) on conflict (report_id) do nothing;
  end if;
  return null;
exception when others then
  raise warning 'best practice not written: %', sqlerrm; -- the report's own transition must never fail because of this
  return null;
end;
$$;
create trigger reports_best_practice after update of status on public.reports for each row execute function app.report_best_practice();

create function public.practice_share(p_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.best_practices;
begin
  select * into p from public.best_practices where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.is_coordinator(p.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  update public.best_practices set visibility = case when p_on then 'group' else 'company' end, shared_by = case when p_on then auth.uid() else null end where id = p_id;
end;
$$;
/** The coordinator may reword before sharing: the lesson, not the incident. */
create function public.practice_edit(p_id uuid, p_title text, p_solution text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.best_practices;
begin
  select * into p from public.best_practices where id = p_id for update;
  if not found then raise exception 'err_not_found'; end if;
  if not app.is_coordinator(p.company_id) then raise exception 'err_forbidden' using errcode = '42501'; end if;
  if length(trim(p_title)) < 3 or length(trim(p_solution)) < 10 then raise exception 'err_invalid_input'; end if;
  update public.best_practices set title = left(trim(p_title), 200), solution = left(trim(p_solution), 3000) where id = p_id;
end;
$$;

revoke all on function public.kb_save(uuid, uuid, text, text, text, text, text), public.kb_set_status(uuid, text), public.practice_share(uuid, boolean), public.practice_edit(uuid, text, text) from public;
grant execute on function public.kb_save(uuid, uuid, text, text, text, text, text), public.kb_set_status(uuid, text), public.practice_share(uuid, boolean), public.practice_edit(uuid, text, text) to authenticated;
