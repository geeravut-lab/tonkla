-- Notification links must be single-slash internal paths: "//evil.example" would be read by browsers as an external address.
alter table public.notifications drop constraint notifications_href_check;
alter table public.notifications add constraint notifications_href_check check (href = '/' or href ~ '^/[A-Za-z0-9_?=&.%-][A-Za-z0-9/_?=&.%-]*$');
