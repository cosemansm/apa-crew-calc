# Multi-Engine Calculator Architecture — Implementation Plan

> For Claude Code. Execute phases in order. Each phase should be a separate commit.
> Read AGENTS.md first for stack/env context.

---

## Context

CrewDock currently has a single hard-coded APA UK calculator engine. We are refactoring to support **multiple calculator engines** for different countries / T&Cs (starting with UK APA + Belgian Deal Memo). The two systems are structurally different — different OT models, different day types, different rate structures — so they must be fully independent engine implementations behind a shared interface.

**Reference files:**
- `src/data/apa-rates.ts` — current UK APA roles & rates
- `src/data/calculation-engine.ts` — current UK APA calculation logic
- `src/pages/CalculatorPage.tsx` — calculator UI (currently APA-only)
- `src/pages/ProjectsPage.tsx` — jobs page (needs per-job engine selector)
- `src/pages/SettingsPage.tsx` — settings (needs global default engine)
- `docs/Sodyum Deal Memo 2026.pdf` — Belgian T&C reference (uploaded copy)
- `docs/multi-engine-architecture.html` — visual architecture diagram

**Two levels of engine selection:**
1. **Global default** — set at signup based on detected country, changeable in Settings
2. **Per-job override** — subtle dropdown when creating/editing a job, inherits global default

---

## Phase 1 — Engine Abstraction Interface

Create the shared TypeScript interface that all engines must implement.

### Create `src/engines/types.ts`

```typescript
/** Metadata describing a calculator engine */
export interface EngineMeta {
  id: string;                    // e.g. 'apa-uk', 'sdym-be'
  name: string;                  // e.g. 'UK APA T&Cs', 'Belgian Deal Memo'
  shortName: string;             // e.g. 'APA UK', 'Belgian'
  country: string;               // ISO 3166-1 alpha-2: 'GB', 'BE'
  currency: string;              // ISO 4217: 'GBP', 'EUR'
  currencySymbol: string;        // '£', '€'
  mileageUnit: 'miles' | 'km';
}

/** A crew role within an engine */
export interface EngineRole {
  role: string;
  department: string;
  minRate: number | null;
  maxRate: number | null;
  /** Engine-specific data blob (APA uses otGrade/otCoefficient, Belgian uses fixed OT rates) */
  engineData: Record<string, unknown>;
  specialRules?: string;
  /** True for user-created roles stored in Supabase */
  isCustom?: boolean;
  customId?: string;
  /** Flat all-in daily rate — no OT breakdown */
  isBuyout?: boolean;
}

/** A day type option for the calculator dropdown */
export interface EngineDayType {
  value: string;
  label: string;
  /** Default wrap hours from call (for auto-setting wrap time) */
  defaultWrapHours?: number;
}

/** A line item in the calculation result */
export interface EngineLineItem {
  description: string;
  hours: number;
  rate: number;
  total: number;
  timeFrom?: string;
  timeTo?: string;
  isDayRate?: boolean;
}

/** Result returned by the engine's calculate function */
export interface EngineResult {
  lineItems: EngineLineItem[];
  subtotal: number;
  travelPay: number;
  mileage: number;
  mileageDistance: number;         // miles or km depending on engine
  penalties: EngineLineItem[];
  equipmentValue: number;
  equipmentDiscount: number;
  equipmentTotal: number;
  grandTotal: number;
  dayDescription: string;
  /** Engine-specific extra data (e.g. callType for APA) */
  extra?: Record<string, unknown>;
}

/** Input to the engine's calculate function */
export interface EngineCalculationInput {
  role: EngineRole;
  agreedDailyRate: number;
  dayType: string;
  dayOfWeek: string;
  callTime: string;               // HH:MM
  wrapTime: string;               // HH:MM
  // Break inputs
  firstBreakGiven: boolean;
  firstBreakTime?: string;
  firstBreakDurationMins: number;
  secondBreakGiven: boolean;
  secondBreakTime?: string;
  secondBreakDurationMins: number;
  continuousFirstBreakGiven: boolean;
  continuousAdditionalBreakGiven: boolean;
  travelHours: number;
  mileageDistance: number;         // miles or km depending on engine
  previousWrapTime?: string;
  equipmentValue?: number;
  equipmentDiscount?: number;
  /** Engine-specific extra inputs */
  extra?: Record<string, unknown>;
}

/** The full calculator engine contract */
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

### Create `src/engines/index.ts`

```typescript
import type { CalculatorEngine } from './types';

const engines = new Map<string, CalculatorEngine>();

export function registerEngine(engine: CalculatorEngine): void {
  engines.set(engine.meta.id, engine);
}

export function getEngine(id: string): CalculatorEngine {
  const engine = engines.get(id);
  if (!engine) throw new Error(`Calculator engine "${id}" not found`);
  return engine;
}

export function getAllEngines(): CalculatorEngine[] {
  return Array.from(engines.values());
}

export function getEngineIds(): string[] {
  return Array.from(engines.keys());
}

/** Default engine ID for new signups when country cannot be detected */
export const DEFAULT_ENGINE_ID = 'apa-uk';
```

**Do not modify any existing files in this phase.** Just create the new files.

---

## Phase 2 — Migrate APA UK Engine

Move the existing APA code into `src/engines/apa-uk/` and make it implement the `CalculatorEngine` interface. **This phase must produce zero behaviour changes.** The old files become thin re-export wrappers so nothing else breaks.

### 2a. Create `src/engines/apa-uk/meta.ts`

```typescript
import type { EngineMeta } from '../types';

export const meta: EngineMeta = {
  id: 'apa-uk',
  name: 'UK APA T&Cs (2025)',
  shortName: 'APA UK',
  country: 'GB',
  currency: 'GBP',
  currencySymbol: '£',
  mileageUnit: 'miles',
};
```

### 2b. Create `src/engines/apa-uk/rates.ts`

- **Copy** the full contents of `src/data/apa-rates.ts` into this new file.
- Keep all existing types (`OTGrade`, `CrewRole`) and the full `APA_CREW_ROLES` array.
- Also export an `EngineRole[]`-compatible wrapper that maps `CrewRole` fields into the `EngineRole` shape, storing APA-specific fields (`otGrade`, `otCoefficient`, `customOtRate`, `customBhr`) inside `engineData`.

### 2c. Create `src/engines/apa-uk/calculator.ts`

- **Copy** the full contents of `src/data/calculation-engine.ts` into this new file.
- Keep all existing types and the `calculateCrewCost` function unchanged.
- Also export a wrapper function that accepts `EngineCalculationInput` and returns `EngineResult`, internally converting to/from the existing APA types.

### 2d. Create `src/engines/apa-uk/day-types.ts`

Export the APA day types as `EngineDayType[]`:

```typescript
import type { EngineDayType } from '../types';

export const dayTypes: EngineDayType[] = [
  { value: 'basic_working', label: 'Basic Working Day (Shoot Day)', defaultWrapHours: 11 },
  { value: 'continuous_working', label: 'Continuous Working Day', defaultWrapHours: 9 },
  { value: 'prep', label: 'Prep Day', defaultWrapHours: 8 },
  { value: 'recce', label: 'Recce Day', defaultWrapHours: 8 },
  { value: 'build_strike', label: 'Build / Strike Day', defaultWrapHours: 8 },
  { value: 'pre_light', label: 'Pre-light Day', defaultWrapHours: 9 },
  { value: 'rest', label: 'Rest Day' },
  { value: 'travel', label: 'Travel Day', defaultWrapHours: 5 },
];
```

### 2e. Create `src/engines/apa-uk/index.ts`

Wire it all together and register the engine:

```typescript
import type { CalculatorEngine } from '../types';
import { registerEngine } from '../index';
import { meta } from './meta';
import { engineRoles, getRolesByDepartment, getRole, departments } from './rates';
import { dayTypes } from './day-types';
import { calculateEngineWrapper } from './calculator';

export const apaUkEngine: CalculatorEngine = {
  meta,
  roles: engineRoles,
  departments,
  dayTypes,
  getRolesByDepartment,
  getRole,
  calculate: calculateEngineWrapper,
};

registerEngine(apaUkEngine);
```

### 2f. Turn old files into re-export shims

Update `src/data/apa-rates.ts` and `src/data/calculation-engine.ts` to simply re-export everything from the new location. This ensures **zero breakage** across the app — every existing import continues to work.

```typescript
// src/data/apa-rates.ts
export { OTGrade, CrewRole, APA_CREW_ROLES, DEPARTMENTS, getRolesByDepartment, getRole } from '../engines/apa-uk/rates';
```

```typescript
// src/data/calculation-engine.ts
export { DayType, DayOfWeek, CallType, CalculationInput, CalculationLineItem, CalculationResult, calculateCrewCost } from '../engines/apa-uk/calculator';
```

### 2g. Ensure engine is registered on app boot

In `src/main.tsx`, add a side-effect import near the top:

```typescript
import './engines/apa-uk';  // register APA UK engine
```

### Verification

- `npm run build` must pass with zero errors.
- `npm run lint` must pass.
- The app must behave identically to before — no UI changes, no calculation changes.

---

## Phase 3 — Belgian SDYM Engine (Skeleton)

Create the Belgian engine based on the Sodyum Deal Memo 2026. This is a real, working engine — not a stub.

### Belgian Deal Memo summary (from `docs/Sodyum Deal Memo 2026.pdf`):

**Roles (initial scope — Gaffer & Lighting Assistant only):**

| Function | Hourly Base Rate | Day Rate (10h + 1h meal) |
|----------|-----------------|-------------------------|
| Gaffer | €54.00 | €594.00 |
| Lighting Assistant | €49.00 | €539.00 |

**Premiums & Surcharges:**

| Description | Gaffer | Lighting Assistant |
|-------------|--------|--------------------|
| Overtime (from 11th hour — 200%) | €108.00/hr | €98.00/hr |
| Night hours (22:00–06:00) additive | +€54.00/hr | +€49.00/hr |
| Journée continue (continuous workday) | €54.00/hr | €49.00/hr |
| Saturday / 6th consecutive day (150%) | €891.00 | €808.50 |
| Sunday / Public Holiday (200%) | €1,188.00 | €1,078.00 |
| Recce / Preparation day | €500.00 | — |
| Travel day | €450.00 | €410.00 |
| Mileage (own transport) | €0.43/km | €0.43/km |
| Mileage (with equipment) | €0.80/km | €0.80/km |

**Key rules:**
- Standard day = 10 working hours + 1 hour meal break
- OT from 11th working hour at 200% of base hourly rate (absolute, not relative to agreed rate)
- **Journée continue** applies if: no hot meal provided, meal break < 60 min, or lunch > 6h after start. In that case, OT from 10th working hour.
- Night surcharge (22:00–06:00) **stacks** on top of base or OT — it's additive, not a multiplier.
- Working time = truck/van base to base (including loading/unloading).
- Mileage has two tiers: standard vs. with equipment.
- Cancellation fees: ≤24h = 100%, 24–48h = 50%.

### Create the following files:

- `src/engines/sdym-be/meta.ts` — id: `'sdym-be'`, currency EUR, mileageUnit km
- `src/engines/sdym-be/rates.ts` — Gaffer and Lighting Assistant roles with fixed rates stored in `engineData` (hourly rate, OT rate, night surcharge, Saturday/Sunday day rates, recce rate, travel rate)
- `src/engines/sdym-be/day-types.ts` — Standard Day, Journée Continue, Saturday/6th Day, Sunday/Public Holiday, Recce/Preparation, Travel Day
- `src/engines/sdym-be/calculator.ts` — implement `calculate()` following the rules above:
  - Standard day: 10h base at day rate. OT from 11th hour at 200%.
  - Journée continue: OT from 10th hour.
  - Night surcharge: +hourly rate for any hours between 22:00–06:00 (stacking).
  - Saturday: flat day rate at 150%.
  - Sunday/PH: flat day rate at 200%.
  - Recce: flat fee (€500 for Gaffer, not available for LA).
  - Travel: flat fee (€450 / €410).
  - Mileage: two tiers — use `extra.hasEquipment` boolean to decide €0.43 vs €0.80.
- `src/engines/sdym-be/index.ts` — wire together and `registerEngine()`

### Register on boot

In `src/main.tsx`:

```typescript
import './engines/apa-uk';  // register APA UK engine
import './engines/sdym-be';  // register Belgian SDYM engine
```

### Verification

- `npm run build` must pass.
- Import `getEngine('sdym-be')` in a test or the console and verify a sample calculation:
  - Gaffer, standard day (Mon), call 08:00, wrap 20:00 (12h total, 11h working + 1h break) → Day rate €594 + 1h OT at €108 = €702.

---

## Phase 4 — Database Schema Changes

### 4a. Supabase migration

Add the following columns (run via Supabase SQL editor or create a migration file in `supabase/migrations/`):

```sql
-- Add engine columns with default 'apa-uk' (backward-compatible)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_engine text NOT NULL DEFAULT 'apa-uk',
  ADD COLUMN IF NOT EXISTS signup_country text;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS calc_engine text NOT NULL DEFAULT 'apa-uk';

ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS calc_engine text NOT NULL DEFAULT 'apa-uk';
```

### 4b. Document the migration

Create `supabase/migrations/add_calc_engine_columns.sql` with the above SQL.

---

## Phase 5 — Engine Context & Hooks

Create a React context that provides the active engine to the component tree.

### Create `src/contexts/EngineContext.tsx`

```typescript
/**
 * Provides the user's default engine and a per-job engine override.
 *
 * Components call useEngine() to get the active CalculatorEngine.
 * The active engine is determined by:
 *   1. If a jobEngineId is set (per-job override) → use that
 *   2. Otherwise → use the user's profile default_engine
 *   3. Fallback → 'apa-uk'
 */
```

The context should:
- Read `default_engine` from the user's Supabase profile on auth change.
- Expose `activeEngine: CalculatorEngine` (resolved from job override or default).
- Expose `setJobEngine(id: string | null)` for per-job override.
- Expose `setDefaultEngine(id: string)` for Settings page to update the global default.
- Expose `defaultEngineId: string` for display in Settings.

### Create `src/hooks/useEngine.ts`

A convenience hook: `const { engine, meta, currencySymbol } = useEngine();`

### Wire into `App.tsx`

Wrap the app in `<EngineProvider>` alongside the existing `AuthProvider` and `SubscriptionProvider`.

---

## Phase 6 — UI Changes

### 6a. Settings page — Global default engine

In `src/pages/SettingsPage.tsx`, add a new section **above** the existing "Custom Roles" section:

- Label: "Calculator Engine"
- Description: "Default T&Cs for new jobs. You can override this per job."
- A `<Select>` dropdown listing all registered engines: `getAllEngines().map(e => ({ value: e.meta.id, label: `${e.meta.shortName} (${e.meta.currencySymbol})` }))`.
- On change, update the user's `profiles.default_engine` in Supabase and call `setDefaultEngine()` from EngineContext.
- Keep it simple, no flags or elaborate UI.

### 6b. Projects page — Per-job engine selector

In `src/pages/ProjectsPage.tsx`, when creating or editing a job:

- Add a small `<Select>` dropdown in the job creation/edit dialog.
- Label: "T&Cs" — that's it, keep it subtle.
- Pre-filled with the user's default engine.
- When saved, store the selected engine ID as `projects.calc_engine` in Supabase.
- Display the engine short name as a small badge on the job card (e.g., "APA UK" or "Belgian") — only if it differs from the user's default, so UK users doing UK work see nothing extra.

### 6c. Calculator page — Engine-aware

In `src/pages/CalculatorPage.tsx`:

**Important: this is the most complex change.** Currently the calculator directly imports from `apa-rates.ts` and `calculation-engine.ts`. It needs to become engine-aware.

Changes needed:

1. **Read the active engine from context.** When a job is selected, look up its `calc_engine` and call `setJobEngine(id)` on the EngineContext. When no job is selected, clear the override so the user's default applies.

2. **Replace direct APA imports.** Instead of:
   ```typescript
   import { APA_CREW_ROLES, DEPARTMENTS, getRolesByDepartment } from '@/data/apa-rates';
   import { calculateCrewCost, type DayType } from '@/data/calculation-engine';
   ```
   Use:
   ```typescript
   const { engine } = useEngine();
   // engine.roles, engine.departments, engine.getRolesByDepartment(), engine.calculate()
   ```

3. **Replace the hardcoded DAY_TYPES array.** Use `engine.dayTypes` instead.

4. **Replace the hardcoded DEFAULT_WRAP_HOURS.** Use `engine.dayTypes[x].defaultWrapHours`.

5. **Currency symbol.** Replace all hardcoded `£` with `engine.meta.currencySymbol`. This includes:
   - The rate input field placeholder and prefix
   - The breakdown panel amounts
   - The grand total display

6. **Mileage label.** Replace "miles" with `engine.meta.mileageUnit`.

7. **Belgian-specific UI additions** (show conditionally when engine is `sdym-be`):
   - A checkbox/toggle: "Transporting equipment?" — controls mileage tier (€0.43 vs €0.80/km). Pass as `extra.hasEquipment` in the calculation input.
   - The night surcharge is calculated automatically from call/wrap times (no UI toggle needed — the engine handles 22:00–06:00 detection).

8. **APA-specific UI elements** (show conditionally when engine is `apa-uk`):
   - Break penalty logic (6.5hr rule, break curtailment)
   - The OT Grade display
   - The "Time off the clock" field
   - The early/late/night call type badge

   These elements should only render when `engine.meta.id === 'apa-uk'`. For now, use simple conditionals. If we add more engines later, we can refactor to engine-provided UI component slots.

### 6d. Invoice page — Currency-aware

In `src/pages/InvoicePage.tsx`:

- Replace hardcoded `£` with the engine's currency symbol.
- The engine ID should be read from the job's `calc_engine` field when rendering an invoice.

### 6e. Bank holidays

- `src/lib/bankHolidays.ts` currently fetches UK bank holidays.
- Add a Belgian public holidays function (these are fixed-date unlike the UK's API-driven ones).
- The calculator page should use the correct holiday list based on the active engine's country.

---

## Phase 7 — Signup Country Detection

### 7a. Vercel geolocation

In the signup flow, detect the user's country. Vercel provides geolocation headers on all requests:

```
x-vercel-ip-country: BE
```

Alternatively, Cloudflare provides `CF-IPCountry`.

### 7b. Implementation

The cleanest approach: create a tiny Vercel API route (`api/geo.ts`) that returns the country code from the request headers:

```typescript
export default function handler(req, res) {
  const country = req.headers['x-vercel-ip-country'] || 'GB';
  res.json({ country });
}
```

On the signup success callback (in `AuthContext.tsx`), fetch `/api/geo` and:
- Set `profiles.signup_country` to the detected country code.
- Set `profiles.default_engine` to `'sdym-be'` if country is `'BE'`, otherwise `'apa-uk'`.

### 7c. crewdock.be redirect

Add a Vercel redirect in `vercel.json`:

```json
{
  "redirects": [
    { "source": "/(.*)", "destination": "https://crewdock.app/$1", "permanent": true }
  ]
}
```

This goes in the `crewdock.be` Vercel project (or as a domain-level redirect if configured via Vercel dashboard). **Not** in the main app's `vercel.json`.

Optionally, detect `document.referrer` containing `crewdock.be` during signup and use it as an additional signal for country detection.

---

## Phase 8 — Verification & Testing

Since there is no test suite, verify manually:

### APA UK regression (must be identical to current behaviour)

1. Gaffer, Basic Working Day, Mon, call 08:00, wrap 21:00, agreed rate £568 → verify line items match current calculator exactly.
2. Lighting Tech, Continuous Working Day, Sat, call 07:00, wrap 19:00, agreed rate £444 → verify Saturday continuous + OT.
3. 1st AD, Prep Day, Wed, call 09:00, wrap 18:00, agreed rate £785 → verify prep day 8hr base + OT.
4. Rest day, Travel day — spot check.
5. Break penalties — test 5.5hr and 6.5hr delay rules.

### Belgian SDYM

1. Gaffer, Standard Day, Mon, call 08:00, wrap 20:00 → €594 + 1h OT (€108) = €702.
2. Gaffer, Standard Day, Mon, call 08:00, wrap 19:00 → €594 flat, no OT.
3. Gaffer, Saturday, call 08:00, wrap 19:00 → €891 flat.
4. Gaffer, Sunday, call 08:00, wrap 19:00 → €1,188 flat.
5. Gaffer, night hours — call 18:00, wrap 01:00 → verify night surcharge stacks for 22:00–01:00 (3h × €54 = €162 extra).
6. Lighting Assistant, Standard Day — verify rates are €539/€98.
7. Mileage: 50km standard → €21.50. With equipment → €40.00.

### Cross-engine

1. Create a job with APA UK engine → calculator shows £, APA roles, APA day types.
2. Switch job to Belgian → calculator shows €, Belgian roles, Belgian day types.
3. Create a new job → inherits user's default engine.
4. Change default engine in Settings → new jobs use the new default, existing jobs unchanged.

---

## File Structure Summary (final state)

```
src/
  engines/
    types.ts                  ← shared CalculatorEngine interface
    index.ts                  ← engine registry (register, get, list)
    apa-uk/
      index.ts                ← wire + registerEngine()
      meta.ts                 ← EngineMeta for APA UK
      rates.ts                ← APA roles & rates (moved from data/)
      calculator.ts           ← APA calculation logic (moved from data/)
      day-types.ts            ← APA day type definitions
    sdym-be/
      index.ts                ← wire + registerEngine()
      meta.ts                 ← EngineMeta for Belgian SDYM
      rates.ts                ← Belgian roles & fixed rates
      calculator.ts           ← Belgian calculation logic
      day-types.ts            ← Belgian day type definitions
  contexts/
    EngineContext.tsx          ← NEW: engine provider + context
  hooks/
    useEngine.ts              ← NEW: convenience hook
  data/
    apa-rates.ts              ← becomes re-export shim → engines/apa-uk/rates
    calculation-engine.ts     ← becomes re-export shim → engines/apa-uk/calculator
  lib/
    bankHolidays.ts           ← extended: add Belgian public holidays
  pages/
    CalculatorPage.tsx         ← refactored: engine-aware
    ProjectsPage.tsx           ← modified: per-job engine selector
    SettingsPage.tsx            ← modified: global default engine
    InvoicePage.tsx             ← modified: currency-aware
api/
  geo.ts                       ← NEW: country detection endpoint
supabase/
  migrations/
    add_calc_engine_columns.sql ← NEW: schema migration
```

---

## Important Constraints

- **Zero regression on APA UK.** The current APA calculator must produce identical results after refactoring. Phase 2 must be verified before starting Phase 3.
- **Do not modify calculation logic in Phase 2.** Only move files and add wrapper functions. The actual `calculateCrewCost` function body must remain unchanged.
- **Keep the per-job engine selector subtle.** No splash, no marketing. It's a small dropdown in the job dialog, labelled "T&Cs". That's it.
- **Currency symbols must never be hardcoded after refactoring.** Always read from `engine.meta.currencySymbol`.
- **Belgian engine is real, not a stub.** It must calculate correctly per the deal memo. The Gaffer/LA rates and rules are all specified above.
- **Engine-specific UI should use simple conditionals for now** (`engine.meta.id === 'apa-uk'`). We can refactor to a component slot pattern later if we add a third engine.
- **`npm run build` must pass after every phase.** Check before committing.
