-- The person is told in the app when their password changes (a stolen session would otherwise change it silently).
create function public.notify_self_password_changed() returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  perform app.notify(auth.uid(), 'password_changed', 'Tonkla', '', '/account', 'pw:' || auth.uid()::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'), '{}'::jsonb);
end;
$$;
revoke all on function public.notify_self_password_changed() from public;
grant execute on function public.notify_self_password_changed() to authenticated;
