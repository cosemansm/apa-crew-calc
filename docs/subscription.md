# Crew Dock — Subscription & Monetisation Plan

> Status: **Planned — not yet implemented**
> Last updated: 23 March 2026

---

## Overview

Crew Dock will use a **Stripe-powered subscription** model with a **14-day free trial** (no credit card required). After the trial, users either subscribe to keep premium features or remain on the free tier with core functionality.

---

## User States

| State | Access | How they arrive |
|-------|--------|-----------------|
| `trialing` | Everything | Auto on signup (14 days, no card) |
| `premium` / `active` | Everything | Stripe subscription active |
| `free` | Core only | Trial expired, not subscribed |
| `past_due` | Degraded | Payment failed |
| `canceled` | Core only | Subscription cancelled |

---

## Feature Tiers

### Always Free (core value — never locked)
- Calculator
- Jobs / Day tracking
- Invoice PDF generation & email
- Dashboard
- History

### Premium Only (locked after trial)
- **AI Input** (natural language → day entry)
- **Bookkeeping integrations** (Xero, QuickBooks — planned)
- Potentially: unlimited jobs (free tier may cap at e.g. 5 jobs)

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
  -- allowed: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  trial_ends_at          timestamptz NOT NULL DEFAULT now() + interval '14 days',
  current_period_end     timestamptz,
  created_at             timestamptz DEFAULT now()
);
-- RLS: users can only read their own row
```

On every new Supabase auth signup, auto-insert a row with `status = 'trialing'` via a database trigger or the app's signup handler.

---

## Stripe Setup

### Products / Prices (to create in Stripe Dashboard)
- **Product:** Crew Dock Premium
- **Price A:** £X / month (recurring)
- **Price B:** £Y / year (recurring, discounted)

### Required Vercel API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/stripe/create-checkout` | Create Stripe Checkout session → redirect user to pay |
| `POST /api/stripe/create-portal` | Open Stripe Customer Portal (cancel, update card, billing history) |
| `POST /api/stripe/webhook` | Receive Stripe events → sync status to Supabase |

### Webhook Events to Handle

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Set `status = 'active'` |
| `customer.subscription.updated` | Sync `status` + `current_period_end` |
| `customer.subscription.deleted` | Set `status = 'canceled'` |
| `invoice.payment_failed` | Set `status = 'past_due'` |
| `customer.subscription.trial_will_end` | Trigger warning email (fires 3 days before expiry) |

### Required Environment Variables (Vercel)
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_MONTHLY
STRIPE_PRICE_YEARLY
```

---

## Frontend Architecture

### `useSubscription()` Hook

A `SubscriptionContext` fetched once on login, exposes:

```typescript
const {
  isPremium,      // true if active OR still trialing
  isTrialing,     // true if status === 'trialing' AND trial_ends_at > now()
  trialDaysLeft,  // number of days remaining in trial
  status,         // raw status string
} = useSubscription();

// isPremium logic:
// status === 'active'
// OR (status === 'trialing' AND trial_ends_at > now())
```

Every gated component simply checks `isPremium`. No other changes needed.

### UI Changes Required

**Dashboard**
- Gold `✦ Premium` or `✦ Trial` badge near user name / header
- Subtle trial countdown banner in last 5 days: `"Trial ends in X days — Upgrade"`

**AI Input page**
- `✦ Premium` badge in page header (always visible — free users can see it exists)
- If `!isPremium`: blur page content + lock overlay with upgrade CTA

**Sidebar nav**
- Small `✦` sparkle icon next to "AI Input" label to signal premium

**Settings page — new "Plan" section**
- Shows current plan status (Trial / Premium / Free)
- Trial / Free: monthly + yearly pricing toggle, upgrade CTA
- Premium: "Manage Plan" button → Stripe Customer Portal

**Future bookkeeping integration pages**
- Same lock overlay pattern as AI Input

---

## User Journey

```
Sign up
   └─ Row inserted: status=trialing, trial_ends_at = now() + 14 days
         │
         ├─ Days 1–10:  Full access, no prompts
         ├─ Days 11–13: Subtle countdown banner on dashboard
         ├─ Day 14 end: trial_ends_at passes → isPremium = false
         │              Premium features lock, upgrade CTA shown
         │
         ├─ User clicks Upgrade
         │    └─ POST /api/stripe/create-checkout
         │         └─ Stripe Checkout (card entry)
         │              └─ Payment success → webhook fires
         │                   └─ status = 'active' → isPremium = true instantly
         │
         └─ User wants to manage/cancel
              └─ POST /api/stripe/create-portal → Stripe Customer Portal
```

---

## Implementation Order (when ready to build)

1. **Supabase** — Create `subscriptions` table + DB trigger to auto-insert on signup
2. **Stripe** — Create product, prices, configure webhook endpoint
3. **Vercel env vars** — Add all four Stripe keys
4. **API routes** — `create-checkout`, `create-portal`, `webhook`
5. **Frontend** — `SubscriptionContext` + `useSubscription()` hook
6. **Gate features** — Wrap AI Input + any future premium pages
7. **UI** — Premium badges, trial countdown, Settings plan section

---

## Key Design Decisions

- **No card on signup** — 14-day free trial with zero friction. Higher signup conversion. Stripe supports card-free trials natively; collect card when trial ends.
- **Stripe Customer Portal** — Handles all billing self-service (cancel, update card, invoices). No custom billing UI needed.
- **Webhook is the source of truth** — Frontend never trusts its own state for access; always reads from `subscriptions` table which is kept in sync by the webhook.
