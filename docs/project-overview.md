# Crew Dock — Project Overview

> For AI agents and collaborators onboarding to this project.

---

## What Is Crew Dock?

Crew Dock is a **SaaS web app for UK film & TV crew** that automates day-rate calculations based on the APA (Advertising Producers Association) Recommended Terms for Crew 2025. It replaces manual spreadsheet calculations with a structured calculator, invoice generator, and job tracker.

**Live app:** https://crewdock.app (Vercel, auto-deploys from `main`)
**Repo:** https://github.com/cosemansm/apa-crew-calc

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui (Radix UI primitives) |
| Routing | React Router v6 |
| Backend/DB | Supabase (PostgreSQL + Auth + RLS) |
| Serverless | Vercel Functions (Node.js, `/api/` directory) |
| Email | Resend API (`/api/send-invoice.ts`) |
| PDF | jsPDF + html2canvas |
| Icons | lucide-react |
| Deployment | Vercel (auto-deploy on push to `main`) |

---

## App Structure

```
src/
  pages/
    DashboardPage.tsx       — Overview, recent jobs, calendar
    CalculatorPage.tsx      — Main APA rate calculator (core feature)
    ProjectsPage.tsx        — Job list + detail panel + status management
    InvoicePage.tsx         — Invoice builder, PDF download, email send
    AIInputPage.tsx         — Natural language → day entry (PREMIUM)
    HistoryPage.tsx         — Calculation history
    SettingsPage.tsx        — Profile, preferences, danger zone
  components/
    AppLayout.tsx           — Sidebar nav (desktop) + mobile header
    ui/                     — shadcn/ui components
  contexts/
    AuthContext.tsx          — Supabase auth session
  data/
    calculation-engine.ts   — APA rate calculation logic
    apa-rates.ts            — Role list, departments, rates

api/
  send-invoice.ts           — Resend email with PDF attachment
  delete-account.ts         — Wipe all user data + Supabase auth user

supabase/migrations/        — SQL migration files
docs/                       — Planning documents (you are here)
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `projects` | Jobs (name, client, status, created_at) |
| `project_days` | Individual shoot/travel/prep days per job |
| `project_expenses` | Job-level expenses (DB only, UI simplified) |
| `user_settings` | Per-user preferences (rates, VAT, address, etc.) |
| `favourite_roles` | Saved favourite crew roles |
| `custom_roles` | User-defined custom roles |
| `equipment_packages` | Saved equipment kit packages |
| `calculation_history` | Log of all calculations run |

---

## Job Statuses

Statuses auto-update where possible:

| Status | Meaning | Auto-trigger |
|--------|---------|-------------|
| `ongoing` | Active job | Default on create |
| `finished` | All shoot days are in the past | Auto on page load |
| `invoiced` | Invoice email sent | Auto on successful send |
| `paid` | Payment received | Manual only |

---

## APA Calculation Rules (key points)

- **Basic Hourly Rate (BHR)** = agreed day rate ÷ 8
- **Overtime grades:** Grade I (×1.5 BHR), Grade II (×1.25 BHR after 10h)
- **Break thresholds:** >5.5h after call = £10 delayed break penalty; >6.5h = Continuous Working Day
- **Travel days:** Minimum 5 hours at BHR, any day, not applicable to PM/PA/Runners
- **Rest gap (TOC):** <11h between wrap and next call = 1h OT penalty added automatically
- **Bank holidays:** ×2.5 day rate
- **Rest days:** ×1.5 day rate

Full APA T&Cs: https://www.a-p-a.net/apa-crew-terms/

---

## Planned Features

- **Stripe subscriptions** — 14-day free trial, then premium tier. See `docs/subscription.md`.
- **Bookkeeping integrations** — Xero, QuickBooks (premium feature)
- **Landing page** — Marketing site (separate project / being built in parallel)

---

## Premium vs Free (Planned)

| Feature | Free | Premium |
|---------|------|---------|
| Calculator | ✓ | ✓ |
| Job tracking | ✓ | ✓ |
| Invoicing | ✓ | ✓ |
| Dashboard | ✓ | ✓ |
| AI Input | ✗ | ✓ |
| Bookkeeping integrations | ✗ | ✓ |

---

## Brand

- **App name:** Crew Dock
- **Primary colour:** `#FFD528` (yellow)
- **Dark UI colour:** `#1F1F21`
- **Font:** System sans-serif + monospace for labels/numbers
- **Logo:** Anchor icon in yellow rounded square
