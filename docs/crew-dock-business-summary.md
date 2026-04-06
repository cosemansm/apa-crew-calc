# Crew Dock — Business & Pricing Summary

---

## The Product

**Crew Dock** is a web-based rate calculator for UK commercial film industry crew. It runs on the web (Vercel hosted), with a potential mobile app conversion down the line if user numbers justify it.

---

## Competitor: Rate App

Rate App has three tiers:

| Tier | Price | What you get |
|---|---|---|
| Free | £0 | 2 jobs only (teaser) |
| Standard | £4.29/month · £34.99/year | Unlimited jobs — no bookkeeping |
| Pro | £4.99/month · £49.99/year | Unlimited jobs + QuickBooks only |

To get anything useful out of Rate App, you're paying. To get bookkeeping, you're on their most expensive tier — QuickBooks only.

---

## Crew Dock Subscription Tiers

### Free
- Unlimited projects
- 6 months data retention
- Custom rates
- Custom kit packages
- Favourite roles / your department
- Client list

*Our free tier already beats Rate App Standard — unlimited jobs, no payment required.*

### Crew Dock Pro
| Billing | Price |
|---|---|
| Monthly | **£3.49/month** |
| Annual | **£29.99/year** (£2.50/mo equiv.) |

**Pro features:**
- AI inputs (describe your day, auto-fills the calculator)
- Link bookkeeping software: QuickBooks, Xero, FreeAgent + more
- 3 years data retention
- Invoice direct

---

## Competitive Comparison

| | Rate App Free | Rate App Standard | Rate App Pro | Crew Dock Free | Crew Dock Pro |
|---|---|---|---|---|---|
| Price | £0 | £4.29/mo · £34.99/yr | £4.99/mo · £49.99/yr | £0 | **£3.49/mo · £29.99/yr** |
| Jobs/Projects | 2 only | Unlimited | Unlimited | **Unlimited** | **Unlimited** |
| Bookkeeping | None | None | QuickBooks only | None | **QuickBooks, Xero, FreeAgent +** |
| AI input | No | No | No | No | **Yes** |
| Invoice direct | No | No | No | No | **Yes** |
| Data retention | Unknown | Unknown | Unknown | 6 months | **3 years** |
| Platform | iOS + Android | iOS + Android | iOS + Android | Web | Web |

### The headline

- **Crew Dock Free beats Rate App Standard** — unlimited jobs, no payment
- **Crew Dock Pro costs less than Rate App Standard** — and includes bookkeeping, AI, and invoicing that Rate App Pro doesn't offer
- **vs Rate App Pro:** 30% cheaper monthly, 40% cheaper annually — with a materially stronger feature set

A Rate App user wanting unlimited jobs + bookkeeping pays £4.99/month or £49.99/year for QuickBooks only. Crew Dock Pro gives them QuickBooks + Xero + FreeAgent + AI input + invoice direct for £3.49/month or £29.99/year.

---

## Infrastructure Stack

| Service | Plan | Cost/month | Notes |
|---|---|---|---|
| Vercel | Hobby (free) → Pro | £0 → £16 | Free = non-commercial ToS; upgrade when earning |
| Supabase | Free → Pro | £0 → £20 | Free pauses after 1 week inactivity — mitigated (see below) |
| Cloudflare | Free | £0 | DNS routing |
| Namecheap | Domain | ~£1 | ~£10–15/year |
| Google Workspace | Starter | ~£5 | Support email |
| Gemini 2.5 Flash | Free → Pay-as-you-go | £0 → pence | AI inputs feature |
| **Total (free phase)** | | **~£1/month** | Just domain |
| **Total (paid infra)** | | **~£42–45/month** | Once commercial |

### Multiple Products Note
- **Vercel Pro** covers your entire account — all products share the £16/month.
- **Supabase Pro** is per-project (~£20 each). Free tier gives 2 projects free.

---

## Bookkeeping Integration Costs

The three integrations (QuickBooks, Xero, FreeAgent) are all OAuth-based. Users authenticate with their own existing accounts — Crew Dock never pays per connection or per API call.

| Integration | API cost to Crew Dock | Notes |
|---|---|---|
| Xero | £0 | OAuth API is free; App Store listing optional and not required |
| QuickBooks | £0 | Intuit developer program is free; production review required but no fee |
| FreeAgent | £0 | OAuth API is free for third-party app developers |

**At current scale: bookkeeping integrations cost nothing.** This is a genuine competitive advantage — we're offering three integrations Rate App doesn't have, at no additional operating cost.

**Watch at scale:** If Xero or QuickBooks introduce partnership tiers with fees (e.g. certified app requirements above a connection threshold), review at that point. It is not a current concern and would likely only arise with hundreds of active integrations.

---

## The Supabase Ping Tool

To prevent Supabase free tier from pausing after 1 week of no user activity, a lightweight keep-alive is built into the app using **Vercel's built-in cron jobs** (2 free on Hobby tier).

Scheduled in `vercel.json` to fire every Monday at 9am. **Cost: £0. Effort: ~15 minutes.**

---

## AI Cost Breakdown (Gemini 2.5 Flash)

The AI feature is premium-only. ~1,000 tokens per request (500 in / 500 out). Crew work approximately 3 days/week = ~13 AI requests per pro user per month.

| Total Users | Pro users | AI Requests/mo | AI Cost/mo |
|---|---|---|---|
| 10 | 2 | ~26 | <£0.01 |
| 50 | 12 | ~156 | ~£0.06 |
| 100 | 25 | ~325 | ~£0.12 |
| 200 | 45 | ~585 | ~£0.22 |

**AI is never a meaningful cost line.** Gemini 2.5 Flash free tier covers the early stages entirely. When paid, it's pence.

---

## User & Revenue Scenarios

### Assumptions

- **Pro conversion rate:** 22% (working professionals who need accounting/AI; this is conservative — Rate App's own Pro tier signals strong demand)
- **Revenue per pro user:** blended **£2.80/month** (70% annual @ £2.50, 30% monthly @ £3.49)
- **Bookkeeping users:** ~60% of pro users connect at least one integration — but this costs Crew Dock nothing (see above)
- **Infrastructure:** free phase until ~150–200 users, then transition to paid (~£42–45/month)

---

### 10 Users

| | |
|---|---|
| Pro users | 2 |
| Bookkeeping users | ~1 |
| Monthly revenue | ~£5.60 |
| Infrastructure | £1 (free phase) |
| AI cost | <£0.01 |
| **Monthly profit** | **~£4.60** |
| **Annual profit** | **~£55** |

*Still on free infrastructure. Small but positive. Every sign-up matters here.*

---

### 50 Users

| | |
|---|---|
| Pro users | 12 |
| Bookkeeping users | ~7 |
| Monthly revenue | ~£33.60 |
| Infrastructure | £1 (free phase) |
| AI cost | ~£0.06 |
| **Monthly profit** | **~£32.50** |
| **Annual profit** | **~£390** |

*Approaching break-even on paid infrastructure. At 15 pro users (~68 total), paid infra is fully covered.*

---

### 100 Users

| | |
|---|---|
| Pro users | 22 |
| Bookkeeping users | ~13 |
| Monthly revenue | ~£61.60 |
| Infrastructure | £1–42 (transition point) |
| AI cost | ~£0.12 |
| **Monthly profit** | **~£20–61** |
| **Annual profit** | **~£240–730** |

*Upgrade Vercel to Pro here (commercial ToS compliance). Supabase can stay free with ping tool.*

---

### 200 Users

| | |
|---|---|
| Pro users | 44 |
| Bookkeeping users | ~26 |
| Monthly revenue | ~£123 |
| Infrastructure | £42–45 (fully paid) |
| AI cost | ~£0.22 |
| **Monthly profit** | **~£78–81** |
| **Annual profit** | **~£935–970** |

*Good point to upgrade Supabase to Pro for reliability. Healthy margins, infrastructure is a small fraction of revenue.*

---

## Break-Even Point

On paid infrastructure (~£42/month):

- **Need just 15 pro subscribers** to cover all running costs
- That's roughly **68 total users** at 22% conversion
- Achievable very early in the product lifecycle

---

## Launch Strategy Recommendation

1. **Build on free tiers** — Vercel Hobby + Supabase Free + Gemini free + ping tool = ~£1/month outlay
2. **Founding member pricing** — first 50–100 subscribers at £19.99/year locked in. Builds loyalty, gets real users fast, funds the first year of Pro infrastructure
3. **14-day Pro trial** — let every free user experience AI inputs and accounting links once. These are the conversion moments
4. **Upgrade Vercel to Pro** when first payment comes in (commercial ToS)
5. **Upgrade Supabase to Pro** around 200–300 users or whenever you want guaranteed uptime without the ping workaround

---

## Summary Profit Table

| Users | Pro users | Monthly revenue | Infra cost | Monthly profit | Annual profit |
|---|---|---|---|---|---|
| 10 | 2 | £5.60 | £1 | £4.60 | ~£55 |
| 50 | 12 | £33.60 | £1 | £32.50 | ~£390 |
| 100 | 22 | £61.60 | £1–42 | £20–61 | ~£240–730 |
| 200 | 44 | £123 | £42–45 | £78–81 | ~£935–970 |

*Bookkeeping integration cost: £0 at all scales above.*

---

*Summary updated April 2026*
