# AGENTS.md — Crew Dock

> For Claude Code (terminal) and AI agents working in this repo.
> Last updated: 10 April 2026

---

## Dev Commands

```bash
npm install          # install deps
npm run dev          # local dev server (Vite, port 5173)
npm run build        # production build
npm run lint         # ESLint
npm run preview      # preview production build locally
```

No test suite configured — `npm test` will fail.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui (Radix UI) |
| Routing | React Router v6 |
| Backend/DB | Supabase (PostgreSQL + Auth + RLS) |
| Serverless | Vercel Functions (`/api/` directory, Node.js) |
| Email | Resend API |
| PDF | jsPDF + html2canvas |
| Icons | lucide-react |
| AI | Google Gemini 2.5 Flash (`src/lib/gemini.ts`) |
| Deploy | Vercel — auto-deploys from `main` |

**Live:** https://crewdock.app
**Repo:** https://github.com/cosemansm/apa-crew-calc

---

## Environment Variables

**Frontend (Vite `import.meta.env`):**

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GEMINI_API_KEY
VITE_STRIPE_PRICE_MONTHLY   # Stripe Price IDs for Checkout (Settings billing UI)
VITE_STRIPE_PRICE_YEARLY
```

**Serverless (`api/*` — set in Vercel):**

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY   # Stripe routes + webhook + keep-alive
APP_URL                     # Checkout/portal return URLs (default https://app.crewdock.app)
```

`VITE_SUPABASE_URL` is also read by some API routes if `SUPABASE_URL` is unset.

Path alias `@` → `src` (configured in `vite.config.ts`).

---

## App Structure

```
src/
  pages/
    DashboardPage.tsx      — Overview, earnings aggregates, recent jobs, quick project create
    CalculatorPage.tsx     — APA rate calculator (CORE FEATURE — most complex file)
    ProjectsPage.tsx       — Job list + per-day breakdown panel + status management
    HistoryPage.tsx        — Flat history view (file exists; /history route redirects to /projects)
    InvoicePage.tsx        — Invoice builder, PDF download, email send (Simple + Detailed modes) — route: /invoices
    AIInputPage.tsx        — Natural language → day entry via Gemini (PREMIUM FEATURE)
    SettingsPage.tsx       — Profile, company, bank, custom roles, equipment packages
    SupportPage.tsx        — Support contact form (calls /api/send-support)
    LoginPage.tsx          — Supabase auth
  components/
    AppLayout.tsx          — Sidebar nav (desktop) + mobile header
    ui/                    — shadcn/ui components
  contexts/
    AuthContext.tsx        — Supabase auth session (global)
    SubscriptionContext.tsx — Reads `subscriptions` row; `useSubscription()` → isPremium, trial UI state
  data/
    calculation-engine.ts  — APA pay logic: calculateCrewCost(input) → CalculationResult
    apa-rates.ts           — CrewRole definitions, rates, OT grades, specialRules
  lib/
    supabase.ts            — Thin Supabase client singleton
    gemini.ts              — Gemini API client for AI Input

api/                       — Vercel serverless functions
  stripe/[action].ts       — POST `/api/stripe/create-checkout` | `create-portal` | `extend-trial` (dynamic segment = action)
  stripe/webhook.ts        — Stripe webhooks → sync `subscriptions` in Supabase
  email/[action].ts        — e.g. send-invoice (Resend)
  keep-alive.ts            — Cron ping to keep Supabase active (`vercel.json` → `/api/keep-alive`)
  send-support.ts          — Support email (⚠ currently returning Load failed — route issue)
  parse-timesheet.ts       — AI Input endpoint (Gemini call server-side)
  delete-account.ts        — Hard-delete all user data + Supabase auth user

supabase/migrations/       — SQL migration files
docs/                      — Planning docs (subscription.md, build plans, business summary)
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `projects` | Jobs (name, client, status, created_at) |
| `project_days` | Shoot/prep/travel days per job — includes `result_json`, `expenses_amount`, `expenses_notes` |
| `user_settings` | Per-user preferences (rates, VAT, address, bank details) |
| `favourite_roles` | Saved favourite crew roles |
| `custom_roles` | User-defined custom roles (synced with `apa-rates.ts` at runtime) |
| `equipment_packages` | Saved kit packages with line items |
| `subscriptions` | Per-user billing: Stripe IDs, `status`, `trial_ends_at`, trial pop-up flags — row created on signup (DB trigger) |
| `calculation_history` | Legacy table — not actively used by current UI |

> `supabase-dashboard-schema.sql` = current schema. `supabase-schema.sql` = legacy.

---

## Routing & Auth

- Public: `/login`
- Protected (wrapped in `AppLayout`): `/dashboard`, `/calculator`, `/projects`, `/ai-input`, `/invoices`, `/support`, `/settings`
- `/history` → redirects to `/projects` (HistoryPage.tsx exists but is not a live route)
- Catch-all `*` → redirects to `/dashboard`
- Auth gating in `src/App.tsx` via `AuthContext`

---

## Core Domain: APA Calculation Engine

### Files
- **`src/data/apa-rates.ts`** — `CrewRole[]` with `role`, `department`, `minRate`, `maxRate`, `otGrade` (`I|II|III|N/A`), `otCoefficient`, `specialRules?`, `isBuyout?`, `isCustom?`
- **`src/data/calculation-engine.ts`** — `calculateCrewCost(input: CalculationInput): CalculationResult`

### APA T&Cs 2025 — Key Rules (Effective 1 Sept 2025)

**BHR:** `agreedDailyRate / 10` (not /8 — basic working day is 10hrs)

**Day Types (`DayType`):**
| dayType | Normal day | OT starts | Notes |
|---------|-----------|-----------|-------|
| `basic_working` | 10+1hr lunch | After 11hrs (adj. if break curtailed) | Shooting days |
| `continuous_working` | 8hrs no break | After 8hrs | Continuous/fast-turnaround |
| `prep` / `recce` / `build_strike` | 8hrs at BHR | After 8hrs (no break) or 9hrs (break given) | Non-shooting days |
| `pre_light` | 8hrs + 1hr lunch | After 9hrs (fixed) | Pre-light day; £7.50 meal allowance if break not given |
| `travel` | Min 5hrs at BHR | — | Not for PM/PA/Runner |
| `rest` | Flat fee = BDR | — | No OT. Paid at agreed daily rate regardless of day |

**Day of Week (`DayOfWeek`)** — separate dimension, affects rate multipliers:
- Weekday: base rates apply
- `saturday`: ×1.5 BHR/BDR on NSD/continuous/basic hours; OT at ×1.5
- `sunday` / `bank_holiday`: ×2 BHR/BDR on NSD/continuous/basic hours; OT at ×2

**OT Grades:**
- Grade I: BHR × 1.5 — most technicians
- Grade II: BHR × 1.25 — senior technicians
- Grade III: BHR × 1.0 — DoP, Art Director, SFX Supervisor, etc. (senior roles — OT = BHR rate)
- N/A: Director, Producer, PM, PA, Runner (no OT calculation)

**Special Rules (`specialRules` field on CrewRole):**
- `pm_pa_runner` — Flat daily rate only; no OT, no travel pay
- `session_fees` — Casting Director; separate session fee structure
- `basic_working_nsd` — **DoP, Art Director, Location Manager** — APA S.2.3: always treated as Basic Working Day rules even on non-shooting days. Engine overrides `dayType` to `basic_working` at start of `calculateCrewCost` for these roles.

**Pre-light day (S.2.3):** If meal break not provided (`!firstBreakGiven`), £7.50 meal allowance penalty applies.

**Call Types (`CallType`)** — derived from call time on basic/continuous days only:
- `standard`: 07:00–10:59
- `early`: 05:00–06:59 (early call OT applies before 07:00)
- `late`: 11:00–16:59
- `night`: 17:00–04:59 (≥17:00 or <05:00) — 2×BDR for full day

**Penalties / Bonuses auto-calculated:**
- First break delayed (given 5.5–6.5hrs after call): £10 penalty
- First break missed or given >6.5hrs after call: day converts to `continuous_working`
- First break curtailed (<60 mins): BHR per curtailed minute; OT start adjusted
- Second break missed/late (after long days): 0.5hr at BHR
- Continuous day: 30-min break missed after 9hrs → 0.5hr at BHR; additional missed after 12.5hrs → 0.5hr at BHR
- TOC (rest gap <11h between wrap and next call): 1hr OT penalty
- Post-midnight OT: ×3 BHR for all OT hours after midnight until wrap (S.4.4) — **does NOT apply on night shoots** (S.2.1.5 explicitly: "the rate stays the same throughout") — engine correctly excludes `callType === 'night'`
- Pre-light no meal: £7.50

**Breaks UI:** `firstBreakGiven` checkbox shown for ALL day types including prep/recce/build_strike/pre_light (added Mar 2026 — was previously only shown for basic/continuous working days).

**Buyout roles** (`isBuyout: true`): flat daily rate, no OT/BHR breakdown.

---

## CalculatorPage — Key Behaviours

- Auto-saves via debounced useEffect (1.5s after result changes) → upserts `project_days`
- SessionStorage restore: calculator state survives page refresh
- `wrapManualRef` tracks whether user manually set wrap time (prevents auto-override)
- `handleAddNewDay(date)` carries role/rate/project to a fresh form for the next day
- **"+ Add New Day" button** appears at BOTH top and bottom of the form when `projectId && currentDayId`
- BHR/OT Grade shown as `(i)` info popover next to "Day Rate" label (not below input)
- `TimePicker` component has `labelAddon?: React.ReactNode` slot — used to place info popovers in label row without affecting the input grid
- Grid for time pickers: `grid-cols-[1fr_auto_1fr]` (3 columns — fixed mobile overflow)
- Collapsible sections: Travel & Mileage, Equipment, Expenses
- Travel & Mileage section header has Car icon; Equipment has Package icon; Expenses has Receipt icon

---

## InvoicePage — Key Behaviours

- Supabase SELECT includes: `result_json, expenses_amount, expenses_notes`
- `DayResultJson` interface mirrors `CalculationResult` shape for stored JSON
- **Simple / Detailed toggle** — Detailed mode shows per-day line items, penalties, travel, equipment, expenses as sub-rows
- Penalty sub-rows use standard grey `#6B6B6B` (not amber)
- Invoice sent via `/api/send-invoice.ts` → Resend API; sets project status to `invoiced`

---

## Subscription Model (implemented)

Full product/business spec: `docs/subscription.md` (may still say “planned” in its header — implementation matches that doc).

**Behaviour:** New users get a `subscriptions` row via trigger on `auth.users` (`supabase/migrations/20260401_add_subscriptions.sql`) with `status = 'trialing'` and `trial_ends_at` = ~14 days. Stripe is used when they subscribe; webhooks update Supabase. **Access in the app** is driven by `SubscriptionProvider` (`src/App.tsx`) and `useSubscription()` in `src/contexts/SubscriptionContext.tsx`.

**`isPremium` is true when:** `status` is `active` or `lifetime`, **or** `status` is `trialing` and `trial_ends_at` is still in the future. Otherwise the user is on the free tier for gating (even if the row still says `trialing` after expiry until something else updates it).

| DB `status` | Typical access |
|-------------|----------------|
| `trialing` (and trial not expired) | Full Pro access |
| `active` | Full Pro access |
| `lifetime` | Full Pro access (no Stripe subscription) |
| `trialing` (trial expired) / effective free | Core only — job cap, AI Input locked, etc. |
| `past_due` / `canceled` / `unpaid` | Not premium unless trial window still valid |

**Pricing (product):** £3.45/mo · £29.95/yr · founding annual £19.99/yr (see `docs/subscription.md`).

**Gated behind Pro (enforced in UI):** AI Input (`ProLockOverlay`), email send from Invoice page, bookkeeping connect CTAs in Settings, share job / job limits (e.g. 10 jobs on free), dashboard/bookkeeping prompts — see usages of `useSubscription()` / `isPremium` in `src/`.

**`useSubscription()` returns:** `{ subscription, isPremium, isTrialing, trialDaysLeft, trialExtended, loading, error, refresh }`.

**Stripe API (Vercel):**
- `POST /api/stripe/create-checkout` — Checkout session (or portal if already active with customer)
- `POST /api/stripe/create-portal` — Customer Portal
- `POST /api/stripe/extend-trial` — One-time trial extension (server validates `trial_extended`)
- `POST /api/stripe/webhook` — `customer.subscription.*`, `invoice.payment_failed` → patches `subscriptions`

**Trial / upgrade UX:** `TrialBanner`, `ReviewPopupController`, and Settings billing section work with the same context.

---

## Known Issues / Pending Work

| Issue | Status |
|-------|--------|
| `/api/send-support` returning "Load failed" | Unresolved — route may be misconfigured in Vercel |
| FreeAgent SVG logo in integrations assets | Not properly implemented |
| Bookkeeping integrations (Xero, QuickBooks, FreeAgent) | Partial — OAuth/export paths exist; product polish and depth per `docs/Build plans/BUILD_PLAN_*.md` |
| Help & Guides screenshots | Discussed — not implemented |
| Supabase keep-alive | Implemented — `vercel.json` cron → `GET /api/keep-alive` (every 6 days) |
| £7.50 meal allowance on basic/continuous shooting days | S.6.2 shows this applies on all shoot days when meal not provided — engine currently only applies it for pre-light. UI would need a "meal provided?" toggle for shoot days. |
| OT grade not dynamic | T&Cs S.4 defines grades by BDR range (I: ≤£444, II: £445–£676, III: ≥£677). Engine uses hardcoded grades from Appendix 1 per role. Roles with rates crossing a threshold (e.g. Art Director min £655 < £677 Grade III boundary) won't auto-adjust grade. |

---

## Brand

- **App name:** Crew Dock
- **Primary colour:** `#FFD528` (yellow)
- **Dark UI colour:** `#1F1F21`
- **Logo:** Anchor icon in yellow rounded square
- **Font:** System sans-serif; monospace for numbers/labels

---

## Conventions

- All pay rules live in `calculation-engine.ts` — never duplicate in page components
- shadcn/ui components in `src/components/ui/` — prefer these over raw HTML
- Tailwind for all styling — no CSS modules or inline styles except in jsPDF output
- Vercel auto-deploys on push to `main` — always commit + push after edits
- No test suite — manually verify in browser after changes
