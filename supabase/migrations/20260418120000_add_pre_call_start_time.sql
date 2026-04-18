-- Add pre-call individual start time to project_days
ALTER TABLE project_days
ADD COLUMN IF NOT EXISTS pre_call_start_time TEXT DEFAULT NULL;
