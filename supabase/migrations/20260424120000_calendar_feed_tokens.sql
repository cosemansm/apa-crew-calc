-- Calendar feed tokens for iCal subscription URLs
CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage their own token
DROP POLICY IF EXISTS "users_select_own_feed_token" ON public.calendar_feed_tokens;
CREATE POLICY "users_select_own_feed_token"
  ON public.calendar_feed_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_feed_token" ON public.calendar_feed_tokens;
CREATE POLICY "users_insert_own_feed_token"
  ON public.calendar_feed_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_feed_token" ON public.calendar_feed_tokens;
CREATE POLICY "users_delete_own_feed_token"
  ON public.calendar_feed_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role needs access for the public feed endpoint
GRANT SELECT ON public.calendar_feed_tokens TO service_role;
GRANT SELECT, INSERT, DELETE ON public.calendar_feed_tokens TO authenticated;
