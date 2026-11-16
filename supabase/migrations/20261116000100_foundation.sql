-- M1.1 foundation: private helper schema + platform settings (server-only table).

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Settings are read and written by the server only (service role). No policy = browser clients see nothing.
create table public.platform_settings (
  key text primary key check (length(key) between 1 and 64),
  value jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
create trigger platform_settings_touch before update on public.platform_settings
  for each row execute function app.set_updated_at();
