-- Create profiles table if it doesn't exist (may have been created via dashboard without RLS)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_engine       text    NOT NULL DEFAULT 'apa-uk',
  signup_country       text,
  multi_engine_enabled boolean NOT NULL DEFAULT false,
  authorized_engines   text[]  NOT NULL DEFAULT ARRAY['apa-uk'],
  created_at           timestamptz DEFAULT now()
);

-- Add any missing columns (safe no-ops if columns already exist)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_engine       text    NOT NULL DEFAULT 'apa-uk',
  ADD COLUMN IF NOT EXISTS signup_country       text,
  ADD COLUMN IF NOT EXISTS multi_engine_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS authorized_engines   text[]  NOT NULL DEFAULT ARRAY['apa-uk'];

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Grant table-level access
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;
GRANT UPDATE (default_engine, signup_country, multi_engine_enabled, authorized_engines)
  ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- RLS policies: users may only access their own row
DROP POLICY IF EXISTS "users_select_own_profile" ON public.profiles;
CREATE POLICY "users_select_own_profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Auto-create a profile row on signup (no-op if trigger already exists)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill profile rows for existing users who don't have one yet
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;
