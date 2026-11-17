-- Server-side helper for system notices (e.g. "LINE sending paused") addressed to a person.
create function public.notify_system(p_user uuid, p_kind text, p_title text, p_href text, p_dedupe text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.notify(p_user, p_kind, p_title, '', p_href, p_dedupe, '{}'::jsonb);
end;
$$;
revoke all on function public.notify_system(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_system(uuid, text, text, text, text) to service_role;
