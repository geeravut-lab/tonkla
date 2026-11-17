-- M1.8: AI assistant foundation for administrators: provider/model routes per task, additive prompt instructions
-- (insert-only history), usage counters. API keys are NOT stored here (environment or the server-only settings table).

create table public.ai_settings (
  task text primary key check (task ~ '^[a-z_]{3,40}$'),
  enabled boolean not null default true,
  provider text check (provider in ('anthropic','google')),
  model text check (model ~ '^[A-Za-z0-9._:/-]{1,80}$'),
  fallback_provider text check (fallback_provider in ('anthropic','google')),
  fallback_model text check (fallback_model ~ '^[A-Za-z0-9._:/-]{1,80}$'),
  updated_by uuid, updated_at timestamptz not null default now()
);
create table public.ai_prompt_versions (
  id bigint generated always as identity primary key,
  task text not null check (task ~ '^[a-z_]{3,40}$'),
  body text not null default '' check (length(body) <= 1500), -- empty = no extra instruction
  review jsonb not null default '{}'::jsonb,
  created_by uuid, created_at timestamptz not null default now()
);
create index ai_prompt_versions_idx on public.ai_prompt_versions (task, id desc);
create table public.ai_usage_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  task text not null, provider text not null, model text not null,
  outcome text not null check (outcome in ('fallback','error')),
  error_code text, input_tokens int, output_tokens int
);
create index ai_usage_log_idx on public.ai_usage_log (at desc);
create table public.ai_daily (
  day date not null default ((now() at time zone 'Asia/Bangkok')::date),
  task text not null, calls int not null default 0, input_tokens bigint not null default 0, output_tokens bigint not null default 0,
  primary key (day, task)
);
alter table public.ai_settings enable row level security;
alter table public.ai_prompt_versions enable row level security;
alter table public.ai_usage_log enable row level security;
alter table public.ai_daily enable row level security;
grant select on public.ai_settings, public.ai_prompt_versions, public.ai_usage_log, public.ai_daily to authenticated;
create policy ai_settings_read on public.ai_settings for select to authenticated using (app.is_platform_admin());
create policy ai_prompts_read on public.ai_prompt_versions for select to authenticated using (app.is_platform_admin());
create policy ai_usage_read on public.ai_usage_log for select to authenticated using (app.is_platform_admin());
create policy ai_daily_read on public.ai_daily for select to authenticated using (app.is_platform_admin());

create trigger ai_prompt_versions_no_update before update on public.ai_prompt_versions for each row execute function app.audit_immutable();
create trigger ai_prompt_versions_no_delete before delete on public.ai_prompt_versions for each row execute function app.audit_immutable();
create trigger audit_ai_settings after insert or update on public.ai_settings
  for each row execute function app.audit_row_change('task,enabled,provider,model,fallback_provider,fallback_model', 'task');

create function public.admin_set_ai_route(p_task text, p_enabled boolean, p_provider text, p_model text, p_fb_provider text, p_fb_model text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  insert into public.ai_settings (task, enabled, provider, model, fallback_provider, fallback_model, updated_by)
  values (p_task, coalesce(p_enabled, true), nullif(p_provider, ''), nullif(p_model, ''), nullif(p_fb_provider, ''), nullif(p_fb_model, ''), auth.uid())
  on conflict (task) do update set enabled = excluded.enabled, provider = excluded.provider, model = excluded.model,
    fallback_provider = excluded.fallback_provider, fallback_model = excluded.fallback_model, updated_by = auth.uid(), updated_at = now();
end;
$$;
create function public.admin_save_prompt(p_task text, p_body text, p_review jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if not app.is_platform_admin() then raise exception 'err_forbidden' using errcode = '42501'; end if;
  insert into public.ai_prompt_versions (task, body, review, created_by) values (p_task, coalesce(p_body, ''), coalesce(p_review, '{}'::jsonb), auth.uid()) returning id into v;
  return v;
end;
$$;
-- usage counters are written by the server (service role) only
create function public.ai_count(p_task text, p_in int, p_out int) returns void language sql security definer set search_path = '' as $$
  insert into public.ai_daily (task, calls, input_tokens, output_tokens) values (p_task, 1, coalesce(p_in, 0), coalesce(p_out, 0))
  on conflict (day, task) do update set calls = public.ai_daily.calls + 1, input_tokens = public.ai_daily.input_tokens + coalesce(p_in, 0), output_tokens = public.ai_daily.output_tokens + coalesce(p_out, 0);
$$;
revoke all on function public.admin_set_ai_route(text, boolean, text, text, text, text), public.admin_save_prompt(text, text, jsonb), public.ai_count(text, int, int) from public, anon;
grant execute on function public.admin_set_ai_route(text, boolean, text, text, text, text), public.admin_save_prompt(text, text, jsonb) to authenticated;
grant execute on function public.ai_count(text, int, int) to service_role;
