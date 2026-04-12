# Multi-Engine Calculator Architecture — Design Spec

**Date:** 2026-04-13
**Status:** Approved for implementation planning

---

## Overview

CrewDock currently runs a single calculator engine hardcoded to UK APA T&Cs. This refactor introduces a shared engine abstraction layer that supports multiple independent calculator engines — different countries, different T&Cs, different deal memos — behind a clean TypeScript interface.

**First two engines:**
1. `apa-uk` — existing APA UK engine, migrated into the new structure
2. `sdym-be` — new Belgian Sodyum Deal Memo 2026 engine

**Design intent:** Multi-engine support is a utility, not a marketing feature. The UI is subtle. UK users (all current users) see no change to their experience unless they explicitly go looking.

---

## Delivery Strategy

Two milestones, executed in order:

**Milestone 1 — Data layer (no UI changes)**
- Engine abstraction types and registry
- APA UK migration into new folder structure
- Belgian SDYM engine (fully working calculation logic)
- Database schema changes
- Geo-detection at signup

**Milestone 2 — UI layer**
- Engine Context and hooks
- All page updates (Settings, Projects, Calculator, Invoice, Dashboard, History, Share)
- Admin panel engine access management

Zero regression on APA UK is the hard gate between milestones. Milestone 1 must be fully verified before any UI work begins.

---

## Milestone 1: Data Layer

### Phase 1 — Engine Abstraction Interface

Two new files only. Nothing imports them yet. Zero app behaviour change.

**`src/engines/types.ts`** — the contract every engine must implement:

```typescript
export interface EngineMeta {
  id: string;               // 'apa-uk', 'sdym-be'
  name: string;             // 'UK APA T&Cs (2025)'
  shortName: string;        // 'APA UK'
  country: string;          // ISO 3166-1 alpha-2: 'GB', 'BE'
  currency: string;         // ISO 4217: 'GBP', 'EUR'
  currencySymbol: string;   // '£', '€'
  mileageUnit: 'miles' | 'km';
  domain?: string;          // landing page domain e.g. 'crewdock.be'
}

export interface EngineRole {
  role: string;
  department: string;
  minRate: number | null;
  maxRate: number | null;
  engineData: Record<string, unknown>; // APA: otGrade/otCoefficient/customOtRate. Belgian: fixed rates.
  specialRules?: string;
  isCustom?: boolean;
  customId?: string;
  isBuyout?: boolean;
}

export interface EngineDayType {
  value: string;
  label: string;
  defaultWrapHours?: number;
}

export interface EngineLineItem {
  description: string;
  hours: number;
  rate: number;
  total: number;
  timeFrom?: string;
  timeTo?: string;
  isDayRate?: boolean;
}

export interface EngineResult {
  lineItems: EngineLineItem[];
  subtotal: number;
  travelPay: number;
  mileage: number;
  mileageDistance: number;      // miles or km — unit declared in engine.meta.mileageUnit
  penalties: EngineLineItem[];
  equipmentValue: number;
  equipmentDiscount: number;
  equipmentTotal: number;
  grandTotal: number;
  dayDescription: string;
  extra?: Record<string, unknown>;
}

export interface EngineCalculationInput {
  role: EngineRole;
  agreedDailyRate: number;       // Belgian: ignored (fixed rates), APA: user-entered
  dayType: string;
  dayOfWeek: string;
  callTime: string;              // HH:MM
  wrapTime: string;              // HH:MM
  firstBreakGiven: boolean;
  firstBreakTime?: string;
  firstBreakDurationMins: number;
  secondBreakGiven: boolean;
  secondBreakTime?: string;
  secondBreakDurationMins: number;
  continuousFirstBreakGiven: boolean;
  continuousAdditionalBreakGiven: boolean;
  travelHours: number;
  mileageDistance: number;       // miles or km — never mix units
  previousWrapTime?: string;
  equipmentValue?: number;
  equipmentDiscount?: number;
  extra?: Record<string, unknown>; // Belgian: { hasEquipment: boolean, kmRate: number }
}

export interface CalculatorEngine {
  meta: EngineMeta;
  roles: EngineRole[];
  departments: string[];
  dayTypes: EngineDayType[];
  getRolesByDepartment(department: string): EngineRole[];
  getRole(roleName: string): EngineRole | undefined;
  calculate(input: EngineCalculationInput): EngineResult;
}
```

**`src/engines/index.ts`** — the engine registry:

```typescript
const engines = new Map<string, CalculatorEngine>();

export function registerEngine(engine: CalculatorEngine): void
export function getEngine(id: string): CalculatorEngine       // throws if not found
export function getAllEngines(): CalculatorEngine[]
export function getEngineIds(): string[]
export const DEFAULT_ENGINE_ID = 'apa-uk'

// Country → engine mapping. Add one line per new country engine.
const countryEngineMap: Record<string, string> = {
  'BE': 'sdym-be',
}

export function getEngineForCountry(country: string): string {
  return countryEngineMap[country] ?? DEFAULT_ENGINE_ID
}
```

Engines self-register via side-effect imports in `src/main.tsx`:
```typescript
import './engines/apa-uk'   // registers APA UK
import './engines/sdym-be'  // registers Belgian SDYM
```

Adding a future engine = create `src/engines/{id}/` folder + one import line in `main.tsx` + one line in `countryEngineMap` if country-specific. That's it.

---

### Phase 2 — APA UK Migration

Move existing APA code into `src/engines/apa-uk/`. **Zero calculation logic changes.**

**Folder structure:**
```
src/engines/apa-uk/
  meta.ts         — EngineMeta (id: 'apa-uk', GBP, miles, domain: undefined)
  rates.ts        — verbatim copy of src/data/apa-rates.ts + EngineRole[] wrapper
  calculator.ts   — verbatim copy of src/data/calculation-engine.ts + thin wrapper
  day-types.ts    — APA day types as EngineDayType[]
  index.ts        — assembles CalculatorEngine, calls registerEngine()
```

**The wrapper pattern (calculator.ts):**

`calculateCrewCost` is copied verbatim — not a single line changed. A wrapper function translates between the generic interface and APA's internal types:

```typescript
export function calculateEngineWrapper(input: EngineCalculationInput): EngineResult {
  // map EngineCalculationInput → CalculationInput
  // call calculateCrewCost(apaInput)
  // map CalculationResult → EngineResult (rename mileageMiles → mileageDistance)
}
```

**Re-export shims (zero breakage across all 7 importing pages):**

```typescript
// src/data/apa-rates.ts — becomes:
export * from '../engines/apa-uk/rates'

// src/data/calculation-engine.ts — becomes:
export * from '../engines/apa-uk/calculator'
```

Every existing import in `CalculatorPage`, `ProjectsPage`, `DashboardPage`, `AIInputPage`, `SharePage`, `SettingsPage`, `LoginPage` continues to resolve unchanged.

**Verification gate:** `npm run build` must pass. Manual spot-check in running app:
- Gaffer, Basic Working Day, Mon, call 08:00, wrap 21:00, rate £568 → identical line items to today
- One continuous day, one rest day, one travel day
- Break penalty test

**Do not proceed to Phase 3 until this is confirmed.**

---

### Phase 3 — Belgian SDYM Engine

**`src/engines/sdym-be/`** — same folder structure as `apa-uk`.

**meta.ts:**
```typescript
export const meta: EngineMeta = {
  id: 'sdym-be',
  name: 'Belgian Deal Memo (Sodyum 2026)',
  shortName: 'SDYM-BE',
  country: 'BE',
  currency: 'EUR',
  currencySymbol: '€',
  mileageUnit: 'km',
  domain: 'crewdock.be',
}
```

**Roles (rates.ts) — Gaffer and Lighting Assistant only for V1:**

| Role | Day Rate | Hourly Base | OT Rate | Night Surcharge |
|------|----------|-------------|---------|-----------------|
| Gaffer | €594 | €54/hr | €108/hr | +€54/hr |
| Lighting Assistant | €539 | €49/hr | €98/hr | +€49/hr |

All rates stored in `engineData`. `minRate` and `maxRate` are both `null` — rates are fixed and non-negotiable.

**Day types (day-types.ts):**

| Value | Label | Notes |
|-------|-------|-------|
| `standard` | Standard Day | 10h work + 1h meal |
| `journee_continue` | Journée Continue | OT from 10th hour |
| `saturday` | Saturday / 6th Consecutive Day | Flat rate |
| `sunday_ph` | Sunday / Public Holiday | Flat rate |
| `recce` | Recce / Preparation Day | Gaffer only |
| `travel` | Travel Day | Flat rate |

**Calculation rules (calculator.ts):**

*Standard day:*
- Day rate covers 10 working hours + 1h meal break
- OT from 11th working hour at fixed absolute rate (€108 / €98) — NOT BHR × coefficient
- Night surcharge stacks additively for any working hours between 22:00–06:00

*Journée Continue:*
- User selects this day type explicitly — no auto-detection in V1
- OT from 10th working hour instead of 11th

*Saturday / Sunday / Public Holiday:*
- Flat pre-calculated day rate regardless of hours worked
- Saturday: €891 (Gaffer), €808.50 (LA)
- Sunday/PH: €1,188 (Gaffer), €1,078 (LA)

*Recce:*
- Flat fee: €500 (Gaffer only)
- Engine throws a descriptive error if Lighting Assistant is assigned Recce day type

*Travel:*
- Flat fee: €450 (Gaffer), €410 (LA)

*Night surcharge:*
- For every working hour (or fraction) between 22:00–06:00: add base hourly rate on top
- Stacking: OT during night hours = OT rate + night surcharge (e.g. Gaffer: €108 + €54 = €162/hr)
- Calculated from actual call/wrap times automatically

*Kilometres:*
- Distance and rate passed via `extra.kmRate` and `mileageDistance`
- `extra.hasEquipment` sets the default rate (€0.43 or €0.80) but user can override `kmRate`
- Calculation: `kmRate × mileageDistance`

*Agreed daily rate:*
- Ignored entirely — rate is pulled from role's `engineData.dayRate`

**Verification tests:**
1. Gaffer, standard, Mon, 08:00–20:00 → €594 + 1h OT (€108) = **€702**
2. Gaffer, standard, Mon, 08:00–19:00 → **€594** flat
3. Gaffer, Saturday, 08:00–19:00 → **€891** flat
4. Gaffer, Sunday, 08:00–19:00 → **€1,188** flat
5. Gaffer, standard, 18:00–01:00 → day rate + 3h night surcharge (22:00–01:00 = 3 × €54 = **€162 extra**)
6. LA, standard, Mon, 08:00–20:00 → €539 + 1h OT (€98) = **€637**
7. Mileage 50km, no equipment → **€21.50**. With equipment default → **€40.00**
8. LA assigned Recce → **descriptive error**

---

### Phase 4 — Database Schema

All columns have safe defaults. No backfill needed on existing data.

```sql
-- profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_engine        text     NOT NULL DEFAULT 'apa-uk',
  ADD COLUMN IF NOT EXISTS signup_country        text,
  ADD COLUMN IF NOT EXISTS multi_engine_enabled  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS authorized_engines    text[]   NOT NULL DEFAULT ARRAY['apa-uk'];

-- projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS calc_engine text NOT NULL DEFAULT 'apa-uk';

-- calculations
ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS calc_engine text NOT NULL DEFAULT 'apa-uk';
```

**`multi_engine_enabled`:** set to `true` automatically for non-UK signups (via geo-detection), manually overrideable by admin. Drives `showEngineSelector` in the UI.

**`authorized_engines`:** array of engine IDs the user can access. Default is `['apa-uk']`. Admin can grant additional engines. For `milo.cosemans@gmail.com`, this is always `['apa-uk', 'sdym-be']` (and all future engines).

**Migration file:** `supabase/migrations/20260413_add_calc_engine_columns.sql`

---

### Phase 5 — Signup Country Detection

Called once, immediately after signup success. Non-blocking — failure falls back gracefully.

**Priority order:**
1. `?ref=crewdock.be` query param in URL → country `'BE'`
2. `document.referrer` contains `crewdock.be` → country `'BE'`
3. `ipapi.co/country/` fetch → returns ISO country code
4. Fallback → `'GB'`

Domain-based detection (steps 1–2) is driven by the engine registry — each engine's `meta.domain` field is what we match against. Adding a new country domain means adding it to the new engine's meta only.

**On detection:**
```typescript
const country = await detectSignupCountry()
const engineId = getEngineForCountry(country)

await supabase.from('profiles').update({
  signup_country: country,
  default_engine: engineId,
  multi_engine_enabled: country !== 'GB',
  authorized_engines: country !== 'GB'
    ? ['apa-uk', engineId]
    : ['apa-uk'],
})
```

**Failure handling:** If the ipapi.co call fails, `signup_country` stays `null`, `multi_engine_enabled` stays `false`, engine stays `apa-uk`. The failure is invisible to the user. A subtle note in Settings: *"Not seeing the right T&Cs? You can change your calculator engine below."* — always visible, no detection state required.

**`showEngineSelector` derivation:**
```typescript
const showEngineSelector = profile.multi_engine_enabled
```

Never derived from `signup_country` directly — this allows admin override and the share-based soft onboarding flow to work correctly.

---

## Milestone 2: UI Layer

### Phase 6 — Engine Context & Hooks

**`src/contexts/EngineContext.tsx`**

Wraps the app inside `AuthProvider`:

```tsx
<AuthProvider>
  <EngineProvider>
    <SubscriptionProvider>
      {/* app */}
    </SubscriptionProvider>
  </EngineProvider>
</AuthProvider>
```

Exposes:
```typescript
{
  activeEngine: CalculatorEngine        // resolved engine, always set
  defaultEngineId: string               // from profile
  showEngineSelector: boolean           // from profile.multi_engine_enabled
  authorizedEngines: CalculatorEngine[] // engines this user can access
  setJobEngine(id: string | null): void // called by Calculator on job load/unload
  setDefaultEngine(id: string): void    // called by Settings, updates Supabase + state
}
```

**Active engine resolution:**
```
jobEngineOverride → profile.default_engine → 'apa-uk'
```

**`src/hooks/useEngine.ts`** — convenience wrapper:
```typescript
const { activeEngine, showEngineSelector, authorizedEngines } = useEngine()
```

---

### Phase 7 — UI Changes

#### 7a. Settings page ("My Rates")

Rename "Custom Roles" section to **"My Rates"**.

Add engine selector as subtle subtext within "My Rates":
- One line: *"Calculator engine: APA UK (£)"* with a small edit affordance
- Clicking opens a modal popup:

> **Change Calculator Engine**
> [Dropdown: APA UK (£) / Belgian Deal Memo (€)]
>
> ⚠ This will affect all future jobs. Existing jobs keep their current T&Cs.
> You can also change the engine on individual jobs from the job settings.
>
> [Cancel] [Save]

Only rendered when `showEngineSelector === true`.

**Custom roles (within "My Rates"):**
- Visible when `activeEngine.meta.id === 'apa-uk'`
- Greyed out with note when engine is not APA UK: *"Custom roles are only available with the APA UK engine."*

**Already-created jobs when engine changes:**
- Existing jobs are never automatically updated — they keep their stored `calc_engine`
- Any job card whose `calc_engine` differs from `profile.default_engine` shows a subtle engine badge (see 7b)
- User can update individual jobs via the per-job selector

#### 7b. Projects page — per-job engine selector

**Job creation/edit dialog:**
- "T&Cs" dropdown only shown when `showEngineSelector === true`
- Pre-filled with user's `default_engine`
- On save, writes to `projects.calc_engine`

**Engine badge on job cards:**
- Shown when `job.calc_engine === 'sdym-be'` AND `showEngineSelector === true` (i.e. user has multi-engine access)
- UK users with multi-engine disabled never see badges
- Badge label: "SDYM-BE"

**Engine switch warning popup:**
Triggered when switching engine on a per-job basis:
> **Switching to Belgian Deal Memo**
> - Rates are fixed — no agreed daily rate input
> - Custom roles not available
> - Some APA-specific fields are hidden
>
> Your other jobs are not affected.
>
> [Cancel] [Switch]

#### 7c. Calculator page

Replace all direct APA imports with `useEngine()`. Changes:

- `engine.roles` replaces `APA_CREW_ROLES`
- `engine.departments` replaces `DEPARTMENTS`
- `engine.dayTypes` replaces hardcoded day types array
- `engine.meta.currencySymbol` replaces all hardcoded `£`
- `engine.meta.mileageUnit` replaces hardcoded "miles"
- `engine.calculate(input)` replaces `calculateCrewCost(input)`
- `setJobEngine(job.calc_engine)` called on job load; `setJobEngine(null)` on navigate away

**APA-only elements** (hidden when `engine.meta.id !== 'apa-uk'`):
- Break penalty inputs
- OT grade display
- Time off the clock field
- Call type badge (early/late/night)
- M25 mileage toggle

**Belgian-only elements** (hidden when `engine.meta.id !== 'sdym-be'`):
- "Transporting equipment?" toggle
- km distance field
- Rate per km field (editable, pre-filled with €0.43 or €0.80 based on equipment toggle)

**Agreed daily rate field:** removed entirely for Belgian — rate is auto-pulled from `role.engineData.dayRate`.

#### 7d. AIInputPage and LoginPage

Both import from APA files via the re-export shims and continue to work unchanged after Phase 2. In Phase 7:

- `AIInputPage` uses `APA_CREW_ROLES` and `calculateCrewCost` for AI-assisted input. This remains APA-only for V1 — AI input is a UK-facing feature. No changes needed.
- `LoginPage` imports `DEPARTMENTS` for a department selector during onboarding. This stays APA-only for V1. Belgian users are onboarded with a fixed role set so the department selector is less relevant. No changes needed.

Both pages are flagged for revisiting when a third engine is added.

#### 7e. Invoice page

Replace hardcoded `£` with `engine.meta.currencySymbol`. Engine read from `job.calc_engine` field when rendering.

#### 7e. Dashboard, History, Projects history panels

All hardcoded `£` symbols replaced. Currency symbol derived per row from stored `calc_engine`:

```typescript
getEngine(row.calc_engine).meta.currencySymbol
```

**Multi-currency display logic:**
- All jobs in one currency → show single total as normal (current behaviour preserved)
- Mix of currencies detected → show both totals side by side:
  ```
  This month: £4,200 · €1,800
  ```
- No live conversion — financial figures should never be silently converted

#### 7f. Share page

The shared calculation is rendered using the engine stored on the calculation row (`calc_engine`). Currency, roles, line item descriptions, and APA/Belgian-specific fields all derive from the correct engine.

**Sharing scenarios and user-facing messages:**

| Scenario | Message |
|----------|---------|
| APA UK job → UK user | Normal, no message |
| SDYM-BE job → Belgian user | Normal, no message |
| SDYM-BE job → UK user (multi-engine disabled) | Warning: "This job uses Belgian Deal Memo T&Cs (€). Enable the Belgian engine to recalculate." + [Enable Belgian Engine] [View anyway] [Report issue] |
| Engine on job not in registry | "This job uses a calculator engine that is no longer available. Saved figures shown below." + [Report issue] |
| Share link accessed unauthenticated | Read-only view, correct currency/engine, no import option |
| Share link broken / job deleted | "This link is no longer available. The job may have been deleted." + [Go to CrewDock] |

**"Enable Belgian Engine" flow (soft onboarding):**
When a UK user clicks this button:
```typescript
const updated = Array.from(new Set([...profile.authorized_engines, 'sdym-be']))
await supabase.from('profiles').update({
  multi_engine_enabled: true,
  authorized_engines: updated,
})
```
`showEngineSelector` flips to `true`. Engine selector becomes available in Settings. The user is now in the multi-engine system without ever going through the signup country detection flow.

**Error reporting:**
All error scenarios fire a tagged Sentry event:
```typescript
Sentry.captureEvent({
  message: 'Job share engine issue',
  level: 'warning',
  tags: {
    feature: 'job-sharing',
    scenario: 'engine_not_found' | 'engine_mismatch',
    job_engine: engineId,
  },
  extra: { jobId, viewerEngineAccess }
})
```
Filter in Sentry by `feature: job-sharing` to see all share-related engine issues.

The "Report issue" button in the UI triggers this Sentry event plus displays a confirmation: *"Thanks — this has been flagged and we'll look into it."*

---

### Phase 8 — Admin Panel Engine Access

Extends the existing `AdminPage.tsx`.

**New "Engine Access" section:**

User list table with columns: Name, Email, Signup Country, Multi-engine, Authorized Engines.

Per user:
- Toggle: enable/disable `multi_engine_enabled`
- Multi-select dropdown for `authorized_engines`:
  - "Select all engines" option at top
  - Individual engine checkboxes: `☑ APA UK (£)` `☑ Belgian SDYM (€)`
  - Minimum one engine always required
  - Populated dynamically from `getAllEngines()` — new engines appear automatically

**Admin account protection:**
- `milo.cosemans@gmail.com` always has `multi_engine_enabled = true` and all engines authorized
- Admin panel prevents removing your own engine access

---

### Phase 9 — Wire Signup Detection into AuthContext

Phase 5 defined the detection logic and DB schema. This phase wires it into the live auth flow.

In `src/contexts/AuthContext.tsx`, on successful signup (not login):
1. Call `detectSignupCountry()` — checks `?ref=` param, `document.referrer`, then `ipapi.co`
2. Update `profiles` row with `signup_country`, `default_engine`, `multi_engine_enabled`, `authorized_engines`
3. EngineContext picks up the new profile values on its next read — no page reload needed

Detection is fire-and-forget wrapped in try/catch. Any failure leaves the profile at defaults (`apa-uk`, `multi_engine_enabled: false`) — safe for all current UK users.

---

## File Structure (final state)

```
src/
  engines/
    types.ts                    ← shared CalculatorEngine interface
    index.ts                    ← registry + country→engine map
    apa-uk/
      index.ts                  ← registerEngine()
      meta.ts
      rates.ts
      calculator.ts
      day-types.ts
    sdym-be/
      index.ts                  ← registerEngine()
      meta.ts
      rates.ts
      calculator.ts
      day-types.ts
  contexts/
    EngineContext.tsx            ← NEW
  hooks/
    useEngine.ts                ← NEW
  data/
    apa-rates.ts                ← re-export shim → engines/apa-uk/rates
    calculation-engine.ts       ← re-export shim → engines/apa-uk/calculator
  pages/
    CalculatorPage.tsx          ← engine-aware
    ProjectsPage.tsx            ← per-job T&Cs selector, engine badge
    SettingsPage.tsx            ← "My Rates" rename, engine selector
    InvoicePage.tsx             ← currency-aware
    DashboardPage.tsx           ← currency-aware, multi-currency display
    HistoryPage.tsx             ← currency-aware
    SharePage.tsx               ← engine-aware, share scenarios
    AdminPage.tsx               ← engine access management
supabase/
  migrations/
    20260413_add_calc_engine_columns.sql
```

---

## Critical Constraints

1. **Zero regression on APA UK.** Phase 2 must be verified before Phase 3 begins. Identical byte-for-byte results.
2. **`npm run build` must pass after every phase.**
3. **Never hardcode `£` after refactoring.** Always `engine.meta.currencySymbol`.
4. **Belgian engine is real, not a stub.** All verification tests must pass.
5. **Multi-engine UI is subtle.** No splash screens, no feature announcements. A small dropdown and a badge.
6. **Never silently convert currencies.** Show both if mixed.
7. **Every error state has a visible message.** Nothing should ever show blank.
8. **`milo.cosemans@gmail.com` always has full engine access.** Protected in admin panel.
