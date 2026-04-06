# Crew Dock — Subscription & Monetisation Plan

> Status: **Planned — not yet implemented**
> Last updated: 24 March 2026

---

## Overview

Crew Dock uses a **Stripe-powered subscription** model with a **14-day free trial** (no credit card required). After the trial, users either subscribe to Crew Dock Pro or remain on the free tier with core functionality.

**Competitor context:** Rate App has three tiers — Free (2 jobs only), Standard (£4.29/mo · £34.99/yr, unlimited jobs, no bookkeeping), and Pro (£4.99/mo · £49.99/yr, unlimited jobs + QuickBooks only). Crew Dock Free already beats their Standard tier. Crew Dock Pro is cheaper than Rate App Standard while including bookkeeping, AI, and invoicing that Rate App Pro doesn't offer.

---

## Pricing

| Plan | Monthly | Annual | Annual equiv/mo |
|------|---------|--------|-----------------|
| Free | £0 | £0 | — |
| **Crew Dock Pro** | **£3.45/month** | **£29.95/year** | **£2.50/mo** |

**Founding member pricing (launch strategy):** First 50–100 subscribers offered £19.99/year locked in — builds loyalty, gets real users fast, funds the first year of paid infrastructure.

---

## Feature Tiers

### Free (core value — never locked)
- Unlimited jobs and day tracking
- Calculator (full APA rate engine)
- Custom rates, custom kit packages, favourite roles
- Client list
- Dashboard + History
- 6 months data retention

### Crew Dock Pro (locked after trial expires)
- **AI Input** — describe your day in plain text, auto-fills the calculator
- **Bookkeeping integrations** — QuickBooks, Xero, FreeAgent + more (planned)
- **Invoice direct** — send invoice PDF via email from the app
- **3 years data retention** (vs 6 months free)

> Note: Invoice direct is currently built and available to all users during the trial phase. Post-launch, evaluate whether to gate it behind Pro or keep it free as a differentiator.

---

## User States

| State | Access | How they arrive |
|-------|--------|-----------------|
| `trialing` | Everything | Auto on signup (14 days, no card required) |
| `active` | Everything | Stripe subscription active |
| `lifetime` | Everything | Manually granted by admin |
| `free` | Core only | Trial expired, not subscribed |
| `past_due` | Degraded | Payment failed |
| `canceled` | Core only | Subscription cancelled |

---

## Revenue & Break-Even Projections

Assumptions: 25% premium conversion, blended £2.79/month per premium user (70% annual @ £2.50, 30% monthly @ £3.45).

| Total Users | Premium Users | Monthly Revenue | Infra Cost | Monthly Profit |
|-------------|---------------|-----------------|------------|----------------|
| 100 | 25 | ~£70 | ~£1 | **~£69** |
| 200 | 50 | ~£140 | ~£1–42 | **~£98–139** |
| 500 | 140 | ~£392 | ~£45 | **~£347** |
| 800 | 240 | ~£672 | ~£45 | **~£627** |

**Break-even on paid infrastructure (~£42/month): just 15 premium subscribers (~60 total users at 25% conversion).**

---

## Infrastructure & Running Costs

| Service | Free Phase | Paid Phase | Notes |
|---------|-----------|------------|-------|
| Vercel | £0 (Hobby) | £16/month (Pro) | Upgrade when first revenue arrives (commercial ToS) |
| Supabase | £0 (Free) | £20/month (Pro) | Upgrade ~200–300 users for guaranteed uptime |
| Cloudflare | £0 | £0 | DNS routing |
| Domain (Namecheap) | ~£1/month | ~£1/month | ~£10–15/year |
| Google Workspace | ~£5/month | ~£5/month | Support email |
| Gemini 2.5 Flash | £0 (free tier) | Pence | AI inputs |
| **Total free phase** | **~£1/month** | | Just domain |
| **Total paid phase** | | **~£42–45/month** | |

**Vercel Pro covers your entire account** — all products share the £16/month. Supabase Pro is per-project (~£20 each); free tier includes 2 projects.

### Supabase Ping Tool
The free Supabase tier pauses after 1 week of inactivity. A keep-alive cron job prevents this at zero cost:
- API route `/api/ping` runs a minimal DB query
- Scheduled via `vercel.json` to fire every Monday at 9am
- Uses 1 of the 2 free cron slots on Vercel Hobby
- Effort: ~15 minutes to implement. Eliminates the risk until Supabase Pro is warranted.

---

## AI Cost Breakdown (Gemini 2.5 Flash)

~1,000 tokens per AI request (500 in / 500 out). Crew work ~3 days/week = ~13 AI requests per premium user per month.

| Total Users | Premium (25%) | AI Requests/mo | AI Cost/mo |
|-------------|---------------|----------------|------------|
| 100 | 25 | ~325 | ~£0.12 |
| 200 | 50 | ~650 | ~£0.25 |
| 500 | 140 | ~1,820 | ~£0.70 |
| 800 | 240 | ~3,120 | ~£1.20 |

AI cost is negligible at every scale. Gemini 2.5 Flash free tier (~250–1,500 req/day) covers the early stages entirely.

**Future AI fallbacks if cost ever becomes relevant:**
- Groq — ~14,400 req/day free, Llama models, near drop-in replacement
- Cloudflare Workers AI — 10,000 req/day free, integrates with existing Cloudflare setup
- Gemini 1.5 Flash-8B — half the price, fully capable for text extraction

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
- **Product:** Crew Dock Pro
- **Price A:** £3.45 / month (recurring)
- **Price B:** £29.95 / year (recurring)
- **Founding member price:** £19.99 / year (coupon or separate price, limited availability)

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

### Trial Extension for Reviews
Users who leave a great review receive an additional 14 days added to their trial.

- A Vercel API route `POST /api/stripe/extend-trial` handles the extension
- Calls `stripe.subscriptions.update()` with `trial_end` set to current `trial_end + 14 days`
- Syncs updated `trial_ends_at` back to Supabase via webhook
- Trigger options:
  - **Manual** — admin triggers extension from an internal tool after verifying the review
  - **Automated** — webhook from a review platform (e.g. Trustpilot, Google) calls the route directly
- To prevent abuse, track extensions in the `subscriptions` table with a `trial_extended` boolean — one extension per user

### Lifetime Access
Select users can be granted permanent Pro access with no Stripe subscription required.

- Add a `lifetime` status to the `subscriptions` table (no `stripe_subscription_id` needed)
- `isPremium` logic treats `status === 'lifetime'` the same as `active`
- Granted manually via an admin tool or direct DB update — no self-serve path
- Use cases: early contributors, beta testers, personal contacts, press/media
- No expiry, no webhook management — purely a DB flag

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
// OR status === 'lifetime'
// OR (status === 'trialing' AND trial_ends_at > now())
```

Every gated component simply checks `isPremium`. No other changes needed.

### UI Changes Required

**Dashboard**
- Gold `✦ Pro` or `✦ Trial` badge near user name / header
- Subtle trial countdown banner in last 5 days: `"Trial ends in X days — Upgrade"`

**AI Input page**
- `✦ Pro` badge in page header (always visible — free users can see it exists)
- If `!isPremium`: blur page content + lock overlay with upgrade CTA

**Sidebar nav**
- Small `✦` sparkle icon next to "AI Input" label to signal Pro feature

**Settings page — new "Plan" section**
- Shows current plan status (Trial / Pro / Free)
- Trial / Free: monthly + yearly pricing toggle, upgrade CTA, founding member offer if still available
- Pro: "Manage Plan" button → Stripe Customer Portal

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

## Launch Strategy

1. **Build on free tiers** — Vercel Hobby + Supabase Free + Gemini free + ping tool = ~£1/month
2. **Founding member pricing** — first 50–100 subscribers at £19.99/year locked in
3. **14-day Pro trial** — every user experiences AI inputs and accounting links; these are the conversion moments
4. **Upgrade Vercel to Pro** when first payment comes in (commercial ToS compliance)
5. **Upgrade Supabase to Pro** around 200–300 users for guaranteed uptime

---

## Competitive Comparison

| | Rate App Standard | Rate App Pro | Crew Dock Free | Crew Dock Pro |
|---|---|---|---|---|
| Price | £4.29/mo · £34.99/yr | £4.99/mo · £49.99/yr | £0 | £3.49/mo · £29.99/yr |
| Jobs | Unlimited | Unlimited | **Unlimited** | **Unlimited** |
| Bookkeeping | None | QuickBooks only | — | **QuickBooks, Xero, FreeAgent +** |
| AI input | No | No | No | **Yes** |
| Invoice direct | No | No | No | **Yes** |
| Data retention | Unknown | Unknown | 6 months | **3 years** |
| Platform | iOS + Android | iOS + Android | Web | Web |

*Crew Dock Pro costs less than Rate App's basic paid tier, and includes features Rate App Pro doesn't even offer.*

---

## Key Design Decisions

- **No card on signup** — 14-day free trial with zero friction. Higher signup conversion. Stripe supports card-free trials natively; collect card only when trial ends.
- **Stripe Customer Portal** — Handles all billing self-service (cancel, update card, invoices). No custom billing UI needed.
- **Webhook is the source of truth** — Frontend never trusts its own state for access; always reads from the `subscriptions` table, kept in sync by Stripe webhooks.
- **Gemini 2.5 Flash for AI** — negligible cost, easy to swap for Groq or Cloudflare Workers AI if needed later.
