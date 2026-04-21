-- Add onboarding tracking columns to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS calculator_tool text,
  ADD COLUMN IF NOT EXISTS bookkeeping_software text;

-- Backfill existing users as onboarded (they skip the wizard)
UPDATE public.user_settings SET onboarding_completed = true WHERE onboarding_completed IS NULL OR onboarding_completed = false;

-- Grant service_role access to new columns (needed for trigger-created rows)
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO service_role;
