-- Rename feature_requests status value: submitted → requested

-- 1. Drop the existing check constraint (name may vary — adjust if needed)
ALTER TABLE public.feature_requests
  DROP CONSTRAINT IF EXISTS feature_requests_status_check;

-- 2. Update existing rows
UPDATE public.feature_requests
  SET status = 'requested'
  WHERE status = 'submitted';

-- 3. Re-add check constraint with new value set
ALTER TABLE public.feature_requests
  ADD CONSTRAINT feature_requests_status_check
  CHECK (status IN ('requested', 'planned', 'in_progress', 'completed'));
