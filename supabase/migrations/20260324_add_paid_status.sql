-- Add 'paid' to the allowed project statuses
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('ongoing', 'finished', 'invoiced', 'paid'));
