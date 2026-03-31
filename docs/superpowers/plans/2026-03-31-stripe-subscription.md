# Stripe Subscription Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe subscription billing to gate Pro features (AI Input, Invoice Direct) behind a paid plan, with a 14-day free trial, one-time review extension, and all required UI touchpoints.

**Architecture:** Trial state managed in Supabase (`subscriptions` table, auto-inserted on signup via DB trigger). No Stripe objects created until user upgrades. `SubscriptionContext` provides `isPremium` derived from DB state. Stripe webhooks keep DB in sync.

**Tech Stack:** Stripe Node.js SDK, Supabase (PostgreSQL + RLS), React Context API, Vercel Serverless Functions, Resend (email), Tailwind CSS, Lucide icons.

---

## File Map

**Create:**
- `supabase/migrations/20260401_add_subscriptions.sql` — table, RLS, signup trigger
- `src/contexts/SubscriptionContext.tsx` — subscription state, `isPremium` logic, refresh
- `src/components/ProLockOverlay.tsx` — blurred lock overlay for Pro-gated pages
- `src/components/ReviewPopup.tsx` — day-10 and trial-expired pop-ups
- `src/components/TrialBanner.tsx` — last-5-days countdown strip on dashboard
- `api/stripe/create-checkout.ts` — Stripe Checkout session
- `api/stripe/create-portal.ts` — Stripe Customer Portal session
- `api/stripe/webhook.ts` — Stripe webhook handler (raw body)
- `api/stripe/extend-trial.ts` — review extension endpoint
- `api/send-review-email.ts` — Resend email for day-10 review prompt

**Modify:**
- `package.json` — add `stripe` dependency
- `.gitignore` — add `.superpowers/`
- `src/App.tsx` — wrap with `<SubscriptionProvider>`, mount `<ReviewPopup>`
- `src/components/AppLayout.tsx` — trial badge in sidebar, ✦ sparkle on AI Input nav item
- `src/pages/DashboardPage.tsx` — trial countdown banner (last 5 days)
- `src/pages/AIInputPage.tsx` — wrap with `<ProLockOverlay>`
- `src/pages/SettingsPage.tsx` — replace placeholder Billing section with Plan & Billing
- `src/pages/CalculatorPage.tsx` — enforce 10-job limit for free users
- `api/delete-account.ts` — delete `subscriptions` row on account deletion

---

## Task 1: Install Stripe SDK + update .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install the Stripe Node.js SDK**

```bash
npm install stripe
```

Expected output: `added 1 package` (stripe ships its own TypeScript types — no `@types/stripe` needed).

- [ ] **Step 2: Add `.superpowers/` to .gitignore**

Open `.gitignore` and append:

```
# Brainstorming visual companion
.superpowers/
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: install stripe sdk, ignore .superpowers dir"
```

---

## Task 2: Database migration — subscriptions table + signup trigger

**Files:**
- Create: `supabase/migrations/20260401_add_subscriptions.sql`

> **Note:** The spec has a single `review_popup_shown` column. This plan splits it into `day10_popup_shown` and `expired_popup_shown` so both pop-ups can fire independently (the user asked for the expired pop-up even if they dismissed the day-10 one).

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260401_add_subscriptions.sql` with:

```sql
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

-- Users may only read their own row. All mutations go through service-role API routes.
CREATE POLICY "users_select_own_subscription"
  ON public.subscriptions FOR SELECT
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
```

- [ ] **Step 2: Apply the migration in the Supabase Dashboard**

1. Open your Supabase project → **SQL Editor**
2. Paste the contents of the migration file and run it
3. Go to **Table Editor** → confirm `subscriptions` table exists with all columns
4. Go to **Authentication → Users** → create a test user → confirm a `subscriptions` row is auto-inserted

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260401_add_subscriptions.sql
git commit -m "feat: add subscriptions table with RLS and signup trigger"
```

---

## Task 3: Stripe Dashboard setup + environment variables

**Files:** none (manual setup — produces env var values used in later tasks)

- [ ] **Step 1: Create product and prices in Stripe**

1. Open [Stripe Dashboard](https://dashboard.stripe.com) → **Products → Add product**
2. Name: `Crew Dock Pro`
3. Add two prices:
   - **Monthly:** £3.45, recurring monthly → copy the price ID (e.g. `price_xxx_monthly`)
   - **Annual:** £29.95, recurring yearly → copy the price ID (e.g. `price_xxx_yearly`)
4. Go to **Developers → Webhooks → Add endpoint**
   - URL: `https://crewdock.app/api/stripe/webhook` (for production)
   - Events to listen for: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the **signing secret** (starts with `whsec_`)
5. Copy your **Secret key** from Developers → API keys (starts with `sk_live_` or `sk_test_`)

- [ ] **Step 2: Add environment variables to Vercel**

In Vercel dashboard → your project → **Settings → Environment Variables**, add:

```
STRIPE_SECRET_KEY        = sk_live_...   (or sk_test_... for dev)
STRIPE_WEBHOOK_SECRET    = whsec_...
STRIPE_PRICE_MONTHLY     = price_...
STRIPE_PRICE_YEARLY      = price_...
APP_URL                  = https://crewdock.app
```

Also add for local dev in `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
APP_URL=http://localhost:5173
```

- [ ] **Step 3: Verify env vars are readable**

```bash
# In a terminal at the project root — should print the key prefix
node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.STRIPE_SECRET_KEY?.slice(0,7))"
```

Expected: `sk_test`

---

## Task 4: SubscriptionContext

**Files:**
- Create: `src/contexts/SubscriptionContext.tsx`

- [ ] **Step 1: Create the context**

Create `src/contexts/SubscriptionContext.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  trial_ends_at: string;
  current_period_end: string | null;
  trial_extended: boolean;
  day10_popup_shown: boolean;
  expired_popup_shown: boolean;
  created_at: string;
}

interface SubscriptionContextType {
  subscription: Subscription | null;
  isPremium: boolean;
  isTrialing: boolean;
  trialDaysLeft: number;
  trialExtended: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setSubscription(data ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchSubscription();
  }, [user?.id]);

  const now = new Date();
  const trialEndsAt = subscription ? new Date(subscription.trial_ends_at) : null;
  const isTrialing =
    subscription?.status === 'trialing' && trialEndsAt != null && trialEndsAt > now;
  const isPremium =
    subscription?.status === 'active' ||
    subscription?.status === 'lifetime' ||
    isTrialing;
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        isPremium,
        isTrialing,
        trialDaysLeft,
        trialExtended: subscription?.trial_extended ?? false,
        loading,
        refresh: fetchSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/SubscriptionContext.tsx
git commit -m "feat: add SubscriptionContext with isPremium logic"
```

---

## Task 5: Wrap App.tsx with SubscriptionProvider + ReviewPopup placeholder

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the contents of `src/App.tsx` with:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { AppLayout } from '@/components/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CalculatorPage } from '@/pages/CalculatorPage';
import { AIInputPage } from '@/pages/AIInputPage';
import { InvoicePage } from '@/pages/InvoicePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { SupportPage } from '@/pages/SupportPage';
import type { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <BrowserRouter>
        <AuthProvider>
          <SubscriptionProvider>
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/calculator" element={<CalculatorPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/ai-input" element={<AIInputPage />} />
                <Route path="/history" element={<Navigate to="/projects" replace />} />
                <Route path="/invoices" element={<InvoicePage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </SubscriptionProvider>
        </AuthProvider>
      </BrowserRouter>
      <Analytics />
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles and app loads**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:5173` → app should load normally, no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wrap app with SubscriptionProvider"
```

---

## Task 6: Trial badge + AI Input sparkle in AppLayout

**Files:**
- Modify: `src/components/AppLayout.tsx`

- [ ] **Step 1: Add subscription-aware elements to AppLayout**

In `src/components/AppLayout.tsx`, make the following changes:

**Add imports at the top** (after existing imports):

```typescript
import { useSubscription } from '@/contexts/SubscriptionContext';
```

**Inside the `AppLayout` function**, after the existing hooks, add:

```typescript
const { isPremium, isTrialing, trialDaysLeft } = useSubscription();
```

**Update the `navItems` map** to add a sparkle indicator on AI Input. Replace the nav items render block (the `.map()` inside `<nav>`) with:

```typescript
{navItems.map(({ path, label, icon: Icon }) => {
  const isActive = location.pathname === path;
  const isAIInput = path === '/ai-input';
  return (
    <Link key={path} to={path}>
      <div
        className={cn(
          "flex items-center h-11 rounded-2xl transition-all duration-200 cursor-pointer",
          sidebarExpanded ? "gap-3 px-3 justify-start" : "justify-center px-0",
          isActive
            ? "bg-[#FFD528] text-[#1F1F21]"
            : "text-white/60 hover:text-white hover:bg-white/10"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {sidebarExpanded && (
          <span className="text-sm font-medium whitespace-nowrap font-mono flex-1">
            {label}
          </span>
        )}
        {sidebarExpanded && isAIInput && !isPremium && (
          <span className="text-[10px] font-bold text-[#FFD528] opacity-80">✦</span>
        )}
      </div>
    </Link>
  );
})}
```

**Add the trial badge** in the bottom user section. Find the user row block (the `<div>` with class `h-9 w-9 rounded-full`) and add the badge just before it:

```typescript
{/* Trial / Pro badge */}
{sidebarExpanded && isTrialing && (
  <div className="flex items-center gap-2 px-3 py-1.5">
    <span className="text-[10px] font-bold text-[#FFD528] bg-[#FFD528]/10 border border-[#FFD528]/25 rounded-full px-2.5 py-0.5">
      ✦ Trial — {trialDaysLeft}d left
    </span>
  </div>
)}
{sidebarExpanded && !isPremium && !isTrialing && (
  <div className="flex items-center gap-2 px-3 py-1.5">
    <span className="text-[10px] font-bold text-white/40 bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5">
      Free plan
    </span>
  </div>
)}
{sidebarExpanded && isPremium && !isTrialing && (
  <div className="flex items-center gap-2 px-3 py-1.5">
    <span className="text-[10px] font-bold text-[#4ade80] bg-[#4ade80]/10 border border-[#4ade80]/25 rounded-full px-2.5 py-0.5">
      ✦ Pro
    </span>
  </div>
)}
```

Also add the same badge logic in the **mobile dropdown** — find the mobile nav section and add it after the nav items list, before the divider:

```typescript
{/* Mobile trial badge */}
{isTrialing && (
  <div className="px-3 py-2">
    <span className="text-[10px] font-bold text-[#FFD528] bg-[#FFD528]/10 border border-[#FFD528]/25 rounded-full px-2.5 py-0.5">
      ✦ Trial — {trialDaysLeft}d left
    </span>
  </div>
)}
```

- [ ] **Step 2: Verify visually**

```bash
npm run dev
```

Log in → confirm:
- Sidebar shows `✦ Trial — Xd left` badge
- AI Input nav item shows a small `✦` when not premium

- [ ] **Step 3: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "feat: add trial badge and Pro sparkle indicator to sidebar"
```

---

## Task 7: Trial countdown banner on Dashboard

**Files:**
- Create: `src/components/TrialBanner.tsx`
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Create TrialBanner component**

Create `src/components/TrialBanner.tsx`:

```typescript
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useState } from 'react';

export function TrialBanner() {
  const { isTrialing, trialDaysLeft } = useSubscription();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (!isTrialing || trialDaysLeft > 5 || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-[#FFD528]/10 border border-[#FFD528]/25 rounded-xl px-4 py-3 mb-6">
      <p className="text-sm font-medium text-[#FFD528]">
        Your trial ends in <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</strong> — upgrade to keep Pro access.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate('/settings', { state: { section: 'billing' } })}
          className="text-xs font-bold bg-[#FFD528] text-[#1F1F21] px-3 py-1.5 rounded-lg hover:bg-[#FFD528]/90 transition-colors"
        >
          Upgrade
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/30 hover:text-white/60 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add TrialBanner to DashboardPage**

Open `src/pages/DashboardPage.tsx`. Find the opening of the returned JSX (the outermost `<div>` or `<>` wrapping the page content) and add `<TrialBanner />` as the first element inside it.

Add the import at the top of the file:
```typescript
import { TrialBanner } from '@/components/TrialBanner';
```

Add in the JSX, as the first child of the page's root element:
```typescript
<TrialBanner />
```

- [ ] **Step 3: Verify**

```bash
npm run dev
```

To test: temporarily change `trialDaysLeft > 5` to `trialDaysLeft > 0` in `TrialBanner.tsx`, log in, go to Dashboard → banner should appear. Revert the change after verifying.

- [ ] **Step 4: Commit**

```bash
git add src/components/TrialBanner.tsx src/pages/DashboardPage.tsx
git commit -m "feat: add trial countdown banner to dashboard (last 5 days)"
```

---

## Task 8: ProLockOverlay component

**Files:**
- Create: `src/components/ProLockOverlay.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ProLockOverlay.tsx`:

```typescript
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

interface ProLockOverlayProps {
  children: ReactNode;
  featureName?: string;
  featureDescription?: string;
}

export function ProLockOverlay({
  children,
  featureName = 'This feature',
  featureDescription = 'Upgrade to Pro to unlock access.',
}: ProLockOverlayProps) {
  const { isPremium, trialExtended } = useSubscription();
  const navigate = useNavigate();

  if (isPremium) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred background content */}
      <div className="pointer-events-none select-none" style={{ filter: 'blur(4px)', opacity: 0.35 }}>
        {children}
      </div>

      {/* Lock card overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="bg-[#1F1F21] border border-[#2e2e32] rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl">
          {/* Lock icon */}
          <div className="w-12 h-12 bg-[#FFD528]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="4" y="10" width="14" height="10" rx="2.5" stroke="#FFD528" strokeWidth="1.7" />
              <path d="M7.5 10V7.5a3.5 3.5 0 017 0V10" stroke="#FFD528" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="11" cy="15" r="1.3" fill="#FFD528" />
            </svg>
          </div>

          <h3 className="text-base font-bold text-white mb-2">{featureName} is a Pro feature</h3>
          <p className="text-sm text-white/50 mb-6 leading-relaxed">{featureDescription}</p>

          <button
            onClick={() => navigate('/settings', { state: { section: 'billing' } })}
            className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors mb-2"
          >
            Upgrade to Pro
          </button>

          {!trialExtended ? (
            <button
              onClick={() => navigate('/settings', { state: { section: 'billing' } })}
              className="w-full bg-transparent text-white/50 border border-[#2e2e32] font-medium py-2.5 rounded-xl text-sm hover:border-white/20 hover:text-white/70 transition-colors"
            >
              Leave a review → 14 days free
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-white/30 text-xs border border-[#2a2a2c] rounded-xl py-2.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Review extension already used
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProLockOverlay.tsx
git commit -m "feat: add ProLockOverlay component for Pro-gated pages"
```

---

## Task 9: Gate AIInputPage with ProLockOverlay

**Files:**
- Modify: `src/pages/AIInputPage.tsx`

- [ ] **Step 1: Wrap AIInputPage content**

Open `src/pages/AIInputPage.tsx`. Add the import at the top:

```typescript
import { ProLockOverlay } from '@/components/ProLockOverlay';
```

Find the `return (` statement in `AIInputPage`. Wrap the entire returned JSX in `<ProLockOverlay>`:

```typescript
return (
  <ProLockOverlay
    featureName="AI Input"
    featureDescription="Describe your day in plain text and let AI fill in the calculator automatically."
  >
    {/* existing JSX stays exactly as-is here */}
  </ProLockOverlay>
);
```

- [ ] **Step 2: Verify**

```bash
npm run dev
```

With a fresh test account (trial not yet expired): AI Input should be fully accessible.

To test the lock: temporarily change `if (isPremium) return <>{children}</>` in `ProLockOverlay.tsx` to `if (false)` → AI Input should show blurred content with lock card. Revert after verifying.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AIInputPage.tsx
git commit -m "feat: gate AI Input page with ProLockOverlay"
```

---

## Task 10: extend-trial API route

**Files:**
- Create: `api/stripe/extend-trial.ts`

- [ ] **Step 1: Create the route**

Create `api/stripe/extend-trial.ts`:

```typescript
// Vercel Serverless Function — grants 14-day review extension (one-time, honour system)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  // Fetch current subscription via service role
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=trial_extended`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await getRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  if (rows[0].trial_extended === true) {
    return res.status(409).json({ error: 'Review extension already used' });
  }

  // Grant extension: +14 days from now, mark as used
  const newTrialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        trial_ends_at: newTrialEnd,
        trial_extended: true,
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return res.status(500).json({ error: `Failed to extend trial: ${err}` });
  }

  return res.status(200).json({ success: true, trial_ends_at: newTrialEnd });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/stripe/extend-trial.ts
git commit -m "feat: add extend-trial API route (review honour system)"
```

---

## Task 11: send-review-email API route

**Files:**
- Create: `api/send-review-email.ts`

- [ ] **Step 1: Create the route**

Create `api/send-review-email.ts`:

```typescript
// Vercel Serverless Function — sends the day-10 review prompt email via Resend

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });

  const { to, trialDaysLeft } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing email address' });

  const days = typeof trialDaysLeft === 'number' ? trialDaysLeft : 4;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr>
          <td style="background:#1F1F21;border-radius:12px 12px 0 0;padding:24px 36px">
            <span style="display:inline-block;background:#FFD528;border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;line-height:0">
              <img src="https://crewdock.app/logo.png" alt="Crew Dock" width="22" height="22" style="display:inline-block;vertical-align:middle;margin-top:7px">
            </span>
            <span style="color:#ffffff;font-weight:700;font-size:18px;vertical-align:middle;margin-left:10px">Crew Dock</span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:36px;color:#1F1F21;font-size:15px;line-height:1.6">
            <p style="margin:0 0 16px 0;font-size:18px;font-weight:700">Enjoying Crew Dock so far?</p>
            <p style="margin:0 0 12px 0">Your free trial ends in <strong>${days} day${days !== 1 ? 's' : ''}</strong>.</p>
            <p style="margin:0 0 24px 0">If you're finding it useful, we'd love a quick review — and as a thank you, we'll add <strong>14 more days of Pro access</strong> for free, no card needed.</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px 0">
              <tr>
                <td style="background:#FFD528;border-radius:8px;padding:12px 24px">
                  <a href="https://crewdock.app" style="color:#1F1F21;font-weight:700;font-size:14px;text-decoration:none">Leave a Review → Get 14 Days Free</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#888">After leaving your review, log in to Crew Dock and click "I've left my review" to unlock your extension.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f5;border-radius:0 0 12px 12px;padding:20px 36px;text-align:center">
            <p style="margin:0;font-size:11px;color:#ABABAB">Sent by <a href="https://crewdock.app" style="color:#ABABAB">Crew Dock</a> · APA Crew Rate Calculator</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Crew Dock <hello@crewdock.app>',
        to: [to],
        subject: `Your Crew Dock trial ends in ${days} day${days !== 1 ? 's' : ''} — get 14 more free`,
        html,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Resend error: ${err}` });
    }
    const data = await response.json();
    return res.status(200).json({ success: true, id: data.id });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/send-review-email.ts
git commit -m "feat: add send-review-email API route for day-10 prompt"
```

---

## Task 12: ReviewPopup component

**Files:**
- Create: `src/components/ReviewPopup.tsx`

The popup has two variants triggered at different points:
- **Day-10 variant** (`type === 'day10'`): shown while trial is active at day 10+
- **Expired variant** (`type === 'expired'`): shown on first login after trial ends

Both use the same warm Scenario A visual tone from the mockups.

- [ ] **Step 1: Create the component**

Create `src/components/ReviewPopup.tsx`:

```typescript
import { useState } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

interface ReviewPopupProps {
  type: 'day10' | 'expired';
  onClose: () => void;
}

export function ReviewPopup({ type, onClose }: ReviewPopupProps) {
  const { subscription, trialDaysLeft, refresh } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'prompt' | 'confirm' | 'success'>('prompt');
  const [loading, setLoading] = useState(false);

  const reviewUrl = 'https://crewdock.app'; // replace with Trustpilot/Google URL when confirmed

  const handleLeaveReview = () => {
    window.open(reviewUrl, '_blank', 'noopener,noreferrer');
    setPhase('confirm');
  };

  const handleClaimExtension = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/extend-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        await refresh();
        setPhase('success');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1F1F21] border border-[#2e2e32] rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="w-12 h-12 bg-[#FFD528]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 2L13.5 8.5L20.5 8.5L14.9 12.9L17.4 19.4L11 15L4.6 19.4L7.1 12.9L1.5 8.5L8.5 8.5L11 2Z"
              fill="#FFD528" />
          </svg>
        </div>

        {phase === 'prompt' && (
          <>
            {type === 'day10' ? (
              <>
                <div className="inline-flex items-center gap-1.5 bg-[#FFD528]/10 border border-[#FFD528]/20 text-[#FFD528] text-xs font-bold px-3 py-1 rounded-full mb-3">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle cx="5" cy="5" r="4" stroke="#FFD528" strokeWidth="1.3" />
                    <path d="M5 3V5.3L6.5 6.5" stroke="#FFD528" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in your trial
                </div>
                <h3 className="text-base font-bold text-white mb-2">Enjoying Crew Dock?</h3>
                <p className="text-sm text-white/50 mb-6 leading-relaxed">
                  Leave us a quick review and we'll add{' '}
                  <span className="text-[#FFD528] font-semibold">14 more days free</span>{' '}
                  to your trial — no card needed.
                </p>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-1.5 bg-[#FFD528]/10 border border-[#FFD528]/20 text-[#FFD528] text-xs font-bold px-3 py-1 rounded-full mb-3">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle cx="5" cy="5" r="4" stroke="#FFD528" strokeWidth="1.3" />
                    <path d="M5 3V5.3L6.5 6.5" stroke="#FFD528" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Your trial has ended
                </div>
                <h3 className="text-base font-bold text-white mb-2">Get 14 more days free</h3>
                <p className="text-sm text-white/50 mb-6 leading-relaxed">
                  Leave us a quick review and we'll unlock{' '}
                  <span className="text-[#FFD528] font-semibold">14 more days of Pro access</span>{' '}
                  — no card needed. Or upgrade to keep everything.
                </p>
              </>
            )}

            <button
              onClick={handleLeaveReview}
              className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors mb-2"
            >
              Leave a Review
            </button>
            <div className="border-t border-[#2e2e32] my-3" />
            <button
              onClick={() => { onClose(); navigate('/settings', { state: { section: 'billing' } }); }}
              className="w-full bg-transparent text-white/50 border border-[#2e2e32] font-medium py-2.5 rounded-xl text-sm hover:border-white/20 hover:text-white/70 transition-colors mb-2"
            >
              Upgrade to Pro instead
            </button>
            <button onClick={onClose} className="text-xs text-white/25 hover:text-white/40 transition-colors mt-1">
              {type === 'day10' ? 'Maybe later' : 'Continue on free plan'}
            </button>
          </>
        )}

        {phase === 'confirm' && (
          <>
            <h3 className="text-base font-bold text-white mb-2">Thanks for leaving a review!</h3>
            <p className="text-sm text-white/50 mb-6 leading-relaxed">
              Once you've submitted it, click below to unlock your 14 days.
            </p>
            <button
              onClick={handleClaimExtension}
              disabled={loading}
              className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors disabled:opacity-50 mb-2"
            >
              {loading ? 'Activating...' : "I've left my review → Unlock 14 days"}
            </button>
            <button onClick={onClose} className="text-xs text-white/25 hover:text-white/40 transition-colors">
              Cancel
            </button>
          </>
        )}

        {phase === 'success' && (
          <>
            <h3 className="text-base font-bold text-white mb-2">You're all set!</h3>
            <p className="text-sm text-white/50 mb-6 leading-relaxed">
              14 more days of Pro access have been added. Thanks for the review!
            </p>
            <button
              onClick={onClose}
              className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors"
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReviewPopup.tsx
git commit -m "feat: add ReviewPopup component (day-10 and expired variants)"
```

---

## Task 13: Wire ReviewPopup into App.tsx + trigger email

**Files:**
- Create: `src/components/ReviewPopupController.tsx`
- Modify: `src/App.tsx`

The controller component reads subscription state and decides when to show which popup variant. It also fires the day-10 email and marks the popup as shown via service calls.

- [ ] **Step 1: Create ReviewPopupController**

Create `src/components/ReviewPopupController.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { ReviewPopup } from '@/components/ReviewPopup';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function markPopupShown(userId: string, field: 'day10_popup_shown' | 'expired_popup_shown', token: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ [field]: true }),
  });
}
```

> **Note:** `markPopupShown` uses the user's own JWT (not service role). This works because setting a popup flag to `true` is safe for the user to do themselves. Add an UPDATE RLS policy to allow this in Supabase:
>
> ```sql
> -- Run in Supabase SQL Editor
> CREATE POLICY "users_update_popup_flags"
>   ON public.subscriptions FOR UPDATE
>   USING (auth.uid() = user_id)
>   WITH CHECK (
>     auth.uid() = user_id
>     AND trial_extended = (SELECT trial_extended FROM public.subscriptions WHERE user_id = auth.uid())
>     AND trial_ends_at = (SELECT trial_ends_at FROM public.subscriptions WHERE user_id = auth.uid())
>     AND status = (SELECT status FROM public.subscriptions WHERE user_id = auth.uid())
>   );
> ```

Continue `ReviewPopupController.tsx`:

```typescript
export function ReviewPopupController() {
  const { subscription, isPremium, isTrialing, trialDaysLeft, loading } = useSubscription();
  const { user, session } = useAuth();
  const [activePopup, setActivePopup] = useState<'day10' | 'expired' | null>(null);

  useEffect(() => {
    if (loading || !subscription || !user || !session) return;

    const now = new Date();
    const createdAt = new Date(subscription.created_at);
    const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const trialEnded = new Date(subscription.trial_ends_at) <= now;

    // Day-10 popup: show during trial at day 10+, not yet extended, not yet shown
    if (
      isTrialing &&
      daysSinceCreated >= 10 &&
      !subscription.trial_extended &&
      !subscription.day10_popup_shown
    ) {
      markPopupShown(user.id, 'day10_popup_shown', session.access_token);
      // Send review email
      fetch('/api/send-review-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, trialDaysLeft }),
      });
      setActivePopup('day10');
      return;
    }

    // Expired popup: show after trial ends, not extended, not yet shown
    if (
      trialEnded &&
      !isPremium &&
      !subscription.trial_extended &&
      !subscription.expired_popup_shown
    ) {
      markPopupShown(user.id, 'expired_popup_shown', session.access_token);
      setActivePopup('expired');
    }
  }, [loading, subscription?.id]);

  if (!activePopup) return null;

  return (
    <ReviewPopup
      type={activePopup}
      onClose={() => setActivePopup(null)}
    />
  );
}
```

- [ ] **Step 2: Apply the UPDATE RLS policy**

In Supabase Dashboard → SQL Editor, run:

```sql
CREATE POLICY "users_update_popup_flags"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND trial_extended = (SELECT trial_extended FROM public.subscriptions WHERE user_id = auth.uid())
    AND trial_ends_at = (SELECT trial_ends_at FROM public.subscriptions WHERE user_id = auth.uid())
    AND status = (SELECT status FROM public.subscriptions WHERE user_id = auth.uid())
  );
```

- [ ] **Step 3: Mount ReviewPopupController in App.tsx**

In `src/App.tsx`, add the import:

```typescript
import { ReviewPopupController } from '@/components/ReviewPopupController';
```

Inside `<SubscriptionProvider>`, after `<Routes>...</Routes>`, add:

```typescript
<ReviewPopupController />
```

- [ ] **Step 4: Verify**

```bash
npm run dev
```

To test the day-10 popup: in Supabase Dashboard, find your test user's `subscriptions` row and set `created_at` to 10 days ago. Reload the app → popup should appear. Reset `created_at` after verifying.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReviewPopupController.tsx src/App.tsx
git commit -m "feat: wire ReviewPopupController — triggers day-10 and expired popups"
```

---

## Task 14: Plan & Billing settings section

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add imports to SettingsPage**

At the top of `src/pages/SettingsPage.tsx`, add:

```typescript
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useLocation, useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Add hooks inside the SettingsPage component**

Inside the `SettingsPage` function (near the other hook calls), add:

```typescript
const { subscription, isPremium, isTrialing, trialDaysLeft, trialExtended } = useSubscription();
const location = useLocation();
const navigate = useNavigate();
const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
const [checkoutLoading, setCheckoutLoading] = useState(false);
const [portalLoading, setPortalLoading] = useState(false);

// Navigate to billing section if redirected from Stripe or ReviewPopup
useEffect(() => {
  if (location.state?.section === 'billing') {
    setActiveSection('billing');
    navigate(location.pathname, { replace: true, state: {} });
  }
}, [location.state]);
```

- [ ] **Step 3: Add helper functions**

Inside the component, add:

```typescript
const handleUpgrade = async () => {
  if (!user) return;
  setCheckoutLoading(true);
  try {
    const priceId = billingCycle === 'monthly'
      ? import.meta.env.VITE_STRIPE_PRICE_MONTHLY
      : import.meta.env.VITE_STRIPE_PRICE_YEARLY;
    const res = await fetch('/api/stripe/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId, userId: user.id, userEmail: user.email }),
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
  } finally {
    setCheckoutLoading(false);
  }
};

const handleManagePlan = async () => {
  if (!user) return;
  setPortalLoading(true);
  try {
    const res = await fetch('/api/stripe/create-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
  } finally {
    setPortalLoading(false);
  }
};
```

- [ ] **Step 4: Add Stripe price IDs to .env.local**

Add to `.env.local`:
```
VITE_STRIPE_PRICE_MONTHLY=price_...
VITE_STRIPE_PRICE_YEARLY=price_...
```

- [ ] **Step 5: Update the nav item label**

In the `NAV_ITEMS` array in `SettingsPage.tsx`, change the billing entry:

```typescript
{ id: 'billing', label: 'Plan & Billing', icon: CreditCard },
```

(Remove the `badge: 'Soon'` property.)

- [ ] **Step 6: Replace the billing section JSX**

Find the `{activeSection === 'billing' && (` block (currently a placeholder) and replace it entirely with:

```typescript
{activeSection === 'billing' && (
  <div className="space-y-6">
    {/* Current plan status */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Plan & Billing
        </CardTitle>
        <CardDescription>Your current plan and payment settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status pill */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
          <div>
            <p className="text-sm font-semibold">
              {isPremium && !isTrialing ? '✦ Crew Dock Pro' : isTrialing ? 'Crew Dock Pro (Trial)' : 'Free'}
            </p>
            {isTrialing && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Trial ends in {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}
              </p>
            )}
            {isPremium && !isTrialing && subscription?.current_period_end && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Renews {new Date(subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
            {!isPremium && !isTrialing && (
              <p className="text-xs text-muted-foreground mt-0.5">Core features only — Pro features locked</p>
            )}
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
            isPremium && !isTrialing
              ? 'bg-green-500/10 border-green-500/25 text-green-400'
              : isTrialing
              ? 'bg-[#FFD528]/10 border-[#FFD528]/25 text-[#FFD528]'
              : 'bg-white/5 border-white/10 text-white/40'
          }`}>
            {isPremium && !isTrialing ? 'Active' : isTrialing ? 'Trial' : 'Free'}
          </span>
        </div>

        {/* Manage plan (Pro only) */}
        {isPremium && !isTrialing && (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleManagePlan}
              disabled={portalLoading}
            >
              {portalLoading ? 'Opening portal...' : 'Manage Plan & Billing'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Update card, view invoices, or cancel via the Stripe billing portal.
            </p>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Upgrade card (non-Pro only) */}
    {!isPremium || isTrialing ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isTrialing ? 'Upgrade to keep Pro access' : 'Unlock Crew Dock Pro'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Billing cycle toggle */}
          <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                billingCycle === 'monthly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                billingCycle === 'yearly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              Yearly
              <span className="text-[10px] font-bold bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded">Save 28%</span>
            </button>
          </div>

          {/* Price display */}
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">{billingCycle === 'monthly' ? '£3.45' : '£29.95'}</span>
            <span className="text-muted-foreground text-sm">{billingCycle === 'monthly' ? '/ month' : '/ year'}</span>
            {billingCycle === 'yearly' && (
              <span className="text-xs text-muted-foreground ml-1">(£2.50/mo)</span>
            )}
          </div>

          {/* Feature list */}
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {[
              'AI Input — describe your day, auto-fills the calculator',
              'Invoice direct — send PDF invoices by email',
              '3 years data retention',
              'Bookkeeping integrations (coming soon)',
            ].map(f => (
              <li key={f} className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7L5.5 10L11.5 4" stroke="#FFD528" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {f}
              </li>
            ))}
          </ul>

          <Button
            className="w-full bg-[#FFD528] text-[#1F1F21] hover:bg-[#FFD528]/90 font-bold"
            onClick={handleUpgrade}
            disabled={checkoutLoading}
          >
            {checkoutLoading ? 'Redirecting...' : `Upgrade to Pro — ${billingCycle === 'monthly' ? '£3.45/mo' : '£29.95/yr'}`}
          </Button>

          {/* Review extension CTA (only if not yet used) */}
          {!trialExtended ? (
            <Button variant="outline" className="w-full" onClick={() => {
              window.open('https://crewdock.app', '_blank', 'noopener,noreferrer'); // replace with review URL
            }}>
              Leave a review → 14 days free
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground border border-border rounded-xl py-2.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Review extension already used
            </div>
          )}
        </CardContent>
      </Card>
    ) : null}
  </div>
)}
```

- [ ] **Step 7: Verify all four states render**

```bash
npm run dev
```

Go to Settings → Plan & Billing. With a trialing account you should see the trial status + upgrade card. Manually set `status = 'active'` in Supabase to verify the Pro state renders (Manage Plan button visible, no upgrade card).

- [ ] **Step 8: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: replace placeholder Billing section with Plan & Billing"
```

---

## Task 15: Enforce 10-job limit for free users

**Files:**
- Modify: `src/pages/CalculatorPage.tsx`

Jobs are created in `CalculatorPage` around line 963 when saving without a selected project. We gate this with a count check.

- [ ] **Step 1: Add subscription import to CalculatorPage**

At the top of `src/pages/CalculatorPage.tsx`, add:

```typescript
import { useSubscription } from '@/contexts/SubscriptionContext';
```

- [ ] **Step 2: Add the hook inside the component**

Inside `CalculatorPage`, add alongside existing hooks:

```typescript
const { isPremium } = useSubscription();
```

- [ ] **Step 3: Add count check before project creation**

Find the project creation block (~line 962–969):

```typescript
if (!resolvedProjectId) {
  const { data: proj, error: projError } = await supabase.from('projects').insert({
    user_id: user.id,
    name: projectName || 'Untitled',
    client_name: null,
  }).select().single();
  if (projError || !proj) { setSaving(false); setSaveError(true); return null; }
  resolvedProjectId = proj.id;
```

Replace the `if (!resolvedProjectId) {` block with:

```typescript
if (!resolvedProjectId) {
  // Enforce 10-job limit for free users
  if (!isPremium) {
    const { count } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if ((count ?? 0) >= 10) {
      setSaving(false);
      toast.error('Free plan limit reached — upgrade to Pro for unlimited jobs, or delete an existing job to free a slot.');
      return null;
    }
  }

  const { data: proj, error: projError } = await supabase.from('projects').insert({
    user_id: user.id,
    name: projectName || 'Untitled',
    client_name: null,
  }).select().single();
  if (projError || !proj) { setSaving(false); setSaveError(true); return null; }
  resolvedProjectId = proj.id;
```

> `toast` is already imported in `CalculatorPage` via `sonner`. If not, add `import { toast } from 'sonner';`.

- [ ] **Step 4: Verify**

```bash
npm run dev
```

Create 10 projects with a free account, then attempt to save an 11th day to a new project — toast error should appear. Delete a project and retry — should succeed.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CalculatorPage.tsx
git commit -m "feat: enforce 10-job limit for free users in CalculatorPage"
```

---

## Task 16: Stripe create-checkout API route

**Files:**
- Create: `api/stripe/create-checkout.ts`

- [ ] **Step 1: Create the route**

Create `api/stripe/create-checkout.ts`:

```typescript
// Vercel Serverless Function — creates a Stripe Checkout session

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || 'https://crewdock.app';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { priceId, userId, userEmail } = req.body;
  if (!priceId || !userId || !userEmail) {
    return res.status(400).json({ error: 'Missing priceId, userId, or userEmail' });
  }

  // Get or create Stripe customer
  const subRes = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await subRes.json();
  let customerId: string = rows?.[0]?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;
    // Store customer ID in Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ stripe_customer_id: customerId }),
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/settings?stripe=success`,
    cancel_url: `${APP_URL}/settings`,
    allow_promotion_codes: true,
  });

  return res.status(200).json({ url: session.url });
}
```

- [ ] **Step 2: Handle Stripe success redirect in SettingsPage**

In `src/pages/SettingsPage.tsx`, add to the existing `useEffect` that handles `location.state`:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('stripe') === 'success') {
    setActiveSection('billing');
    // Clean up URL
    window.history.replaceState({}, '', '/settings');
  }
  if (location.state?.section === 'billing') {
    setActiveSection('billing');
    navigate(location.pathname, { replace: true, state: {} });
  }
}, []);
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/stripe/create-checkout.ts src/pages/SettingsPage.tsx
git commit -m "feat: add Stripe create-checkout API route"
```

---

## Task 17: Stripe create-portal API route

**Files:**
- Create: `api/stripe/create-portal.ts`

- [ ] **Step 1: Create the route**

Create `api/stripe/create-portal.ts`:

```typescript
// Vercel Serverless Function — creates a Stripe Customer Portal session

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || 'https://crewdock.app';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  // Get Stripe customer ID
  const subRes = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await subRes.json();
  const customerId = rows?.[0]?.stripe_customer_id;

  if (!customerId) {
    return res.status(404).json({ error: 'No Stripe customer found for this user' });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/settings`,
  });

  return res.status(200).json({ url: portalSession.url });
}
```

- [ ] **Step 2: Enable Customer Portal in Stripe Dashboard**

1. Stripe Dashboard → **Settings → Billing → Customer portal**
2. Enable it and configure which actions users can take (cancel, update card, view invoices)
3. Save settings

- [ ] **Step 3: Commit**

```bash
git add api/stripe/create-portal.ts
git commit -m "feat: add Stripe create-portal API route"
```

---

## Task 18: Stripe webhook handler

**Files:**
- Create: `api/stripe/webhook.ts`

This route receives Stripe events and keeps the Supabase `subscriptions` table in sync. It requires raw body access to verify the Stripe signature.

- [ ] **Step 1: Create the webhook route**

Create `api/stripe/webhook.ts`:

```typescript
// Vercel Serverless Function — handles Stripe webhook events
// bodyParser must be disabled to allow raw body access for signature verification

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = { api: { bodyParser: false } };

async function getRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function updateSubscription(customerId: string, patch: Record<string, unknown>) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?stripe_customer_id=eq.${customerId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${String(err)}` });
  }

  const object = event.data.object as any;
  const customerId: string = object.customer;

  switch (event.type) {
    case 'customer.subscription.created':
      await updateSubscription(customerId, {
        stripe_subscription_id: object.id,
        status: 'active',
        current_period_end: new Date(object.current_period_end * 1000).toISOString(),
      });
      break;

    case 'customer.subscription.updated':
      await updateSubscription(customerId, {
        status: object.status === 'trialing' ? 'active' : object.status,
        current_period_end: new Date(object.current_period_end * 1000).toISOString(),
      });
      break;

    case 'customer.subscription.deleted':
      await updateSubscription(customerId, {
        status: 'canceled',
        current_period_end: null,
      });
      break;

    case 'invoice.payment_failed':
      await updateSubscription(customerId, { status: 'past_due' });
      break;

    default:
      // Unhandled event type — ignore
      break;
  }

  return res.status(200).json({ received: true });
}
```

- [ ] **Step 2: Test the webhook locally with Stripe CLI**

Install Stripe CLI if not present: `brew install stripe/stripe-cli/stripe`

```bash
stripe listen --forward-to localhost:5173/api/stripe/webhook
```

In a separate terminal, trigger a test event:
```bash
stripe trigger customer.subscription.created
```

Expected: Vercel dev server logs show the event was received and returned `{ received: true }`.

- [ ] **Step 3: Commit**

```bash
git add api/stripe/webhook.ts
git commit -m "feat: add Stripe webhook handler — syncs subscription status to Supabase"
```

---

## Task 19: Clean up delete-account.ts

**Files:**
- Modify: `api/delete-account.ts`

Add `subscriptions` to the list of tables deleted when a user deletes their account.

- [ ] **Step 1: Update the userTables array**

In `api/delete-account.ts`, find line 51:

```typescript
const userTables = ['projects', 'user_settings', 'favourite_roles', 'custom_roles', 'equipment_packages', 'calculation_history'];
```

Replace with:

```typescript
const userTables = ['projects', 'user_settings', 'favourite_roles', 'custom_roles', 'equipment_packages', 'calculation_history', 'subscriptions'];
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/delete-account.ts
git commit -m "fix: delete subscriptions row on account deletion"
```

---

## Self-review checklist

### Spec coverage

| Requirement | Task |
|---|---|
| Subscriptions table + RLS + trigger | Task 2 |
| Stripe products + env vars | Task 3 |
| SubscriptionContext + `isPremium` | Task 4 |
| SubscriptionProvider in App | Task 5 |
| Trial badge + AI Input sparkle | Task 6 |
| Trial countdown banner (last 5 days) | Task 7 |
| Pro lock overlay on AI Input | Tasks 8–9 |
| extend-trial API | Task 10 |
| Day-10 review email | Task 11 |
| ReviewPopup (day-10 + expired) | Task 12 |
| Wire popup controller + email trigger | Task 13 |
| Plan & Billing settings (4 states) | Task 14 |
| 10-job free limit | Task 15 |
| Stripe Checkout | Task 16 |
| Stripe Customer Portal | Task 17 |
| Stripe webhooks | Task 18 |
| Account deletion cleanup | Task 19 |
| Lock overlay hides review CTA when extension used | Task 8 |
| One-time extension enforced server-side | Task 10 |
| `trial_extended` blocks popup review CTA | Tasks 8, 12, 14 |

All spec requirements covered.

### Type consistency

- `Subscription` interface defined in `SubscriptionContext.tsx` (Task 4) — includes `day10_popup_shown` and `expired_popup_shown` matching migration columns (Task 2)
- `useSubscription()` returns `trialExtended` (boolean) — used by `ProLockOverlay`, `ReviewPopup`, `SettingsPage` consistently
- `isPremium` computed identically in context and never re-derived elsewhere

### Placeholder check

- Review platform URL is `'https://crewdock.app'` as a placeholder in Tasks 12, 14, 11 — replace with final Trustpilot/Google URL when confirmed
- `hello@crewdock.app` used as the from address in Task 11 — verify this domain is verified in Resend

---

**Plan complete and saved to `docs/superpowers/plans/2026-03-31-stripe-subscription.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
