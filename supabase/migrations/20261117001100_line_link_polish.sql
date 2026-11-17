-- LINE linking polish: how many codes a person asked for (to limit it to 10 per hour). Server-only table: no grant, no policy.
create table public.line_code_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now()
);
create index line_code_requests_idx on public.line_code_requests (user_id, at desc);
alter table public.line_code_requests enable row level security;
