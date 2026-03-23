-- Add is_buyout flag to custom_roles
-- When true, the role is calculated as a flat daily rate with no OT or BHR breakdown.
ALTER TABLE custom_roles
  ADD COLUMN IF NOT EXISTS is_buyout boolean NOT NULL DEFAULT false;
