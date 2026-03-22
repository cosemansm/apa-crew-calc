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

## Page responsibilities (high level)
- `DashboardPage`: project overview, monthly/yearly aggregates, favourites, quick project creation.
- `CalculatorPage`: primary editing surface; computes results and persists/upserts `project_days`; supports project calendar/day switching and sessionStorage restore.
- `AIInputPage`: parses natural-language timesheets through `src/lib/gemini.ts`, then runs the same `calculateCrewCost` pipeline.
- `ProjectsPage`: browse projects and inspect day-level breakdowns.
- `HistoryPage`: flat history view over saved `project_days` with expandable totals.
- `InvoicePage`: project-scoped day selection and printable invoice composition.
- `SettingsPage`: user profile/company/bank settings + CRUD for custom roles and equipment packages.
