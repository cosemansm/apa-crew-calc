-- Add engine tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_engine       text    NOT NULL DEFAULT 'apa-uk',
  ADD COLUMN IF NOT EXISTS signup_country       text,
  ADD COLUMN IF NOT EXISTS multi_engine_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS authorized_engines   text[]  NOT NULL DEFAULT ARRAY['apa-uk'];

-- Add engine tracking to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS calc_engine text NOT NULL DEFAULT 'apa-uk';

-- Add engine tracking to calculations
ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS calc_engine text NOT NULL DEFAULT 'apa-uk';

-- Grant SELECT/UPDATE on new profile columns to authenticated users
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (default_engine, signup_country, multi_engine_enabled, authorized_engines)
  ON public.profiles TO authenticated;
