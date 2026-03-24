# AGENTS.md — Crew Dock

> For Claude Code (terminal) and AI agents working in this repo.
> Last updated: 25 March 2026

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

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GEMINI_API_KEY
```

Path alias `@` → `src` (configured in `vite.config.ts`).

---

## App Structure

```
src/
  pages/
    DashboardPage.tsx      — Overview, earnings aggregates, recent jobs, quick project create
    CalculatorPage.tsx     — APA rate calculator (CORE FEATURE — most complex file)
    ProjectsPage.tsx       — Job list + per-day breakdown panel + status management
    HistoryPage.tsx        — Flat history view of saved project_days
    InvoicePage.tsx        — Invoice builder, PDF download, email send (Simple + Detailed modes)
    AIInputPage.tsx        — Natural language → day entry via Gemini (PREMIUM FEATURE)
    SettingsPage.tsx       — Profile, company, bank, custom roles, equipment packages
    SupportPage.tsx        — Support contact form (calls /api/send-support)
    LoginPage.tsx          — Supabase auth
  components/
    AppLayout.tsx          — Sidebar nav (desktop) + mobile header
    ui/                    — shadcn/ui components
  contexts/
    AuthContext.tsx        — Supabase auth session (global)
  data/
    calculation-engine.ts  — APA pay logic: calculateCrewCost(input) → CalculationResult
    apa-rates.ts           — CrewRole definitions, rates, OT grades, specialRules
  lib/
    supabase.ts            — Thin Supabase client singleton
    gemini.ts              — Gemini API client for AI Input

api/                       — Vercel serverless functions
  send-invoice.ts          — Send invoice PDF via Resend email
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
| `calculation_history` | Legacy table — not actively used by current UI |

> `supabase-dashboard-schema.sql` = current schema. `supabase-schema.sql` = legacy.

---

## Routing & Auth

- Public: `/login`
- Protected (wrapped in `AppLayout`): `/`, `/calculator`, `/projects`, `/history`, `/invoice`, `/ai-input`, `/settings`, `/support`
- Auth gating in `src/App.tsx` via `AuthContext`

---

## Core Domain: APA Calculation Engine

### Files
- **`src/data/apa-rates.ts`** — `CrewRole[]` with `role`, `department`, `minRate`, `maxRate`, `otGrade` (`I|II|III|N/A`), `otCoefficient`, `specialRules?`, `isBuyout?`, `isCustom?`
- **`src/data/calculation-engine.ts`** — `calculateCrewCost(input: CalculationInput): CalculationResult`

### APA T&Cs 2025 — Key Rules (Effective 1 Sept 2025)

**BHR:** `agreedDailyRate / 10` (not /8 — basic working day is 10hrs)

**Day Types:**
| dayType | Normal day | OT starts | Notes |
|---------|-----------|-----------|-------|
| `basic_working` | 10+1hr lunch | After 11hrs | Shooting days |
| `continuous_working` | 8hrs no break | After 8hrs | Continuous/fast-turnaround |
| `prep` / `recce` / `build_strike` / `pre_light` | 8hrs (break optional) | After 8hrs (no break) or 9hrs (break given) | Non-shooting days |
| `travel` | Min 5hrs at BHR | — | Not for PM/PA/Runner |
| `rest_day` | — | — | ×1.5 day rate |
| `bank_holiday` | — | — | ×2.5 day rate |

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

**Penalties / Bonuses auto-calculated:**
- Delayed break (>5.5h without break): £10
- Continuous working upgrade (>6.5h without break on basic day): engine switches to continuous rules
- TOC (rest gap <11h between wrap and next call): 1hr OT penalty
- Post-midnight triple time (00:00–06:00): ×3 BHR (except on designated night shoots)
- Night differential (calls before 05:00 or after 22:00): higher BHR multiplier
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

## Subscription Model (PLANNED — not yet implemented)

Full spec: `docs/subscription.md`

| State | Access |
|-------|--------|
| `trialing` (14 days, no card) | Full access |
| `active` | Full access |
| `lifetime` | Full access (manually granted) |
| `free` | Core only (no AI Input, no bookkeeping) |
| `past_due` / `canceled` | Core only |

**Pricing:** £3.45/mo · £29.95/yr · Founding member £19.99/yr (first 50–100 users)

**Gated behind Pro:** AI Input, bookkeeping integrations (Xero/QuickBooks/FreeAgent), Invoice Direct (email send — TBD), 3yr data retention

**Frontend hook:** `useSubscription()` → `{ isPremium, isTrialing, trialDaysLeft, status }`

**Required Vercel API routes (to build):**
- `POST /api/stripe/create-checkout`
- `POST /api/stripe/create-portal`
- `POST /api/stripe/webhook`

**DB table to add:** `subscriptions` — see `docs/subscription.md` for full schema

---

## Known Issues / Pending Work

| Issue | Status |
|-------|--------|
| `/api/send-support` returning "Load failed" | Unresolved — route may be misconfigured in Vercel |
| FreeAgent SVG logo in integrations assets | Not properly implemented |
| Stripe subscription flow | Planned — not started |
| Bookkeeping integrations (Xero, QuickBooks, FreeAgent) | Planned — see `docs/BUILD_PLAN_*.md` |
| Help & Guides screenshots | Discussed — not implemented |
| Supabase keep-alive cron (`/api/ping`) | Planned — see `docs/subscription.md` |

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
