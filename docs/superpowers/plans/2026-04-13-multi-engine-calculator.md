# Multi-Engine Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a shared engine abstraction layer supporting multiple calculator engines (APA UK + Belgian SDYM 2026), migrating existing logic with zero regression and adding full UI integration.

**Architecture:** Engines self-register via a central registry (`src/engines/index.ts`). Each engine implements `CalculatorEngine` from `src/engines/types.ts`. Re-export shims keep all 7 existing imports intact during migration. `EngineContext` resolves the active engine from the user's Supabase profile. Milestone 1 (data layer, Tasks 1–7) must be fully verified before Milestone 2 (UI layer, Tasks 8–16) begins.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest, Supabase, Sentry, React Router v7

---

## Milestone 1: Data Layer

---

### Task 1: Vitest test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/engines/__tests__/smoke.test.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 2: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
```

- [ ] **Step 4: Write smoke test**

Create `src/engines/__tests__/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run and verify**

```bash
npm test
```
Expected: `1 passed`

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.ts src/engines/__tests__/smoke.test.ts
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 2: Engine abstraction types and registry

**Files:**
- Create: `src/engines/types.ts`
- Create: `src/engines/index.ts`
- Create: `src/engines/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `src/engines/__tests__/registry.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'

// We import after each reset to work around module-level Map state
// Instead, test the exported functions directly

describe('engine registry', () => {
  it('throws when getting an unregistered engine', async () => {
    const { getEngine } = await import('../index')
    expect(() => getEngine('nonexistent')).toThrow('Engine not found: nonexistent')
  })

  it('maps BE country to sdym-be', async () => {
    const { getEngineForCountry } = await import('../index')
    expect(getEngineForCountry('BE')).toBe('sdym-be')
  })

  it('falls back to apa-uk for unknown countries', async () => {
    const { getEngineForCountry } = await import('../index')
    expect(getEngineForCountry('US')).toBe('apa-uk')
    expect(getEngineForCountry('GB')).toBe('apa-uk')
    expect(getEngineForCountry('')).toBe('apa-uk')
  })

  it('DEFAULT_ENGINE_ID is apa-uk', async () => {
    const { DEFAULT_ENGINE_ID } = await import('../index')
    expect(DEFAULT_ENGINE_ID).toBe('apa-uk')
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test
```
Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 3: Create src/engines/types.ts**

```typescript
export interface EngineMeta {
  id: string;
  name: string;
  shortName: string;
  country: string;        // ISO 3166-1 alpha-2
  currency: string;       // ISO 4217
  currencySymbol: string;
  mileageUnit: 'miles' | 'km';
  domain?: string;
}

export interface EngineRole {
  role: string;
  department: string;
  minRate: number | null;
  maxRate: number | null;
  engineData: Record<string, unknown>;
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
  mileageDistance: number;
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
  agreedDailyRate: number;
  dayType: string;
  dayOfWeek: string;
  callTime: string;
  wrapTime: string;
  firstBreakGiven: boolean;
  firstBreakTime?: string;
  firstBreakDurationMins: number;
  secondBreakGiven: boolean;
  secondBreakTime?: string;
  secondBreakDurationMins: number;
  continuousFirstBreakGiven: boolean;
  continuousAdditionalBreakGiven: boolean;
  travelHours: number;
  mileageDistance: number;
  previousWrapTime?: string;
  equipmentValue?: number;
  equipmentDiscount?: number;
  extra?: Record<string, unknown>;
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

- [ ] **Step 4: Create src/engines/index.ts**

```typescript
import type { CalculatorEngine } from './types'

const engines = new Map<string, CalculatorEngine>()

export const DEFAULT_ENGINE_ID = 'apa-uk'

// Country → engine mapping. One line per country-specific engine.
const countryEngineMap: Record<string, string> = {
  'BE': 'sdym-be',
}

export function registerEngine(engine: CalculatorEngine): void {
  engines.set(engine.meta.id, engine)
}

export function getEngine(id: string): CalculatorEngine {
  const engine = engines.get(id)
  if (!engine) throw new Error(`Engine not found: ${id}`)
  return engine
}

export function getAllEngines(): CalculatorEngine[] {
  return Array.from(engines.values())
}

export function getEngineIds(): string[] {
  return Array.from(engines.keys())
}

export function getEngineForCountry(country: string): string {
  return countryEngineMap[country] ?? DEFAULT_ENGINE_ID
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test
```
Expected: 5 passed (smoke + registry tests)

- [ ] **Step 6: Commit**

```bash
git add src/engines/types.ts src/engines/index.ts src/engines/__tests__/registry.test.ts src/engines/__tests__/smoke.test.ts
git commit -m "feat: engine abstraction types and registry"
```

---

### Task 3: APA UK engine migration

**Files:**
- Create: `src/engines/apa-uk/meta.ts`
- Create: `src/engines/apa-uk/day-types.ts`
- Create: `src/engines/apa-uk/rates.ts` (copy of src/data/apa-rates.ts + adapter)
- Create: `src/engines/apa-uk/calculator.ts` (copy of src/data/calculation-engine.ts + wrapper)
- Create: `src/engines/apa-uk/index.ts`
- Create: `src/engines/__tests__/apa-uk-parity.test.ts`

- [ ] **Step 1: Write failing parity test**

Create `src/engines/__tests__/apa-uk-parity.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest'

describe('APA UK engine parity', () => {
  beforeAll(async () => {
    // Force engine registration by importing the engine
    await import('../apa-uk/index')
  })

  it('Gaffer basic working day produces correct output via engine wrapper', async () => {
    const { getEngine } = await import('../index')
    const { calculateCrewCost } = await import('../apa-uk/calculator')
    const { APA_CREW_ROLES } = await import('../apa-uk/rates')

    const gaffer = APA_CREW_ROLES.find(r => r.role === 'Gaffer')!
    const apaInput = {
      role: gaffer,
      agreedDailyRate: 568,
      dayType: 'basic_working' as const,
      dayOfWeek: 'monday' as const,
      callTime: '08:00',
      wrapTime: '21:00',
      firstBreakGiven: true,
      firstBreakTime: '13:00',
      firstBreakDurationMins: 60,
      secondBreakGiven: false,
      secondBreakTime: undefined,
      secondBreakDurationMins: 30,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageOutsideM25: 0,
      equipmentValue: 0,
      equipmentDiscount: 0,
    }
    const directResult = calculateCrewCost(apaInput)

    const engine = getEngine('apa-uk')
    const { crewRoleToEngineRole } = await import('../apa-uk/rates')
    const engineInput = {
      role: crewRoleToEngineRole(gaffer),
      agreedDailyRate: 568,
      dayType: 'basic_working',
      dayOfWeek: 'monday',
      callTime: '08:00',
      wrapTime: '21:00',
      firstBreakGiven: true,
      firstBreakTime: '13:00',
      firstBreakDurationMins: 60,
      secondBreakGiven: false,
      secondBreakDurationMins: 30,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageDistance: 0,
      equipmentValue: 0,
      equipmentDiscount: 0,
    }
    const wrappedResult = engine.calculate(engineInput)

    expect(wrappedResult.grandTotal).toBe(directResult.grandTotal)
    expect(wrappedResult.subtotal).toBe(directResult.subtotal)
    expect(wrappedResult.lineItems.length).toBe(directResult.lineItems.length)
    expect(wrappedResult.lineItems.map(i => i.total)).toEqual(directResult.lineItems.map(i => i.total))
    expect(wrappedResult.mileageDistance).toBe(directResult.mileageMiles)
    expect(wrappedResult.dayDescription).toBe(directResult.dayDescription)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

```bash
npm test src/engines/__tests__/apa-uk-parity.test.ts
```

- [ ] **Step 3: Create src/engines/apa-uk/meta.ts**

```typescript
import type { EngineMeta } from '../types'

export const meta: EngineMeta = {
  id: 'apa-uk',
  name: 'UK APA T&Cs (2025)',
  shortName: 'APA UK',
  country: 'GB',
  currency: 'GBP',
  currencySymbol: '£',
  mileageUnit: 'miles',
  domain: undefined,
}
```

- [ ] **Step 4: Create src/engines/apa-uk/day-types.ts**

```typescript
import type { EngineDayType } from '../types'

export const dayTypes: EngineDayType[] = [
  { value: 'basic_working',      label: 'Basic Working Day',      defaultWrapHours: 10 },
  { value: 'continuous_working', label: 'Continuous Working Day', defaultWrapHours: 10 },
  { value: 'prep',               label: 'Prep Day' },
  { value: 'recce',              label: 'Recce Day' },
  { value: 'build_strike',       label: 'Build / Strike Day' },
  { value: 'pre_light',          label: 'Pre-Light Day' },
  { value: 'rest',               label: 'Rest Day' },
  { value: 'travel',             label: 'Travel Day' },
]
```

- [ ] **Step 5: Create src/engines/apa-uk/rates.ts**

Copy the full contents of `src/data/apa-rates.ts` verbatim into `src/engines/apa-uk/rates.ts`, then append at the bottom:

```typescript
import type { EngineRole } from '../types'

export function crewRoleToEngineRole(r: CrewRole): EngineRole {
  return {
    role: r.role,
    department: r.department,
    minRate: r.minRate,
    maxRate: r.maxRate,
    engineData: {
      otGrade: r.otGrade,
      otCoefficient: r.otCoefficient,
      customOtRate: r.customOtRate,
      customBhr: r.customBhr,
    },
    specialRules: r.specialRules,
    isCustom: r.isCustom,
    customId: r.customId,
    isBuyout: r.isBuyout,
  }
}

export function engineRoleToCrewRole(r: EngineRole): CrewRole {
  const d = r.engineData as {
    otGrade?: OTGrade
    otCoefficient?: number
    customOtRate?: number
    customBhr?: number
  }
  return {
    role: r.role,
    department: r.department,
    minRate: r.minRate,
    maxRate: r.maxRate,
    otGrade: d.otGrade ?? 'N/A',
    otCoefficient: d.otCoefficient ?? 1,
    customOtRate: d.customOtRate,
    customBhr: d.customBhr,
    specialRules: r.specialRules,
    isCustom: r.isCustom,
    customId: r.customId,
    isBuyout: r.isBuyout,
  }
}

export const ENGINE_ROLES: EngineRole[] = APA_CREW_ROLES.map(crewRoleToEngineRole)
export const ENGINE_DEPARTMENTS: string[] = DEPARTMENTS
```

Note: the file starts with `import type { EngineRole } from '../types'` at the top. Move this import to the top of the file (before the `OTGrade` type export).

- [ ] **Step 6: Create src/engines/apa-uk/calculator.ts**

Copy the full contents of `src/data/calculation-engine.ts` verbatim into `src/engines/apa-uk/calculator.ts`.

Change the import at line 1 from:
```typescript
import type { CrewRole } from './apa-rates';
```
to:
```typescript
import type { CrewRole } from './rates';
```

Then append at the bottom of the file:

```typescript
import type { EngineCalculationInput, EngineResult } from '../types'
import { engineRoleToCrewRole } from './rates'

export function calculateEngineWrapper(input: EngineCalculationInput): EngineResult {
  const apaInput: CalculationInput = {
    role: engineRoleToCrewRole(input.role),
    agreedDailyRate: input.agreedDailyRate,
    dayType: input.dayType as DayType,
    dayOfWeek: input.dayOfWeek as DayOfWeek,
    callTime: input.callTime,
    wrapTime: input.wrapTime,
    firstBreakGiven: input.firstBreakGiven,
    firstBreakTime: input.firstBreakTime,
    firstBreakDurationMins: input.firstBreakDurationMins,
    secondBreakGiven: input.secondBreakGiven,
    secondBreakTime: input.secondBreakTime,
    secondBreakDurationMins: input.secondBreakDurationMins,
    continuousFirstBreakGiven: input.continuousFirstBreakGiven,
    continuousAdditionalBreakGiven: input.continuousAdditionalBreakGiven,
    travelHours: input.travelHours,
    mileageOutsideM25: input.mileageDistance,
    previousWrapTime: input.previousWrapTime,
    equipmentValue: input.equipmentValue,
    equipmentDiscount: input.equipmentDiscount,
  }

  const result = calculateCrewCost(apaInput)

  return {
    lineItems: result.lineItems,
    subtotal: result.subtotal,
    travelPay: result.travelPay,
    mileage: result.mileage,
    mileageDistance: result.mileageMiles,
    penalties: result.penalties,
    equipmentValue: result.equipmentValue,
    equipmentDiscount: result.equipmentDiscount,
    equipmentTotal: result.equipmentTotal,
    grandTotal: result.grandTotal,
    dayDescription: result.dayDescription,
    extra: { callType: result.callType },
  }
}
```

- [ ] **Step 7: Create src/engines/apa-uk/index.ts**

```typescript
import { registerEngine } from '../index'
import type { CalculatorEngine } from '../types'
import { meta } from './meta'
import { dayTypes } from './day-types'
import { ENGINE_ROLES, ENGINE_DEPARTMENTS, getRolesByDepartment as apaGetRolesByDepartment, getRole as apaGetRole, crewRoleToEngineRole } from './rates'
import { calculateEngineWrapper } from './calculator'

const engine: CalculatorEngine = {
  meta,
  roles: ENGINE_ROLES,
  departments: ENGINE_DEPARTMENTS,
  dayTypes,
  getRolesByDepartment(department: string) {
    return apaGetRolesByDepartment(department).map(crewRoleToEngineRole)
  },
  getRole(roleName: string) {
    const r = apaGetRole(roleName)
    return r ? crewRoleToEngineRole(r) : undefined
  },
  calculate: calculateEngineWrapper,
}

registerEngine(engine)

export { engine as apaUkEngine }
```

- [ ] **Step 8: Run parity test — expect pass**

```bash
npm test
```
Expected: all tests pass including parity test

- [ ] **Step 9: Commit**

```bash
git add src/engines/apa-uk/ src/engines/__tests__/apa-uk-parity.test.ts
git commit -m "feat: migrate APA UK into engine abstraction layer"
```

---

### Task 4: Re-export shims + self-registration wiring

**Files:**
- Modify: `src/data/apa-rates.ts` (replace with re-export shim)
- Modify: `src/data/calculation-engine.ts` (replace with re-export shim)
- Modify: `src/main.tsx` (add engine side-effect imports)

- [ ] **Step 1: Replace src/data/apa-rates.ts with re-export shim**

Overwrite the entire file with:
```typescript
export * from '../engines/apa-uk/rates'
```

- [ ] **Step 2: Replace src/data/calculation-engine.ts with re-export shim**

Overwrite the entire file with:
```typescript
export * from '../engines/apa-uk/calculator'
```

- [ ] **Step 3: Add engine imports to src/main.tsx**

Open `src/main.tsx`. Add these two lines near the top, after other imports and before the `createRoot` call:
```typescript
import './engines/apa-uk'   // registers APA UK engine
import './engines/sdym-be'  // registers Belgian SDYM engine (stub import — engine not built yet)
```

Do NOT add the `sdym-be` import yet — leave only the `apa-uk` import for now. The `sdym-be` import will be added in Task 5.

- [ ] **Step 4: Run build — must pass**

```bash
npm run build
```
Expected: no errors. All 7 pages that import from `src/data/apa-rates.ts` and `src/data/calculation-engine.ts` continue to resolve correctly through the shims.

- [ ] **Step 5: Run tests — must all pass**

```bash
npm test
```
Expected: all pass

- [ ] **Step 6: Manual spot-check**

```bash
npm run dev
```
Open the calculator. Test: Gaffer, Basic Working Day, Monday, call 08:00, wrap 21:00, agreed rate £568. Verify line items are identical to before this refactor. Check one continuous day and one travel day.

- [ ] **Step 7: Commit**

```bash
git add src/data/apa-rates.ts src/data/calculation-engine.ts src/main.tsx
git commit -m "feat: add APA UK re-export shims and engine self-registration"
```

---

### Task 5: Belgian SDYM engine

**Files:**
- Create: `src/engines/sdym-be/meta.ts`
- Create: `src/engines/sdym-be/day-types.ts`
- Create: `src/engines/sdym-be/rates.ts`
- Create: `src/engines/sdym-be/calculator.ts`
- Create: `src/engines/sdym-be/index.ts`
- Create: `src/engines/__tests__/sdym-be.test.ts`

- [ ] **Step 1: Write all 8 failing verification tests**

Create `src/engines/__tests__/sdym-be.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import type { EngineCalculationInput } from '../types'

describe('Belgian SDYM engine', () => {
  beforeAll(async () => {
    await import('../sdym-be/index')
  })

  async function calc(overrides: Partial<EngineCalculationInput>) {
    const { getEngine } = await import('../index')
    const { SDYM_ROLES } = await import('../sdym-be/rates')
    const engine = getEngine('sdym-be')
    const gaffer = SDYM_ROLES.find(r => r.role === 'Gaffer')!
    const base: EngineCalculationInput = {
      role: gaffer,
      agreedDailyRate: 0,
      dayType: 'standard',
      dayOfWeek: 'monday',
      callTime: '08:00',
      wrapTime: '19:00',
      firstBreakGiven: true,
      firstBreakTime: '12:00',
      firstBreakDurationMins: 60,
      secondBreakGiven: false,
      secondBreakDurationMins: 0,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageDistance: 0,
    }
    return engine.calculate({ ...base, ...overrides })
  }

  async function calcLA(overrides: Partial<EngineCalculationInput>) {
    const { getEngine } = await import('../index')
    const { SDYM_ROLES } = await import('../sdym-be/rates')
    const engine = getEngine('sdym-be')
    const la = SDYM_ROLES.find(r => r.role === 'Lighting Assistant')!
    const base: EngineCalculationInput = {
      role: la,
      agreedDailyRate: 0,
      dayType: 'standard',
      dayOfWeek: 'monday',
      callTime: '08:00',
      wrapTime: '19:00',
      firstBreakGiven: true,
      firstBreakTime: '12:00',
      firstBreakDurationMins: 60,
      secondBreakGiven: false,
      secondBreakDurationMins: 0,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageDistance: 0,
    }
    return engine.calculate({ ...base, ...overrides })
  }

  it('Test 1: Gaffer standard Mon 08:00–20:00 → €702 (€594 + 1h OT €108)', async () => {
    const result = await calc({ wrapTime: '20:00' })
    expect(result.grandTotal).toBe(702)
  })

  it('Test 2: Gaffer standard Mon 08:00–19:00 → €594 flat', async () => {
    const result = await calc({ wrapTime: '19:00' })
    expect(result.grandTotal).toBe(594)
  })

  it('Test 3: Gaffer Saturday 08:00–19:00 → €891 flat', async () => {
    const result = await calc({ dayType: 'saturday', wrapTime: '19:00' })
    expect(result.grandTotal).toBe(891)
  })

  it('Test 4: Gaffer Sunday/PH 08:00–19:00 → €1188 flat', async () => {
    const result = await calc({ dayType: 'sunday_ph', wrapTime: '19:00' })
    expect(result.grandTotal).toBe(1188)
  })

  it('Test 5: Gaffer standard 18:00–01:00 → €594 + €162 night surcharge = €756', async () => {
    // 18:00–01:00 = 7h total, minus 1h break = 6h working (< 10h threshold, no OT)
    // Night hours: 22:00–01:00 = 3h × €54 = €162
    const result = await calc({
      callTime: '18:00',
      wrapTime: '01:00',
      firstBreakTime: '21:00',
    })
    expect(result.grandTotal).toBe(756)
  })

  it('Test 6: LA standard Mon 08:00–20:00 → €637 (€539 + 1h OT €98)', async () => {
    const result = await calcLA({ wrapTime: '20:00' })
    expect(result.grandTotal).toBe(637)
  })

  it('Test 7a: Mileage 50km no equipment → €21.50', async () => {
    const result = await calc({
      mileageDistance: 50,
      extra: { hasEquipment: false, kmRate: 0.43 },
    })
    expect(result.mileage).toBeCloseTo(21.5, 2)
    expect(result.grandTotal).toBe(615.5) // 594 + 21.50
  })

  it('Test 7b: Mileage 50km with equipment → €40.00', async () => {
    const result = await calc({
      mileageDistance: 50,
      extra: { hasEquipment: true, kmRate: 0.80 },
    })
    expect(result.mileage).toBeCloseTo(40, 2)
    expect(result.grandTotal).toBe(634) // 594 + 40
  })

  it('Test 8: LA assigned Recce → throws descriptive error', async () => {
    expect(() => calcLA({ dayType: 'recce' })).rejects.toThrow('Recce day type is only available for the Gaffer')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
npm test src/engines/__tests__/sdym-be.test.ts
```

- [ ] **Step 3: Create src/engines/sdym-be/meta.ts**

```typescript
import type { EngineMeta } from '../types'

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

- [ ] **Step 4: Create src/engines/sdym-be/day-types.ts**

```typescript
import type { EngineDayType } from '../types'

export const dayTypes: EngineDayType[] = [
  { value: 'standard',         label: 'Standard Day' },
  { value: 'journee_continue', label: 'Journée Continue' },
  { value: 'saturday',         label: 'Saturday / 6th Consecutive Day' },
  { value: 'sunday_ph',        label: 'Sunday / Public Holiday' },
  { value: 'recce',            label: 'Recce / Preparation Day' },
  { value: 'travel',           label: 'Travel Day' },
]
```

- [ ] **Step 5: Create src/engines/sdym-be/rates.ts**

```typescript
import type { EngineRole } from '../types'

export interface SdymRoleData {
  dayRate: number
  hourlyBase: number
  otRate: number
  nightSurcharge: number
}

export const SDYM_ROLES: EngineRole[] = [
  {
    role: 'Gaffer',
    department: 'Lighting',
    minRate: null,
    maxRate: null,
    engineData: {
      dayRate: 594,
      hourlyBase: 54,
      otRate: 108,
      nightSurcharge: 54,
    } satisfies SdymRoleData,
  },
  {
    role: 'Lighting Assistant',
    department: 'Lighting',
    minRate: null,
    maxRate: null,
    engineData: {
      dayRate: 539,
      hourlyBase: 49,
      otRate: 98,
      nightSurcharge: 49,
    } satisfies SdymRoleData,
  },
]

export const SDYM_DEPARTMENTS: string[] = [
  ...new Set(SDYM_ROLES.map(r => r.department)),
]

export function getRolesByDepartment(department: string): EngineRole[] {
  return SDYM_ROLES.filter(r => r.department === department)
}

export function getRole(roleName: string): EngineRole | undefined {
  return SDYM_ROLES.find(r => r.role === roleName)
}

// Flat rates derived from base day rates
export const FLAT_RATES = {
  saturday: { Gaffer: 891, 'Lighting Assistant': 808.5 },
  sunday_ph: { Gaffer: 1188, 'Lighting Assistant': 1078 },
  recce: { Gaffer: 500 },
  travel: { Gaffer: 450, 'Lighting Assistant': 410 },
} as const
```

- [ ] **Step 6: Create src/engines/sdym-be/calculator.ts**

```typescript
import type { EngineCalculationInput, EngineResult, EngineLineItem } from '../types'
import { FLAT_RATES, type SdymRoleData } from './rates'

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function buildFlatResult(
  total: number,
  description: string,
  input: EngineCalculationInput,
): EngineResult {
  const kmRate = (input.extra?.kmRate as number | undefined) ?? 0
  const mileage = input.mileageDistance > 0 ? Math.round(input.mileageDistance * kmRate * 100) / 100 : 0
  const grandTotal = Math.round((total + mileage) * 100) / 100

  const lineItems: EngineLineItem[] = [{
    description,
    hours: 1,
    rate: total,
    total,
    timeFrom: input.callTime,
    timeTo: input.wrapTime,
    isDayRate: true,
  }]

  return {
    lineItems,
    subtotal: total,
    travelPay: 0,
    mileage,
    mileageDistance: input.mileageDistance,
    penalties: [],
    equipmentValue: 0,
    equipmentDiscount: 0,
    equipmentTotal: 0,
    grandTotal,
    dayDescription: description,
  }
}

function calcNightWorkingMins(
  callMins: number,
  adjustedWrapMins: number,
  breakMins: number,
  breakStartMins: number,
): number {
  // Night window: 22:00 (1320 mins) to 06:00 next day (1800 mins)
  const NIGHT_START = 22 * 60
  const NIGHT_END = 30 * 60

  const overlapStart = Math.max(callMins, NIGHT_START)
  const overlapEnd = Math.min(adjustedWrapMins, NIGHT_END)

  if (overlapEnd <= overlapStart) return 0

  let nightMins = overlapEnd - overlapStart

  // Subtract break time if break falls within night window
  if (breakMins > 0) {
    const breakEnd = breakStartMins + breakMins
    const breakNightStart = Math.max(breakStartMins, NIGHT_START)
    const breakNightEnd = Math.min(breakEnd, NIGHT_END)
    if (breakNightEnd > breakNightStart) {
      nightMins -= breakNightEnd - breakNightStart
    }
  }

  return Math.max(0, nightMins)
}

export function calculateBelgian(input: EngineCalculationInput): EngineResult {
  const rates = input.role.engineData as SdymRoleData
  const roleName = input.role.role as keyof typeof FLAT_RATES.saturday

  // --- Flat day types ---
  if (input.dayType === 'saturday') {
    const flatRates = FLAT_RATES.saturday as Record<string, number>
    const total = flatRates[input.role.role]
    if (total === undefined) throw new Error(`No Saturday rate for role: ${input.role.role}`)
    return buildFlatResult(total, 'Saturday / 6th Consecutive Day', input)
  }

  if (input.dayType === 'sunday_ph') {
    const flatRates = FLAT_RATES.sunday_ph as Record<string, number>
    const total = flatRates[input.role.role]
    if (total === undefined) throw new Error(`No Sunday/PH rate for role: ${input.role.role}`)
    return buildFlatResult(total, 'Sunday / Public Holiday', input)
  }

  if (input.dayType === 'recce') {
    if (input.role.role !== 'Gaffer') {
      throw new Error(`Recce day type is only available for the Gaffer role, not ${input.role.role}`)
    }
    return buildFlatResult(FLAT_RATES.recce.Gaffer, 'Recce / Preparation Day', input)
  }

  if (input.dayType === 'travel') {
    const flatRates = FLAT_RATES.travel as Record<string, number>
    const total = flatRates[input.role.role]
    if (total === undefined) throw new Error(`No Travel rate for role: ${input.role.role}`)
    return buildFlatResult(total, 'Travel Day', input)
  }

  // --- Standard / Journée Continue ---
  const callMins = timeToMinutes(input.callTime)
  let wrapMins = timeToMinutes(input.wrapTime)
  if (wrapMins <= callMins) wrapMins += 24 * 60

  const breakMins = (input.firstBreakGiven ? input.firstBreakDurationMins : 0) +
                    (input.secondBreakGiven ? input.secondBreakDurationMins : 0)
  const breakStartMins = input.firstBreakGiven && input.firstBreakTime
    ? timeToMinutes(input.firstBreakTime)
    : callMins

  const workingMins = (wrapMins - callMins) - breakMins
  const workingHours = workingMins / 60

  // OT threshold: standard = 10 working hours, journée_continue = 9
  const otThreshold = input.dayType === 'journee_continue' ? 9 : 10
  const otHours = Math.max(0, workingHours - otThreshold)

  const lineItems: EngineLineItem[] = []

  // Day rate line item
  lineItems.push({
    description: 'Day Rate',
    hours: 1,
    rate: rates.dayRate,
    total: rates.dayRate,
    timeFrom: input.callTime,
    timeTo: input.wrapTime,
    isDayRate: true,
  })

  // OT line items (per-hour)
  if (otHours > 0) {
    const otTotal = Math.round(otHours * rates.otRate * 100) / 100
    lineItems.push({
      description: 'Overtime',
      hours: otHours,
      rate: rates.otRate,
      total: otTotal,
    })
  }

  // Night surcharge
  const nightWorkingMins = calcNightWorkingMins(callMins, wrapMins, breakMins, breakStartMins)
  const nightHours = nightWorkingMins / 60
  let nightSurchargeTotal = 0

  if (nightHours > 0) {
    nightSurchargeTotal = Math.round(nightHours * rates.nightSurcharge * 100) / 100
    lineItems.push({
      description: 'Night Surcharge (22:00–06:00)',
      hours: nightHours,
      rate: rates.nightSurcharge,
      total: nightSurchargeTotal,
    })
  }

  // Mileage
  const kmRate = (input.extra?.kmRate as number | undefined) ?? 0
  const mileage = input.mileageDistance > 0
    ? Math.round(input.mileageDistance * kmRate * 100) / 100
    : 0

  const otTotal = otHours > 0 ? Math.round(otHours * rates.otRate * 100) / 100 : 0
  const subtotal = Math.round((rates.dayRate + otTotal + nightSurchargeTotal) * 100) / 100
  const grandTotal = Math.round((subtotal + mileage) * 100) / 100

  const dayLabel = input.dayType === 'journee_continue' ? 'Journée Continue' : 'Standard Day'

  return {
    lineItems,
    subtotal,
    travelPay: 0,
    mileage,
    mileageDistance: input.mileageDistance,
    penalties: [],
    equipmentValue: 0,
    equipmentDiscount: 0,
    equipmentTotal: 0,
    grandTotal,
    dayDescription: dayLabel,
  }
}
```

- [ ] **Step 7: Create src/engines/sdym-be/index.ts**

```typescript
import { registerEngine } from '../index'
import type { CalculatorEngine } from '../types'
import { meta } from './meta'
import { dayTypes } from './day-types'
import { SDYM_ROLES, SDYM_DEPARTMENTS, getRolesByDepartment, getRole } from './rates'
import { calculateBelgian } from './calculator'

const engine: CalculatorEngine = {
  meta,
  roles: SDYM_ROLES,
  departments: SDYM_DEPARTMENTS,
  dayTypes,
  getRolesByDepartment,
  getRole,
  calculate: calculateBelgian,
}

registerEngine(engine)

export { engine as sdymBeEngine }
```

- [ ] **Step 8: Add sdym-be import to src/main.tsx**

Open `src/main.tsx` and add the import that was deferred in Task 4:
```typescript
import './engines/sdym-be'  // registers Belgian SDYM engine
```

- [ ] **Step 9: Run all tests — expect pass**

```bash
npm test
```
Expected: all 8 sdym-be tests pass, all prior tests still pass.

- [ ] **Step 10: Run build**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/engines/sdym-be/ src/engines/__tests__/sdym-be.test.ts src/main.tsx
git commit -m "feat: add Belgian SDYM 2026 calculator engine"
```

---

### Task 6: Database migration

**Files:**
- Create: `supabase/migrations/20260413120000_add_calc_engine_columns.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260413120000_add_calc_engine_columns.sql`:
```sql
-- Add engine tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_engine       text    NOT NULL DEFAULT 'apa-uk',
  ADD COLUMN IF NOT EXISTS signup_country       text,
  ADD COLUMN IF NOT EXISTS multi_engine_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS authorized_engines   text[]  NOT NULL DEFAULT ARRAY['apa-uk'];

-- Add engine tracking to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS calc_engine text NOT NULL DEFAULT 'apa-uk';

-- Add engine tracking to calculations
ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS calc_engine text NOT NULL DEFAULT 'apa-uk';

-- Grant SELECT/UPDATE on new profile columns to authenticated users
-- (RLS policies on profiles should already cover this, but be explicit)
GRANT SELECT, UPDATE (default_engine, signup_country, multi_engine_enabled, authorized_engines)
  ON public.profiles TO authenticated;
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push
```
Expected: migration applied successfully. All existing rows get `default_engine = 'apa-uk'`, `multi_engine_enabled = false`, `authorized_engines = ['apa-uk']`, `calc_engine = 'apa-uk'` for projects and calculations.

- [ ] **Step 3: Verify columns exist**

```bash
supabase db diff
```
Expected: no pending changes (migration fully applied).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260413120000_add_calc_engine_columns.sql
git commit -m "feat: add calc_engine columns to profiles, projects, calculations"
```

---

### Task 7: Signup country detection utility

**Files:**
- Create: `src/lib/detectSignupCountry.ts`
- Create: `src/lib/__tests__/detectSignupCountry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/detectSignupCountry.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// detectSignupCountry reads window.location.search and document.referrer,
// and optionally calls fetch. We mock these at the global level.

describe('detectSignupCountry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    // Reset URL to empty
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    })
    Object.defineProperty(document, 'referrer', {
      value: '',
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects BE from ?ref=crewdock.be query param', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?ref=crewdock.be' },
      writable: true,
    })
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('BE')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('detects BE from document.referrer containing crewdock.be', async () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://crewdock.be/signup',
      configurable: true,
    })
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('BE')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('calls ipapi.co when no domain match and returns country', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('DE', { status: 200 })
    )
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('DE')
    expect(fetch).toHaveBeenCalledWith('https://ipapi.co/country/')
  })

  it('returns GB as fallback when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('GB')
  })

  it('returns GB as fallback when ipapi response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('error', { status: 500 })
    )
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('GB')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test src/lib/__tests__/detectSignupCountry.test.ts
```

- [ ] **Step 3: Create src/lib/detectSignupCountry.ts**

```typescript
import { getAllEngines } from '@/engines/index'

/**
 * Detects the user's country at signup time.
 * Priority: ?ref= param → document.referrer → ipapi.co → fallback 'GB'
 * Non-blocking — any failure returns 'GB'.
 */
export async function detectSignupCountry(): Promise<string> {
  try {
    // 1. Check ?ref= query param for known engine domains
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) {
      const countryFromRef = countryForDomain(ref)
      if (countryFromRef) return countryFromRef
    }

    // 2. Check document.referrer for known engine domains
    if (document.referrer) {
      const referrerHost = new URL(document.referrer).hostname
      const countryFromReferrer = countryForDomain(referrerHost)
      if (countryFromReferrer) return countryFromReferrer
    }

    // 3. IP geolocation via ipapi.co
    const response = await fetch('https://ipapi.co/country/')
    if (!response.ok) return 'GB'
    const country = (await response.text()).trim()
    return country || 'GB'
  } catch {
    return 'GB'
  }
}

function countryForDomain(domain: string): string | null {
  for (const engine of getAllEngines()) {
    if (engine.meta.domain && domain.includes(engine.meta.domain)) {
      return engine.meta.country
    }
  }
  return null
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```
Expected: all tests pass. (Note: the tests for detectSignupCountry may require the `environment: 'jsdom'` setting — if they fail with "window is not defined", update `vitest.config.ts` to set `environment: 'jsdom'` and run `npm install -D jsdom`.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/detectSignupCountry.ts src/lib/__tests__/detectSignupCountry.test.ts
git commit -m "feat: add signup country detection utility"
```

> **Milestone 1 gate:** Before proceeding to Task 8, verify:
> - `npm run build` passes
> - `npm test` all pass
> - Manual spot-check of APA UK calculator (Gaffer, break penalty, rest day, travel day) shows unchanged results

---

## Milestone 2: UI Layer

---

### Task 8: EngineContext + useEngine hook

**Files:**
- Create: `src/contexts/EngineContext.tsx`
- Create: `src/hooks/useEngine.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create src/contexts/EngineContext.tsx**

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import * as Sentry from '@sentry/react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { getEngine, getAllEngines, DEFAULT_ENGINE_ID } from '@/engines/index'
import type { CalculatorEngine } from '@/engines/types'

interface EngineContextType {
  activeEngine: CalculatorEngine
  defaultEngineId: string
  showEngineSelector: boolean
  authorizedEngines: CalculatorEngine[]
  setJobEngine(id: string | null): void
  setDefaultEngine(id: string): Promise<void>
}

const EngineContext = createContext<EngineContextType | undefined>(undefined)

export function EngineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [defaultEngineId, setDefaultEngineId] = useState(DEFAULT_ENGINE_ID)
  const [jobEngineOverride, setJobEngineOverride] = useState<string | null>(null)
  const [showEngineSelector, setShowEngineSelector] = useState(false)
  const [authorizedEngineIds, setAuthorizedEngineIds] = useState<string[]>([DEFAULT_ENGINE_ID])

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('default_engine, multi_engine_enabled, authorized_engines')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          Sentry.captureException(new Error(error.message), {
            extra: { context: 'EngineContext profile fetch' },
          })
          return
        }
        if (data) {
          setDefaultEngineId(data.default_engine ?? DEFAULT_ENGINE_ID)
          setShowEngineSelector(data.multi_engine_enabled ?? false)
          setAuthorizedEngineIds(data.authorized_engines ?? [DEFAULT_ENGINE_ID])
        }
      })
  }, [user])

  const setJobEngine = useCallback((id: string | null) => {
    setJobEngineOverride(id)
  }, [])

  const setDefaultEngine = useCallback(async (id: string) => {
    if (!user) return
    setDefaultEngineId(id)
    const { error } = await supabase
      .from('profiles')
      .update({ default_engine: id })
      .eq('id', user.id)
    if (error) {
      Sentry.captureException(new Error(error.message), {
        extra: { context: 'EngineContext setDefaultEngine' },
      })
    }
  }, [user])

  const resolvedId = jobEngineOverride ?? defaultEngineId

  let activeEngine: CalculatorEngine
  try {
    activeEngine = getEngine(resolvedId)
  } catch {
    activeEngine = getEngine(DEFAULT_ENGINE_ID)
  }

  const authorizedEngines = authorizedEngineIds
    .map(id => { try { return getEngine(id) } catch { return null } })
    .filter((e): e is CalculatorEngine => e !== null)

  return (
    <EngineContext.Provider value={{
      activeEngine,
      defaultEngineId,
      showEngineSelector,
      authorizedEngines,
      setJobEngine,
      setDefaultEngine,
    }}>
      {children}
    </EngineContext.Provider>
  )
}

export function useEngineContext() {
  const ctx = useContext(EngineContext)
  if (!ctx) throw new Error('useEngineContext must be used within EngineProvider')
  return ctx
}
```

- [ ] **Step 2: Create src/hooks/useEngine.ts**

```typescript
import { useEngineContext } from '@/contexts/EngineContext'

export function useEngine() {
  return useEngineContext()
}
```

- [ ] **Step 3: Update App.tsx — wrap SubscriptionProvider with EngineProvider**

In `src/App.tsx`, add the import:
```typescript
import { EngineProvider } from '@/contexts/EngineContext'
```

Change the provider nesting from:
```tsx
<AuthProvider>
  <SubscriptionProvider>
    ...
  </SubscriptionProvider>
</AuthProvider>
```
to:
```tsx
<AuthProvider>
  <EngineProvider>
    <SubscriptionProvider>
      ...
    </SubscriptionProvider>
  </EngineProvider>
</AuthProvider>
```

- [ ] **Step 4: Run build — must pass**

```bash
npm run build
```

- [ ] **Step 5: Smoke-test in browser**

```bash
npm run dev
```
Log in. Open DevTools console. No errors about EngineContext or engine not found. App functions as before.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/EngineContext.tsx src/hooks/useEngine.ts src/App.tsx
git commit -m "feat: add EngineContext and useEngine hook"
```

---

### Task 9: Settings page — "My Rates" rename and engine selector

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

Read `src/pages/SettingsPage.tsx` in full before making changes.

- [ ] **Step 1: Rename "Custom Roles" section heading to "My Rates"**

Find all instances of "Custom Roles" heading text in `SettingsPage.tsx` and replace with "My Rates". This is a display label change only — do not rename any variables or functions.

- [ ] **Step 2: Add imports**

Add to the import section of `SettingsPage.tsx`:
```typescript
import { useEngine } from '@/hooks/useEngine'
import { Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
```

- [ ] **Step 3: Add engine state inside the SettingsPage component**

At the top of the `SettingsPage` component function, add:
```typescript
const { activeEngine, showEngineSelector, authorizedEngines, setDefaultEngine, defaultEngineId } = useEngine()
const [engineModalOpen, setEngineModalOpen] = useState(false)
const [pendingEngineId, setPendingEngineId] = useState(defaultEngineId)
```

- [ ] **Step 4: Add engine selector subtext within the "My Rates" section**

Inside the "My Rates" section JSX, before or after the custom roles content, add:
```tsx
{showEngineSelector && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
    <span>Calculator engine: <strong>{activeEngine.meta.name} ({activeEngine.meta.currencySymbol})</strong></span>
    <button
      onClick={() => {
        setPendingEngineId(defaultEngineId)
        setEngineModalOpen(true)
      }}
      className="inline-flex items-center gap-1 text-xs underline underline-offset-2 hover:text-foreground"
    >
      <Pencil size={12} />
      Change
    </button>
  </div>
)}
```

- [ ] **Step 5: Add the engine change modal**

Just before the closing `</>` or `</div>` of the SettingsPage return, add:
```tsx
<Dialog open={engineModalOpen} onOpenChange={setEngineModalOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Change Calculator Engine</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-2">
      <Select value={pendingEngineId} onValueChange={setPendingEngineId}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {authorizedEngines.map(e => (
            <SelectItem key={e.meta.id} value={e.meta.id}>
              {e.meta.name} ({e.meta.currencySymbol})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">
        This will affect all future jobs. Existing jobs keep their current T&Cs.
        You can also change the engine on individual jobs from the job settings.
      </p>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setEngineModalOpen(false)}>Cancel</Button>
      <Button onClick={async () => {
        await setDefaultEngine(pendingEngineId)
        setEngineModalOpen(false)
      }}>
        Save
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 6: Grey out custom roles when engine is not APA UK**

Find the custom roles form/list JSX. Wrap it with a conditional that shows a note when the engine is not APA UK:
```tsx
{activeEngine.meta.id !== 'apa-uk' ? (
  <p className="text-sm text-muted-foreground py-4">
    Custom roles are only available with the APA UK engine.
  </p>
) : (
  // existing custom roles JSX
)}
```

- [ ] **Step 7: Run build — must pass**

```bash
npm run build
```

- [ ] **Step 8: Manual test in browser**

Log in as a UK user (multi_engine_enabled = false). Confirm engine selector is not visible. Then temporarily set `multi_engine_enabled = true` in Supabase for your test account. Reload. Confirm engine selector appears, modal opens, engine list shows both engines, saving updates the profile.

- [ ] **Step 9: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: settings page — My Rates rename and engine selector"
```

---

### Task 10: Projects page — per-job T&Cs dropdown and engine badge

**Files:**
- Modify: `src/pages/ProjectsPage.tsx`

Read `src/pages/ProjectsPage.tsx` in full before making changes.

- [ ] **Step 1: Add imports**

```typescript
import { useEngine } from '@/hooks/useEngine'
import { getEngine } from '@/engines/index'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
```

- [ ] **Step 2: Access engine context at top of component**

```typescript
const { showEngineSelector, authorizedEngines, defaultEngineId } = useEngine()
```

- [ ] **Step 3: Add calc_engine field to job creation/edit form state**

Find where job form state is initialised (e.g. `useState` for new job fields). Add `calc_engine: defaultEngineId` to the initial state. When the edit dialog opens for an existing job, set `calc_engine: job.calc_engine ?? 'apa-uk'`.

- [ ] **Step 4: Add T&Cs dropdown to job creation/edit dialog**

Inside the job creation/edit dialog JSX, after the existing form fields and before the submit button, add:
```tsx
{showEngineSelector && (
  <div className="space-y-1">
    <label className="text-sm font-medium">T&Cs</label>
    <Select
      value={formState.calc_engine}
      onValueChange={(val) => setFormState(s => ({ ...s, calc_engine: val }))}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {authorizedEngines.map(e => (
          <SelectItem key={e.meta.id} value={e.meta.id}>
            {e.meta.name} ({e.meta.currencySymbol})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

- [ ] **Step 5: Save calc_engine when creating/updating a job**

Find where the job is saved to Supabase (`supabase.from('projects').insert(...)` or `.update(...)`). Add `calc_engine: formState.calc_engine` to the upsert payload.

- [ ] **Step 6: Add engine badge to job cards**

Find the job card JSX. Add engine badge rendering:
```tsx
{showEngineSelector && job.calc_engine && job.calc_engine !== 'apa-uk' && (() => {
  try {
    const e = getEngine(job.calc_engine)
    return <Badge variant="outline" className="text-xs">{e.meta.shortName}</Badge>
  } catch {
    return null
  }
})()}
```

- [ ] **Step 7: Add engine switch warning popup**

Add state for the warning popup:
```typescript
const [engineSwitchWarning, setEngineSwitchWarning] = useState<{
  open: boolean
  targetId: string
  onConfirm: () => void
}>({ open: false, targetId: '', onConfirm: () => {} })
```

When the T&Cs dropdown changes to a different engine family, show the warning before applying. Replace the `onValueChange` handler:
```typescript
onValueChange={(val) => {
  if (val !== formState.calc_engine) {
    const targetEngine = authorizedEngines.find(e => e.meta.id === val)
    if (targetEngine && targetEngine.meta.id !== 'apa-uk') {
      setEngineSwitchWarning({
        open: true,
        targetId: val,
        onConfirm: () => setFormState(s => ({ ...s, calc_engine: val })),
      })
    } else {
      setFormState(s => ({ ...s, calc_engine: val }))
    }
  }
}}
```

Add the warning dialog JSX:
```tsx
<Dialog open={engineSwitchWarning.open} onOpenChange={(open) => setEngineSwitchWarning(s => ({ ...s, open }))}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>
        Switching to {authorizedEngines.find(e => e.meta.id === engineSwitchWarning.targetId)?.meta.name}
      </DialogTitle>
    </DialogHeader>
    <ul className="text-sm space-y-1 list-disc pl-4 text-muted-foreground">
      <li>Rates are fixed — no agreed daily rate input</li>
      <li>Custom roles not available</li>
      <li>Some APA-specific fields are hidden</li>
    </ul>
    <p className="text-sm mt-2">Your other jobs are not affected.</p>
    <DialogFooter>
      <Button variant="outline" onClick={() => setEngineSwitchWarning(s => ({ ...s, open: false }))}>
        Cancel
      </Button>
      <Button onClick={() => {
        engineSwitchWarning.onConfirm()
        setEngineSwitchWarning(s => ({ ...s, open: false }))
      }}>
        Switch
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 8: Run build**

```bash
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/ProjectsPage.tsx
git commit -m "feat: projects page — per-job T&Cs selector and engine badge"
```

---

### Task 11: Calculator page — full engine integration

**Files:**
- Modify: `src/pages/CalculatorPage.tsx`

Read `src/pages/CalculatorPage.tsx` in full before making changes. The file is large — read it entirely so you understand every APA-specific import and hardcoded value before changing anything.

- [ ] **Step 1: Replace APA data imports with useEngine**

Remove these imports:
```typescript
import { APA_CREW_ROLES, DEPARTMENTS, getRolesByDepartment, type CrewRole } from '@/data/apa-rates'
import { calculateCrewCost, type DayType, type DayOfWeek, type CalculationResult } from '@/data/calculation-engine'
```

Add:
```typescript
import { useEngine } from '@/hooks/useEngine'
import type { EngineRole, EngineResult } from '@/engines/types'
```

- [ ] **Step 2: Update type references**

Replace all `CrewRole` type annotations with `EngineRole`.
Replace all `CalculationResult` type annotations with `EngineResult`.

- [ ] **Step 3: Pull engine data from context**

At the top of the `CalculatorPage` component, add:
```typescript
const { activeEngine, setJobEngine } = useEngine()
```

Replace all direct uses of the removed imports:
- `APA_CREW_ROLES` → `activeEngine.roles`
- `DEPARTMENTS` → `activeEngine.departments`
- `getRolesByDepartment(dept)` → `activeEngine.getRolesByDepartment(dept)`
- `calculateCrewCost(input)` → `activeEngine.calculate(input)`

- [ ] **Step 4: Replace hardcoded day types array**

Find the array of day type objects used for the day type selector (values like `'basic_working'`, `'continuous_working'`, etc.). Replace it with:
```typescript
activeEngine.dayTypes
```

- [ ] **Step 5: Replace hardcoded £ and "miles"**

Find all hardcoded `'£'` strings in the JSX. Replace with `{activeEngine.meta.currencySymbol}`.
Find all hardcoded `'miles'` unit strings. Replace with `{activeEngine.meta.mileageUnit}`.

- [ ] **Step 6: Update calculation input construction**

The `calculateCrewCost` call accepted `mileageOutsideM25`. The new `engine.calculate` accepts `mileageDistance`. Update the input object:
```typescript
// Before
mileageOutsideM25: mileageValue,
// After
mileageDistance: mileageValue,
extra: activeEngine.meta.id === 'apa-uk'
  ? { timeOffClock: timeOffClockValue }
  : { hasEquipment: hasEquipmentValue, kmRate: kmRateValue },
```

- [ ] **Step 7: Update result consumption**

The result is now `EngineResult`. The old `CalculationResult.mileageMiles` is now `EngineResult.mileageDistance`. Update all references:
```typescript
// Before
result.mileageMiles
// After
result.mileageDistance
```

The old `result.callType` is now in `result.extra?.callType`. Update the call type badge:
```typescript
// Before
result.callType
// After
(result.extra?.callType as string | undefined)
```

- [ ] **Step 8: Wire setJobEngine on job load/unload**

Find where a job is loaded (likely a `useEffect` that sets calculator state from a job). Add:
```typescript
setJobEngine(job.calc_engine ?? null)
```

Find the cleanup / navigate away (likely the same `useEffect` return or a separate one on unmount). Add:
```typescript
return () => { setJobEngine(null) }
```

- [ ] **Step 9: Hide APA-only elements when engine is not APA UK**

Wrap each of these fields in `{activeEngine.meta.id === 'apa-uk' && (...)}`:
- Break penalty inputs (continuousFirstBreakGiven, continuousAdditionalBreakGiven toggles)
- OT grade display
- Time off the clock field
- Call type badge
- M25 mileage toggle

- [ ] **Step 10: Add Belgian-only elements**

Wrap in `{activeEngine.meta.id === 'sdym-be' && (...)}`:

```tsx
{activeEngine.meta.id === 'sdym-be' && (
  <>
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">Transporting equipment?</label>
      <Switch
        checked={hasEquipment}
        onCheckedChange={(v) => {
          setHasEquipment(v)
          setKmRate(v ? 0.80 : 0.43)
        }}
      />
    </div>
    <div className="space-y-1">
      <label className="text-sm font-medium">
        Distance ({activeEngine.meta.mileageUnit})
      </label>
      <Input
        type="number"
        value={mileageValue}
        onChange={(e) => setMileageValue(Number(e.target.value))}
        min={0}
      />
    </div>
    <div className="space-y-1">
      <label className="text-sm font-medium">Rate per km (€)</label>
      <Input
        type="number"
        step="0.01"
        value={kmRate}
        onChange={(e) => setKmRate(Number(e.target.value))}
        min={0}
      />
    </div>
  </>
)}
```

Add the required state variables at the top of the component:
```typescript
const [hasEquipment, setHasEquipment] = useState(false)
const [kmRate, setKmRate] = useState(0.43)
```

- [ ] **Step 11: Hide "Agreed daily rate" field for Belgian engine**

Find the agreed daily rate input. Wrap it:
```tsx
{activeEngine.meta.id !== 'sdym-be' && (
  // agreed daily rate input JSX
)}
```

- [ ] **Step 12: Run build**

```bash
npm run build
```
Fix any type errors. The most common will be `EngineRole` missing fields that were previously on `CrewRole` (e.g., `otGrade` — these have moved into `engineData`). Anywhere the APA engine's `otGrade` is read directly from the role, update to read from `role.engineData.otGrade as string`.

- [ ] **Step 13: Manual test — APA UK**

Test Gaffer, basic working day, Monday, call 08:00, wrap 21:00, rate £568. Results must be identical to before this change.

- [ ] **Step 14: Commit**

```bash
git add src/pages/CalculatorPage.tsx
git commit -m "feat: calculator page — full engine integration"
```

---

### Task 12: Invoice page — currency-aware

**Files:**
- Modify: `src/pages/InvoicePage.tsx`

Read `src/pages/InvoicePage.tsx` before making changes.

- [ ] **Step 1: Add imports**

```typescript
import { getEngine, DEFAULT_ENGINE_ID } from '@/engines/index'
```

- [ ] **Step 2: Derive currency symbol from the job's calc_engine**

Find where the invoice data is loaded (Supabase query for the job/calculation). After loading, derive:
```typescript
const engineId = invoiceJob?.calc_engine ?? DEFAULT_ENGINE_ID
let currencySymbol = '£'
try {
  currencySymbol = getEngine(engineId).meta.currencySymbol
} catch {
  currencySymbol = '£'
}
```

- [ ] **Step 3: Replace all hardcoded £ symbols**

Find every `'£'` string literal in the JSX. Replace with `{currencySymbol}`.

- [ ] **Step 4: Run build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/InvoicePage.tsx
git commit -m "feat: invoice page — derive currency symbol from job engine"
```

---

### Task 13: Dashboard and History pages — multi-currency display

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/pages/HistoryPage.tsx` (if it exists as a separate page; check — it may redirect to ProjectsPage)

Read both pages before making changes.

- [ ] **Step 1: Add engine import to DashboardPage.tsx**

```typescript
import { getEngine, DEFAULT_ENGINE_ID } from '@/engines/index'
```

- [ ] **Step 2: Replace per-row hardcoded £**

For every place that renders a currency amount from a row (calculation or project), derive the currency symbol from the row's `calc_engine`:
```typescript
function getCurrencySymbol(calcEngine: string | null | undefined): string {
  try {
    return getEngine(calcEngine ?? DEFAULT_ENGINE_ID).meta.currencySymbol
  } catch {
    return '£'
  }
}
```

Use this function wherever `'£'` + amount is rendered.

- [ ] **Step 3: Implement multi-currency total display**

Find where monthly/period totals are computed. Replace the single-currency total with multi-currency logic:

```typescript
function groupByCurrency(rows: Array<{ calc_engine?: string | null; total: number }>) {
  const totals: Record<string, number> = {}
  for (const row of rows) {
    const symbol = getCurrencySymbol(row.calc_engine)
    totals[symbol] = (totals[symbol] ?? 0) + row.total
  }
  return totals
}

function formatMultiCurrencyTotal(totals: Record<string, number>): string {
  return Object.entries(totals)
    .map(([symbol, total]) => `${symbol}${total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' · ')
}
```

Replace the total display:
```tsx
// Before: £{total.toFixed(2)}
// After:
{formatMultiCurrencyTotal(groupByCurrency(rows))}
```

- [ ] **Step 4: Apply same changes to HistoryPage.tsx if it exists and has its own £ rendering**

Check if `src/pages/HistoryPage.tsx` has any `£` symbols or totals. Apply the same pattern.

- [ ] **Step 5: Run build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/DashboardPage.tsx src/pages/HistoryPage.tsx
git commit -m "feat: dashboard — multi-currency totals and per-row currency symbols"
```

---

### Task 14: Share page — engine scenarios and soft onboarding

**Files:**
- Modify: `src/pages/SharePage.tsx`

Read `src/pages/SharePage.tsx` in full before making changes.

- [ ] **Step 1: Add imports**

```typescript
import * as Sentry from '@sentry/react'
import { getEngine, DEFAULT_ENGINE_ID } from '@/engines/index'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useEngine } from '@/hooks/useEngine'
```

- [ ] **Step 2: Derive engine from the shared calculation's calc_engine field**

After loading the shared calculation from Supabase, resolve the engine:
```typescript
const [shareEngine, setShareEngine] = useState<CalculatorEngine | null>(null)
const [engineError, setEngineError] = useState<'not_found' | 'mismatch' | null>(null)

// After loading calculation:
const calcEngineId = calculation?.calc_engine ?? DEFAULT_ENGINE_ID
try {
  const resolved = getEngine(calcEngineId)
  setShareEngine(resolved)
} catch {
  setEngineError('not_found')
  Sentry.captureEvent({
    message: 'Job share engine issue',
    level: 'warning',
    tags: {
      feature: 'job-sharing',
      scenario: 'engine_not_found',
      job_engine: calcEngineId,
    },
    extra: { jobId: calculation?.id },
  })
}
```

- [ ] **Step 3: Replace hardcoded £ with shareEngine?.meta.currencySymbol**

Find all `'£'` occurrences. Replace with `{shareEngine?.meta.currencySymbol ?? '£'}`.

- [ ] **Step 4: Add mismatch detection for UK users viewing Belgian jobs**

After resolving the engine, check if the viewer has access:
```typescript
const { user } = useAuth()
const { authorizedEngines } = useEngine()

// After shareEngine is resolved:
if (shareEngine && user) {
  const hasAccess = authorizedEngines.some(e => e.meta.id === shareEngine.meta.id)
  if (!hasAccess) {
    setEngineError('mismatch')
    Sentry.captureEvent({
      message: 'Job share engine issue',
      level: 'warning',
      tags: {
        feature: 'job-sharing',
        scenario: 'engine_mismatch',
        job_engine: shareEngine.meta.id,
      },
      extra: {
        jobId: calculation?.id,
        viewerEngineAccess: authorizedEngines.map(e => e.meta.id),
      },
    })
  }
}
```

- [ ] **Step 5: Render engine error states**

Add conditional rendering for error states before the main share content:

```tsx
{engineError === 'not_found' && (
  <div className="text-center space-y-4 py-8">
    <p className="text-sm text-muted-foreground">
      This job uses a calculator engine that is no longer available. Saved figures shown below.
    </p>
    <Button variant="outline" size="sm" onClick={handleReportIssue}>Report issue</Button>
  </div>
)}

{engineError === 'mismatch' && shareEngine && !mismatchDismissed && (
  <div className="rounded-lg border p-4 space-y-3 mb-6">
    <p className="text-sm">
      This job uses {shareEngine.meta.name} ({shareEngine.meta.currencySymbol}).
      Enable the Belgian engine to recalculate.
    </p>
    <div className="flex gap-2">
      <Button size="sm" onClick={handleEnableBelgianEngine}>Enable Belgian Engine</Button>
      <Button variant="outline" size="sm" onClick={() => setMismatchDismissed(true)}>View anyway</Button>
      <Button variant="ghost" size="sm" onClick={handleReportIssue}>Report issue</Button>
    </div>
  </div>
)}
```

Add state: `const [mismatchDismissed, setMismatchDismissed] = useState(false)`

- [ ] **Step 6: Implement handleEnableBelgianEngine (soft onboarding)**

```typescript
const handleEnableBelgianEngine = async () => {
  if (!user) return
  const { data: profile } = await supabase
    .from('profiles')
    .select('authorized_engines')
    .eq('id', user.id)
    .single()

  const current = (profile?.authorized_engines as string[]) ?? ['apa-uk']
  const updated = Array.from(new Set([...current, 'sdym-be']))

  await supabase.from('profiles').update({
    multi_engine_enabled: true,
    authorized_engines: updated,
  }).eq('id', user.id)

  // Reload to pick up new engine context
  window.location.reload()
}
```

- [ ] **Step 7: Implement handleReportIssue**

```typescript
const [issueReported, setIssueReported] = useState(false)

const handleReportIssue = () => {
  Sentry.captureEvent({
    message: 'Job share engine issue — user reported',
    level: 'warning',
    tags: {
      feature: 'job-sharing',
      scenario: engineError ?? 'unknown',
      job_engine: calculation?.calc_engine ?? 'unknown',
    },
    extra: { jobId: calculation?.id },
  })
  setIssueReported(true)
}

// In JSX after report button click:
{issueReported && (
  <p className="text-sm text-muted-foreground">
    Thanks — this has been flagged and we'll look into it.
  </p>
)}
```

- [ ] **Step 8: Handle broken/deleted share links**

Find where share link loading failures are handled (job not found, token invalid). Ensure the message reads:
```tsx
<p className="text-sm text-muted-foreground text-center py-8">
  This link is no longer available. The job may have been deleted.
</p>
<div className="text-center">
  <Button asChild variant="outline"><a href="/dashboard">Go to CrewDock</a></Button>
</div>
```

- [ ] **Step 9: Run build**

```bash
npm run build
```

- [ ] **Step 10: Commit**

```bash
git add src/pages/SharePage.tsx
git commit -m "feat: share page — engine-aware rendering and soft onboarding"
```

---

### Task 15: Admin panel — engine access management

**Files:**
- Modify: `src/pages/AdminPage.tsx`

Read `src/pages/AdminPage.tsx` in full before making changes.

- [ ] **Step 1: Add imports**

```typescript
import { getAllEngines } from '@/engines/index'
```

- [ ] **Step 2: Add user list query with engine columns**

In AdminPage, add a query to fetch all users with their engine access data. Find the existing admin Supabase queries and add/extend:
```typescript
const [engineUsers, setEngineUsers] = useState<Array<{
  id: string
  email: string
  display_name: string | null
  signup_country: string | null
  multi_engine_enabled: boolean
  authorized_engines: string[]
}>>([])

// In a useEffect alongside other admin data fetches:
supabase
  .from('profiles')
  .select('id, email, display_name, signup_country, multi_engine_enabled, authorized_engines')
  .order('created_at', { ascending: false })
  .then(({ data }) => {
    if (data) setEngineUsers(data)
  })
```

Note: `profiles` must have an `email` column, or join to `auth.users`. Check the existing admin queries to see how user email is currently fetched and follow the same pattern.

- [ ] **Step 3: Add "Engine Access" section to AdminPage JSX**

Find the existing sections/tabs in AdminPage. Add a new "Engine Access" section:

```tsx
<section className="space-y-4">
  <h2 className="text-lg font-semibold">Engine Access</h2>
  <div className="rounded-lg border overflow-hidden">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/50 text-left">
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2">Email</th>
          <th className="px-4 py-2">Signup Country</th>
          <th className="px-4 py-2">Multi-Engine</th>
          <th className="px-4 py-2">Authorized Engines</th>
        </tr>
      </thead>
      <tbody>
        {engineUsers.map(u => (
          <EngineAccessRow
            key={u.id}
            user={u}
            onUpdate={(updated) => {
              setEngineUsers(prev => prev.map(x => x.id === updated.id ? updated : x))
            }}
          />
        ))}
      </tbody>
    </table>
  </div>
</section>
```

- [ ] **Step 4: Implement EngineAccessRow component**

Add this component inside `AdminPage.tsx` (above the main component):

```tsx
const ADMIN_EMAIL = 'milo.cosemans@gmail.com'

function EngineAccessRow({
  user,
  onUpdate,
}: {
  user: {
    id: string
    email: string
    display_name: string | null
    signup_country: string | null
    multi_engine_enabled: boolean
    authorized_engines: string[]
  }
  onUpdate: (updated: typeof user) => void
}) {
  const allEngines = getAllEngines()
  const isAdmin = user.email === ADMIN_EMAIL

  const toggleMultiEngine = async () => {
    if (isAdmin) return // protected
    const newValue = !user.multi_engine_enabled
    const { error } = await supabase
      .from('profiles')
      .update({ multi_engine_enabled: newValue })
      .eq('id', user.id)
    if (!error) onUpdate({ ...user, multi_engine_enabled: newValue })
  }

  const toggleEngine = async (engineId: string) => {
    if (isAdmin) return // protected
    const current = user.authorized_engines
    const next = current.includes(engineId)
      ? current.filter(id => id !== engineId)
      : [...current, engineId]
    // Minimum 1 engine required
    if (next.length === 0) return
    const { error } = await supabase
      .from('profiles')
      .update({ authorized_engines: next })
      .eq('id', user.id)
    if (!error) onUpdate({ ...user, authorized_engines: next })
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2">{user.display_name ?? '—'}</td>
      <td className="px-4 py-2 text-muted-foreground">{user.email}</td>
      <td className="px-4 py-2">{user.signup_country ?? '—'}</td>
      <td className="px-4 py-2">
        <Switch
          checked={user.multi_engine_enabled}
          onCheckedChange={toggleMultiEngine}
          disabled={isAdmin}
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-2">
          {allEngines.map(e => (
            <label key={e.meta.id} className="flex items-center gap-1 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={isAdmin || user.authorized_engines.includes(e.meta.id)}
                onChange={() => toggleEngine(e.meta.id)}
                disabled={isAdmin}
              />
              {e.meta.shortName} ({e.meta.currencySymbol})
            </label>
          ))}
        </div>
      </td>
    </tr>
  )
}
```

- [ ] **Step 5: Run build**

```bash
npm run build
```

- [ ] **Step 6: Test in browser**

Log in as admin. Navigate to /admin. Verify the Engine Access section shows all users. Toggle multi_engine_enabled for a test user. Verify the change persists in Supabase.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "feat: admin panel — engine access management"
```

---

### Task 16: Wire signup country detection into AuthContext

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add import**

```typescript
import { detectSignupCountry } from '@/lib/detectSignupCountry'
import { getEngineForCountry } from '@/engines/index'
```

- [ ] **Step 2: Update signUp function**

Replace the current `signUp` function with:
```typescript
const signUp = async (email: string, password: string, fullName: string, department?: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, department: department || null },
      emailRedirectTo: 'https://app.crewdock.app/dashboard',
    },
  })

  if (!error && data.user) {
    // Fire-and-forget country detection — failure is silent, defaults remain safe for UK users
    ;(async () => {
      try {
        const country = await detectSignupCountry()
        const engineId = getEngineForCountry(country)
        await supabase.from('profiles').upsert({
          id: data.user!.id,
          signup_country: country,
          default_engine: engineId,
          multi_engine_enabled: country !== 'GB',
          authorized_engines: country !== 'GB'
            ? ['apa-uk', engineId]
            : ['apa-uk'],
        }, { onConflict: 'id', ignoreDuplicates: false })
      } catch {
        // Silent fallback — profile keeps safe defaults (apa-uk, multi_engine_enabled: false)
      }
    })()
  }

  return { error: error as Error | null }
}
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```
Expected: all pass

- [ ] **Step 5: Manual end-to-end test**

Create a new test account. Observe the profiles row in Supabase: `signup_country` should be set (GB or detected country), `default_engine` should be `'apa-uk'` for a GB user.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: wire signup country detection into AuthContext"
```

---

### Final verification

- [ ] `npm run build` — passes clean
- [ ] `npm test` — all pass
- [ ] Manual: UK user sees no change to their experience. Multi-engine UI is hidden. Calculator results identical.
- [ ] Manual: Set `multi_engine_enabled = true` in Supabase for test user. Engine selector appears in Settings. Job T&Cs dropdown appears in Projects. Engine badge appears on SDYM-BE jobs.
- [ ] Manual: Belgian engine calculation — Gaffer, standard, Mon, 08:00–20:00 → €702.
- [ ] Manual: Share page — share a SDYM-BE job with a UK user. Mismatch warning appears. "Enable Belgian Engine" flow works.
- [ ] Manual: Admin panel — Engine Access section shows users, toggles work, `milo.cosemans@gmail.com` rows are protected.
