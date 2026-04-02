-- ── Subscriptions table ────────────────────────────────────────────────────────
CREATE TABLE public.subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text NOT NULL DEFAULT 'trialing',
  -- allowed: 'trialing' | 'active' | 'lifetime' | 'past_due' | 'canceled' | 'unpaid'
  -- 'free' is derived (trialing + trial_ends_at expired) — never written to DB
  trial_ends_at          timestamptz NOT NULL DEFAULT now() + interval '14 days',
  current_period_end     timestamptz,
  trial_extended         boolean NOT NULL DEFAULT false,
  day10_popup_shown      boolean NOT NULL DEFAULT false,
  expired_popup_shown    boolean NOT NULL DEFAULT false,
  created_at             timestamptz DEFAULT now()
);

-- ── Row-level security ─────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Grant table-level access (required in addition to RLS policies)
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.subscriptions TO anon;

-- Users may only read their own row. All mutations go through service-role API routes.
CREATE POLICY "users_select_own_subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── Auto-insert on signup ──────────────────────────────────────────────────────
-- Fires for both email/password and Google OAuth signups.
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_subscription();
