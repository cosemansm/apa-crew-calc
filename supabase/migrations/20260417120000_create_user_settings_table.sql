-- Ensure user_settings table exists with correct schema.
-- Prod has: id (PK, gen_random_uuid()), user_id (NOT NULL), plus settings columns.
-- The CREATE TABLE IF NOT EXISTS is a no-op on prod (table already exists).
CREATE TABLE IF NOT EXISTS public.user_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name        text,
  phone               text,
  address             text,
  department          text,
  company_name        text,
  company_address     text,
  vat_number          text,
  vat_registered      boolean DEFAULT false,
  bank_account_name   text,
  bank_sort_code      text,
  bank_account_number text,
  updated_at          timestamptz DEFAULT now()
);

-- Ensure user_id has a UNIQUE constraint (required for upsert onConflict).
-- Safe to run even if one already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_settings'::regclass
      AND contype = 'u'
      AND EXISTS (
        SELECT 1 FROM unnest(conkey) k
        JOIN pg_attribute a ON a.attrelid = conrelid AND a.attnum = k
        WHERE a.attname = 'user_id'
      )
  ) THEN
    ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- Add any missing columns (safe no-ops if columns already exist)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS display_name       text,
  ADD COLUMN IF NOT EXISTS phone              text,
  ADD COLUMN IF NOT EXISTS address            text,
  ADD COLUMN IF NOT EXISTS department         text,
  ADD COLUMN IF NOT EXISTS company_name       text,
  ADD COLUMN IF NOT EXISTS company_address    text,
  ADD COLUMN IF NOT EXISTS vat_number         text,
  ADD COLUMN IF NOT EXISTS vat_registered     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_account_name  text,
  ADD COLUMN IF NOT EXISTS bank_sort_code     text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz DEFAULT now();

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Grant table-level access
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

-- RLS policies: users may only access their own row
DROP POLICY IF EXISTS "users_select_own_settings" ON public.user_settings;
CREATE POLICY "users_select_own_settings"
  ON public.user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_settings" ON public.user_settings;
CREATE POLICY "users_insert_own_settings"
  ON public.user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_settings" ON public.user_settings;
CREATE POLICY "users_update_own_settings"
  ON public.user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Auto-create a user_settings row on signup (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, display_name, department)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'department'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_settings();

-- Also create the missing profiles trigger (exists in migration but never applied to prod)
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

-- Backfill user_settings rows for existing users who don't have one yet
INSERT INTO public.user_settings (user_id, display_name, department)
SELECT
  u.id,
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'department'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_settings s WHERE s.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- Backfill profiles rows for existing users who don't have one yet
INSERT INTO public.profiles (id)
SELECT id FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.users.id
)
ON CONFLICT (id) DO NOTHING;
