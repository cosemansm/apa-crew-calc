# Stripe Subscription Billing — Design Spec

> Status: **Approved — ready for implementation**
> Date: 31 March 2026

---

## Overview

Crew Dock uses a Stripe-powered subscription model with a 14-day free trial (no credit card required). Trial state is managed entirely in Supabase — Stripe is only invoked when a user upgrades. After the trial, users either subscribe to Crew Dock Pro or remain on the free tier with core functionality only.

---

## Pricing

| Plan | Monthly | Annual |
|------|---------|--------|
| Free | £0 | £0 |
| **Crew Dock Pro** | **£3.45/month** | **£29.95/year** |

Founding member pricing is out of scope for v1.

---

## Feature Tiers

### Free (always available)
- Up to 10 active jobs and day tracking (deleting a job frees a slot — limit is on current count, not lifetime total)
- Calculator (full APA rate engine)
- Custom rates, kit packages, favourite roles
- Client list, dashboard, history
- 6 months data retention

### Crew Dock Pro (locked after trial + review extension expire)
- AI Input — describe your day in plain text, auto-fills the calculator
- Invoice direct — send invoice PDF via email from the app
- 3 years data retention
- Bookkeeping integrations — QuickBooks, Xero, FreeAgent (planned)

---

## Architecture

**Approach: App-managed trial, Stripe on upgrade only.**

- A `subscriptions` row is inserted into Supabase on every new signup (`status = 'trialing'`)
- No Stripe objects are created until the user clicks Upgrade
- Stripe Checkout handles card collection and subscription creation
- Stripe webhooks keep the Supabase `subscriptions` table in sync
- The frontend reads exclusively from Supabase — never from Stripe directly

---

## Database

One new table: `subscriptions`

```sql
CREATE TABLE subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text NOT NULL DEFAULT 'trialing',
  -- allowed: 'trialing' | 'active' | 'lifetime' | 'past_due' | 'canceled' | 'unpaid'
  -- note: 'free' is a derived UI state (trialing + trial_ends_at expired), never written to DB
  trial_ends_at          timestamptz NOT NULL DEFAULT now() + interval '14 days',
  current_period_end     timestamptz,
  trial_extended         boolean NOT NULL DEFAULT false,
  -- true once a review extension has been granted; blocks any further extension
  review_popup_shown     boolean NOT NULL DEFAULT false,
  -- true once the day-12 or expired-trial pop-up has been shown; prevents repeat across devices
  created_at             timestamptz DEFAULT now()
);
-- RLS: users can only SELECT their own row
```

On every new Supabase auth signup, auto-insert a row with `status = 'trialing'` via a database trigger or the app's signup handler.

---

## User States

| Status | Access | How they arrive |
|--------|--------|-----------------|
| `trialing` | Everything | Auto on signup (14 days, no card) |
| `active` | Everything | Stripe subscription active |
| `lifetime` | Everything | Manually granted via DB |
| `past_due` | Degraded | Stripe payment failed |
| `canceled` | Core only | Subscription cancelled |
| `free` | Core only | Trial expired, never subscribed |

**`isPremium` logic:**
```typescript
const isPremium =
  status === 'active' ||
  status === 'lifetime' ||
  (status === 'trialing' && trial_ends_at > now())
```

---

## Review Extension Flow

Users can earn one 14-day Pro extension by leaving a review. This is a one-time offer — `trial_extended` gates it permanently once used.

### Trigger points

1. **Day 12 pop-up + email** — shown once when the user logs in on day 10 of their trial (days since `created_at >= 12`). Also triggers a Resend email.
2. **Trial-expired pop-up** — shown on the user's first login after `trial_ends_at` has passed, **only if** `trial_extended = false`. Not shown again after dismissal.

### Honour system flow

1. User sees pop-up → clicks **"Leave a Review"** → opens review platform in new tab
2. On return, user clicks **"I've left my review"**
3. App calls `POST /api/stripe/extend-trial`
4. API sets `trial_ends_at = now() + 14 days` and `trial_extended = true` in Supabase
5. `isPremium` immediately becomes `true` — user regains full access
6. Review CTA never appears again for this user

### After extension expires

Once the extended `trial_ends_at` passes and the user has not subscribed:
- `isPremium` becomes `false`
- Pro features lock
- The review CTA is **never shown again** (`trial_extended = true`)
- Upgrade is the only path to Pro access

---

## API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/stripe/create-checkout` | Create Stripe Checkout session, redirect user to pay |
| `POST /api/stripe/create-portal` | Open Stripe Customer Portal (cancel, update card, billing history) |
| `POST /api/stripe/webhook` | Receive Stripe events, sync status to Supabase |
| `POST /api/stripe/extend-trial` | Grant 14-day review extension — checks `trial_extended = false` before applying |

### Webhook events to handle

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Set `status = 'active'`, store `stripe_subscription_id` |
| `customer.subscription.updated` | Sync `status` + `current_period_end` |
| `customer.subscription.deleted` | Set `status = 'canceled'` |
| `invoice.payment_failed` | Set `status = 'past_due'` |

---

## Frontend Architecture

### `SubscriptionContext` + `useSubscription()` hook

Fetched once on login, provides:

```typescript
const {
  isPremium,       // true if active, lifetime, or still trialing
  isTrialing,      // true if status === 'trialing' AND trial_ends_at > now()
  trialDaysLeft,   // days remaining in trial (includes review extension period)
  trialExtended,   // true if review extension has been used
  status,          // raw status string
} = useSubscription()
```

Every gated component checks `isPremium`. No other changes needed outside the six UI touchpoints.

---

## UI Touchpoints

### 1. Trial badge (header/nav)
Gold `✦ Trial` badge showing days remaining. Visible throughout the trial and review extension period.

### 2. Trial countdown banner (dashboard)
Subtle strip in the last 5 days: *"Trial ends in X days — Upgrade"*. Uses `trialDaysLeft`.

### 3. Day 12 review pop-up
- Triggered once on login when `daysSinceSignup >= 10`, `trial_extended = false`, and `review_popup_shown = false`
- Shows days remaining, review CTA, and "Upgrade to Pro instead" secondary action
- Dismiss sets `review_popup_shown = true` in the `subscriptions` table — persists across devices
- Also triggers a Resend email with the same message

### 4. Trial-expired pop-up
- Triggered on first login after `trial_ends_at` has passed, only if `trial_extended = false` and `review_popup_shown = false`
- Warm tone: *"Get 14 more days free"* headline
- CTAs: "Leave a Review → 14 Days Free" (primary) + "Upgrade to Pro" (secondary) + "Continue on free plan" (dismiss)
- Once `trial_extended = true`, this pop-up is never shown again — upgrade is the only path

### 5. Pro feature lock overlay (AI Input page + future Pro pages)
- Blurred page content with centred lock card (Option A)
- Lock card copy adapts based on `trial_extended`:
  - **`false`**: "Upgrade to Pro" (primary) + "Leave a review → 14 days free" (secondary)
  - **`true`**: "Upgrade to Pro" (primary) + quiet "Review extension already used" badge (no CTA)

### 6. Settings → Plan & Billing
Replaces/merges with the existing Billing section. Four states:

| State | Content |
|-------|---------|
| `trialing` | Trial status pill + days left, pricing toggle, upgrade CTA |
| `active` | Pro status pill, plan + renewal date, "Manage Plan" → Stripe portal |
| `free` (review not used) | Free status, pricing toggle, upgrade CTA, "Leave a review → 14 days free" |
| `free` (review used) | Free status, pricing toggle, upgrade CTA, "Review extension already used" badge |

---

## Environment Variables

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_MONTHLY
STRIPE_PRICE_YEARLY
```

---

## Out of Scope (v1)

- Founding member pricing (£19.99/year)
- Automated review verification via API
- Bookkeeping integrations (Xero, QuickBooks, FreeAgent)
- Supabase keep-alive ping cron job (separate, ~15 min task)
