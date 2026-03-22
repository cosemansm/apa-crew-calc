# Crew Dock — Business & Pricing Summary

---

## The Product

**Crew Dock** is a web-based rate calculator for UK commercial film industry crew. It runs on the web (Vercel hosted), with a potential mobile app conversion down the line if user numbers justify it.

**Competitor: Rate App**
- iOS and Android (native app advantage)
- Free tier: max 2 jobs
- Rate Pro: £4.99/month or £49.99/year
- Pro features: Unlimited jobs + QuickBooks only

**Crew Dock advantage:** Cheaper, more integrations, AI-assisted input, invoice direct, web-accessible anywhere.

---

## Subscription Tiers

### Free
- Unlimited projects
- 6 months data retention
- Custom rates
- Custom kit packages
- Favourite roles / your department
- Client list

### Crew Dock Pro
| Billing | Price | vs Rate App |
|---|---|---|
| Monthly | **£3.49/month** | 30% cheaper |
| Annual | **£29.99/year** (£2.50/mo equiv.) | 40% cheaper |

**Pro features:**
- AI inputs (describe your day, auto-fills the calculator)
- Link bookkeeping software: QuickBooks, Xero, FreeAgent + more
- 3 years data retention
- Invoice direct

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
- **Vercel Pro** covers your entire account — all products share the £16/month. Great value across a portfolio.
- **Supabase Pro** is per-project (~£20 each). Free tier gives 2 projects free, so 2 products can run simultaneously at no cost.

---

## The Supabase Ping Tool

To prevent Supabase free tier from pausing after 1 week of no user activity, a lightweight keep-alive is built into the app using **Vercel's built-in cron jobs** (2 free on Hobby tier).

**How it works:**

A simple API route (`/api/ping`) runs a minimal database query:

```js
// /api/ping.js
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )
  await supabase.from('your_table').select('id').limit(1)
  res.status(200).json({ alive: true })
}
```

Scheduled in `vercel.json` to fire every Monday at 9am:

```json
{
  "crons": [{
    "path": "/api/ping",
    "schedule": "0 9 * * 1"
  }]
}
```

**Cost: £0. Effort: ~15 minutes to implement.**

---

## AI Cost Breakdown (Gemini 2.5 Flash)

The AI feature is premium-only. Users describe their working day in plain text and it populates the calculator. Roughly 1,000 tokens per request (500 in / 500 out).

Crew work approximately 3 days/week, so ~13 AI requests per user per month.

| Users | Premium (25%) | AI Requests/mo | AI Cost/mo |
|---|---|---|---|
| 100 | 25 | ~325 | ~£0.12 |
| 200 | 50 | ~650 | ~£0.25 |
| 500 | 140 | ~1,820 | ~£0.70 |
| 800 | 240 | ~3,120 | ~£1.20 |

**At no point does AI become a meaningful cost line.** Gemini 2.5 Flash free tier (~250–1,500 req/day) likely covers the early stages entirely. When paid, it's pence.

### Future AI alternatives (if cost ever becomes relevant)
- **Groq** — free tier ~14,400 req/day, Llama models, near drop-in API replacement
- **Cloudflare Workers AI** — 10,000 req/day free, integrates with existing Cloudflare setup
- **Gemini 1.5 Flash-8B** — half the price of 2.5 Flash, fully capable for text extraction

For now, keep Gemini 2.5 Flash. Swap later with minimal code changes.

---

## User & Revenue Scenarios

Assumptions:
- Premium conversion rate: 25–30% (working professionals who need accounting/AI)
- Revenue per premium user: blended £2.80/month (70% annual @ £2.50, 30% monthly @ £3.49)
- Infrastructure: free phase until ~150–200 users, then paid

### 100 Users
| | |
|---|---|
| Premium users | 25 |
| Monthly revenue | ~£70 |
| Infrastructure | £1 (free phase) |
| AI cost | ~£0.12 |
| **Monthly profit** | **~£69** |
| **Annual profit** | **~£828** |

*Still on free infrastructure. Supabase ping tool keeping DB alive.*

---

### 200 Users
| | |
|---|---|
| Premium users | 50 |
| Monthly revenue | ~£140 |
| Infrastructure | £1–42 (transition point) |
| AI cost | ~£0.25 |
| **Monthly profit** | **~£98–139** |
| **Annual profit** | **~£1,175–1,668** |

*Good point to upgrade Vercel to Pro (commercial ToS). Supabase can stay free with ping tool or upgrade for reliability.*

---

### 500 Users
| | |
|---|---|
| Premium users | 140 |
| Monthly revenue | ~£392 |
| Infrastructure | £42–45 (fully paid) |
| AI cost | ~£0.70 |
| **Monthly profit** | **~£346–349** |
| **Annual profit** | **~£4,150–4,190** |

*Healthy margins. Supabase Pro worth upgrading here for reliability and no pausing risk.*

---

### 800 Users
| | |
|---|---|
| Premium users | 240 |
| Monthly revenue | ~£672 |
| Infrastructure | ~£45 |
| AI cost | ~£1.20 |
| **Monthly profit** | **~£626** |
| **Annual profit** | **~£7,510** |

*85%+ profit margin. Infrastructure is a negligible fraction of revenue.*

---

## Break-Even Point

On paid infrastructure (~£42/month):

- **Need just 15 premium subscribers** to cover all running costs
- That's roughly **60 total users** at a 25% conversion rate
- Achievable very early in the product lifecycle

---

## Launch Strategy Recommendation

1. **Build on free tiers** — Vercel Hobby + Supabase Free + Gemini free + ping tool = ~£1/month outlay
2. **Founding member pricing** — first 50–100 subscribers at £19.99/year locked in. Builds loyalty, gets real users fast, funds the first year of Pro infrastructure
3. **14-day Pro trial** — let every free user experience AI inputs and accounting links once. These are the conversion moments
4. **Upgrade Vercel to Pro** when first payment comes in (commercial ToS)
5. **Upgrade Supabase to Pro** around 200–300 users or whenever you want guaranteed uptime without the ping workaround

---

## Competitive Summary

| | Rate App | Crew Dock (Free) | Crew Dock Pro |
|---|---|---|---|
| Price | £4.99/mo or £49.99/yr | Free | £3.49/mo or £29.99/yr |
| Jobs/Projects | 2 free, unlimited paid | Unlimited | Unlimited |
| Bookkeeping | QuickBooks only | — | QuickBooks, Xero, FreeAgent + |
| AI input | No | No | Yes |
| Invoice direct | No | No | Yes |
| Data retention | Unknown | 6 months | 3 years |
| Platform | iOS + Android | Web | Web |

*Crew Dock Pro is 30% cheaper monthly and 40% cheaper annually than Rate, with a materially stronger feature set.*

---

*Summary compiled March 2026*
