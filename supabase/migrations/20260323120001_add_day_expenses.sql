-- Add per-day expenses fields to project_days
ALTER TABLE project_days
  ADD COLUMN IF NOT EXISTS expenses_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expenses_notes  text          NOT NULL DEFAULT '';
