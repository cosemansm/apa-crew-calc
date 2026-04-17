-- Removed: new-user signup notification trigger and function.
-- The trigger depended on pg_net which was not installed, blocking all signups.
-- Kept as empty migration to preserve migration history ordering.

DROP TRIGGER IF EXISTS on_auth_user_created_notify ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_notification();
