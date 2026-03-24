# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development commands
- Install dependencies: `npm install`
- Start local dev server: `npm run dev`
- Build production bundle: `npm run build`
- Lint codebase: `npm run lint`
- Preview production build locally: `npm run preview`

## Tests
- There is currently no test script configured in `package.json`.
- Running `npm test` or `npm run test` will fail unless test tooling is added.
- There is also no command for running a single test yet.

## Environment and runtime
- This is a Vite + React + TypeScript app.
- Required env vars are documented in `.env.example`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_GEMINI_API_KEY`
- Path alias `@` resolves to `src` (configured in `vite.config.ts`).

## Big-picture architecture
- App entry is `src/main.tsx`, which renders `src/App.tsx`.
- `src/App.tsx` sets up route-level auth gating:
  - Public route: `/login`
  - Protected app shell: `AppLayout` wrapping dashboard/calculator/projects/AI/history/invoices/settings pages.
- Auth/session state is centralized in `src/contexts/AuthContext.tsx` and backed by Supabase Auth (`src/lib/supabase.ts`).

## Domain model and calculation flow
- Crew role definitions and overtime metadata live in `src/data/apa-rates.ts`.
- Core pay logic is centralized in `src/data/calculation-engine.ts` via `calculateCrewCost(input)`.
- UI pages should pass structured inputs to `calculateCrewCost` and render the returned `CalculationResult`; avoid duplicating pay rules in page components.
- `calculateCrewCost` handles:
  - day-type branching (basic/continuous/prep/recce/travel/rest/etc.)
  - weekday/weekend/bank-holiday behavior
  - overtime and post-midnight split logic
  - break penalties, TOC penalties, travel pay, mileage, equipment discounts

## Data persistence boundaries
- Supabase client is a thin singleton in `src/lib/supabase.ts`; query logic is mostly page-level.
- Operational data model used by the current UI is project-centric:
  - `projects`
  - `project_days`
  - `favourite_roles`
  - plus settings/customization tables referenced by pages (`user_settings`, `custom_roles`, `equipment_packages`).
- `supabase-dashboard-schema.sql` reflects this newer project/day model.
- `supabase-schema.sql` defines an older `calculations` table + retention function; treat it as legacy unless intentionally reviving that path.

## Stripe Integration Plan

### Pricing
- Monthly: £3.45/month
- Yearly: £29.95/year
- Both plans include a 14-day free trial
- Users who leave a great review receive a 14-day trial extension

### Stripe Setup (Dashboard)
- Two Products: `CrewDock Monthly` and `CrewDock Yearly`, currency GBP
- 14-day free trial enabled on both prices

### Database (Supabase)
Add a `subscriptions` table:
- `user_id`, `stripe_customer_id`, `stripe_subscription_id`
- `status`, `plan`, `trial_end`, `current_period_end`

### Supabase Edge Functions
| Function | Purpose |
|---|---|
| `create-checkout-session` | Creates Stripe Checkout with trial, redirects user |
| `stripe-webhook` | Handles subscription lifecycle events from Stripe |
| `extend-trial` | Adds 14 days to trial when review is verified |

### Webhook Events to Handle
- `customer.subscription.created` → write to Supabase
- `customer.subscription.updated` → update status/period
- `customer.subscription.deleted` → mark as cancelled
- `invoice.payment_failed` → flag for dunning/UI warning

### Review Extension Flow
- Admin manually triggers or a review platform webhook calls `extend-trial`
- Function calls `stripe.subscriptions.update()` with new `trial_end` (+14 days)

### Frontend
- Pricing page with two plan cards linking to Stripe Checkout
- Access gating in `AuthContext` / `App.tsx` via `subscriptions` table
- Trial banner showing days remaining
- Customer Portal link in Settings page

### Environment Variables
- `VITE_STRIPE_PUBLISHABLE_KEY` (client-safe)
- `STRIPE_SECRET_KEY` (server-side only)
- `STRIPE_WEBHOOK_SECRET` (server-side only)

### Build Order
1. Stripe products/prices in Dashboard
2. Supabase `subscriptions` table + RLS policies
3. `create-checkout-session` edge function
4. Webhook handler + subscription sync
5. Frontend gating in `AuthContext`
6. Trial banner UI
7. `extend-trial` function + review flow
8. Customer Portal link in Settings

---

## Page responsibilities (high level)
- `DashboardPage`: project overview, monthly/yearly aggregates, favourites, quick project creation.
- `CalculatorPage`: primary editing surface; computes results and persists/upserts `project_days`; supports project calendar/day switching and sessionStorage restore.
- `AIInputPage`: parses natural-language timesheets through `src/lib/gemini.ts`, then runs the same `calculateCrewCost` pipeline.
- `ProjectsPage`: browse projects and inspect day-level breakdowns.
- `HistoryPage`: flat history view over saved `project_days` with expandable totals.
- `InvoicePage`: project-scoped day selection and printable invoice composition.
- `SettingsPage`: user profile/company/bank settings + CRUD for custom roles and equipment packages.
