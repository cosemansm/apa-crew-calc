-- Add team_id column to subscriptions for grouping team members
ALTER TABLE public.subscriptions
  ADD COLUMN team_id text;

-- Update the status comment to include 'team'
COMMENT ON COLUMN public.subscriptions.status IS
  'allowed: trialing | active | lifetime | team | past_due | canceled | unpaid';
