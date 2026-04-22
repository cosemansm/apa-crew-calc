-- Add bookkeeping popup dismiss tracking
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS bookkeeping_popup_dismissed_at timestamptz;
