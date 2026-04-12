-- Add button_label column to release_notifications
-- Nullable so existing records are unaffected; drawer falls back to "Discover {category}"
ALTER TABLE public.release_notifications
  ADD COLUMN IF NOT EXISTS button_label text;
