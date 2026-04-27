-- Add IBAN/BIC columns for non-UK bank details (e.g. Belgian engine)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS bank_iban text,
  ADD COLUMN IF NOT EXISTS bank_bic  text;
