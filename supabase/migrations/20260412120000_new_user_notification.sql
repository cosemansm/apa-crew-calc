-- Fires an HTTP request to the new-user-notification edge function
-- whenever a row is inserted into auth.users (i.e. a new sign-up).
-- Requires the pg_net extension (enabled by default on Supabase).

create or replace function public.handle_new_user_notification()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url     := 'https://dmqkmkzsveyvpwugxwym.supabase.co/functions/v1/new-user-notification',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := to_jsonb(NEW)
  );
  return NEW;
end;
$$;

drop trigger if exists on_auth_user_created_notify on auth.users;

create trigger on_auth_user_created_notify
  after insert on auth.users
  for each row execute procedure public.handle_new_user_notification();
