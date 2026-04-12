-- Add status field to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ongoing'
  CHECK (status IN ('ongoing', 'finished', 'invoiced'));
