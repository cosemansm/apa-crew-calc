# Pre-Call Individual Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Pre-call start" feature to the UK-APA engine so crew members who start before the main unit call (e.g. van pickup at 05:30, call at 08:00) get their pre-call hours calculated as separate line items, without affecting CWD/break timing.

**Architecture:** Purely additive. A new optional `preCallStartTime` field flows through `EngineCalculationInput` -> `CalculationInput` -> `calculateCrewCost()`. Pre-call line items are prepended to the existing `lineItems` array. The UI adds a checkbox + time picker below the call/wrap row. A DB migration adds one nullable column.

**Tech Stack:** TypeScript, React, Supabase (Postgres), Vitest

**Spec:** `docs/superpowers/specs/2026-04-18-pre-call-individual-start-design.md`

---

### Task 1: Add `preCallStartTime` to engine types

**Files:**
- Modify: `src/engines/types.ts:65-86`
- Modify: `src/engines/apa-uk/calculator.ts:18-40` (`CalculationInput`)

- [ ] **Step 1: Add field to `EngineCalculationInput`**

In `src/engines/types.ts`, add after line 82 (`previousWrapTime`):

```typescript
preCallStartTime?: string;  // Individual start time before unit call (e.g. "05:30")
```

- [ ] **Step 2: Add field to `CalculationInput`**

In `src/engines/apa-uk/calculator.ts`, add after line 37 (`previousWrapTime`):

```typescript
preCallStartTime?: string; // HH:MM - individual start before unit call
```

- [ ] **Step 3: Pass through the engine wrapper**

In `src/engines/apa-uk/calculator.ts`, in `calculateEngineWrapper()` (line ~778-799), add to the `apaInput` object after `previousWrapTime`:

```typescript
preCallStartTime: input.preCallStartTime,
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (new optional field, no consumers break)

- [ ] **Step 5: Commit**

```bash
git add src/engines/types.ts src/engines/apa-uk/calculator.ts
git commit -m "feat(engine): add preCallStartTime to calculation input types"
```

---

### Task 2: Implement pre-call calculation logic in the engine

**Files:**
- Modify: `src/engines/apa-uk/calculator.ts:139-165` (inside `calculateCrewCost`, after rate setup)

The pre-call logic runs early in `calculateCrewCost()`, builds line items into a temporary array, and prepends them after the main day calculation is done.

- [ ] **Step 1: Write the test file**

Create `src/engines/__tests__/apa-uk-precall.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateCrewCost } from '../apa-uk/calculator'
import { APA_CREW_ROLES } from '../apa-uk/rates'
import type { CalculationInput } from '../apa-uk/calculator'

function makeInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  const role = APA_CREW_ROLES.find(r => r.role === '1st Assistant Director')!
  return {
    role,
    agreedDailyRate: 532,
    dayType: 'basic_working',
    dayOfWeek: 'monday',
    callTime: '08:00',
    wrapTime: '19:30',
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
    ...overrides,
  }
}

describe('APA UK pre-call individual start', () => {
  it('weekday pre-call: 05:30-08:00 adds 2.5h OT at grade rate', () => {
    const result = calculateCrewCost(makeInput({ preCallStartTime: '05:30' }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    expect(preCallItem!.hours).toBe(2.5)
    // 1st AD: BHR=53, OT coeff=1.25, OT rate=67 (rounded)
    expect(preCallItem!.rate).toBe(67)
    expect(preCallItem!.total).toBe(167.5)
    expect(preCallItem!.timeFrom).toBe('05:30')
    expect(preCallItem!.timeTo).toBe('08:00')
  })

  it('pre-call before 5am splits into triple + OT', () => {
    const result = calculateCrewCost(makeInput({ preCallStartTime: '04:00' }))
    const tripleItem = result.lineItems.find(li => li.description.includes('Pre-call') && li.description.includes('Triple'))
    const otItem = result.lineItems.find(li => li.description.includes('Pre-call') && li.description.includes('Overtime'))
    expect(tripleItem).toBeDefined()
    expect(tripleItem!.hours).toBe(1) // 04:00-05:00
    expect(tripleItem!.rate).toBe(53 * 3) // 3x BHR
    expect(tripleItem!.timeFrom).toBe('04:00')
    expect(tripleItem!.timeTo).toBe('05:00')
    expect(otItem).toBeDefined()
    expect(otItem!.hours).toBe(3) // 05:00-08:00
    expect(otItem!.rate).toBe(67) // OT rate
    expect(otItem!.timeFrom).toBe('05:00')
    expect(otItem!.timeTo).toBe('08:00')
  })

  it('pre-call does NOT affect day length or CWD conversion', () => {
    const withoutPreCall = calculateCrewCost(makeInput())
    const withPreCall = calculateCrewCost(makeInput({ preCallStartTime: '05:30' }))
    // Day description should be the same (not converted to CWD)
    expect(withPreCall.dayDescription).toBe(withoutPreCall.dayDescription)
    // The non-pre-call line items should be identical
    const withoutPreCallItems = withoutPreCall.lineItems
    const withPreCallItems = withPreCall.lineItems.filter(li => !li.description.includes('Pre-call'))
    expect(withPreCallItems.map(i => i.total)).toEqual(withoutPreCallItems.map(i => i.total))
  })

  it('pre-call total is added to grandTotal', () => {
    const without = calculateCrewCost(makeInput())
    const with_ = calculateCrewCost(makeInput({ preCallStartTime: '05:30' }))
    expect(with_.grandTotal).toBe(without.grandTotal + 167.5)
    expect(with_.subtotal).toBe(without.subtotal + 167.5)
  })

  it('no pre-call when preCallStartTime is undefined', () => {
    const result = calculateCrewCost(makeInput())
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })

  it('no pre-call when preCallStartTime equals callTime', () => {
    const result = calculateCrewCost(makeInput({ preCallStartTime: '08:00' }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })

  it('no pre-call when preCallStartTime is after callTime', () => {
    const result = calculateCrewCost(makeInput({ preCallStartTime: '09:00' }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })

  it('saturday pre-call uses 1.5x BHR', () => {
    const result = calculateCrewCost(makeInput({
      preCallStartTime: '06:00',
      dayOfWeek: 'saturday',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    // Saturday OT rate for 1st AD: round(532 * 1.5 / 10) = 80
    expect(preCallItem!.rate).toBe(Math.round(532 * 1.5 / 10))
    expect(preCallItem!.hours).toBe(2) // 06:00-08:00
  })

  it('sunday pre-call uses 2x BHR', () => {
    const result = calculateCrewCost(makeInput({
      preCallStartTime: '06:00',
      dayOfWeek: 'sunday',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    expect(preCallItem!.rate).toBe(53 * 2) // 2x BHR
    expect(preCallItem!.hours).toBe(2) // 06:00-08:00
  })

  it('PM/PA/Runner weekday pre-call uses BHR (not OT grade rate)', () => {
    const pmRole = APA_CREW_ROLES.find(r => r.role === 'Production Manager')!
    const result = calculateCrewCost(makeInput({
      role: pmRole,
      agreedDailyRate: 480,
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    // PM BHR = 480/10 = 48, PM uses BHR for OT (no coefficient)
    expect(preCallItem!.rate).toBe(48)
  })

  it('pre-call on continuous working day still prepends correctly', () => {
    const result = calculateCrewCost(makeInput({
      dayType: 'continuous_working',
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    expect(preCallItem!.hours).toBe(2) // 06:00-08:00
    // First line item should be the pre-call
    expect(result.lineItems[0].description).toContain('Pre-call')
  })

  it('pre-call on prep day works', () => {
    const result = calculateCrewCost(makeInput({
      dayType: 'prep',
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    expect(preCallItem!.hours).toBe(2)
  })

  it('pre-call is NOT added for rest days', () => {
    const result = calculateCrewCost(makeInput({
      dayType: 'rest',
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })

  it('pre-call is NOT added for travel days', () => {
    const result = calculateCrewCost(makeInput({
      dayType: 'travel',
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engines/__tests__/apa-uk-precall.test.ts`
Expected: All tests FAIL (no pre-call logic exists yet)

- [ ] **Step 3: Implement pre-call calculation**

In `src/engines/apa-uk/calculator.ts`, inside `calculateCrewCost()`, add after the `tripleBhr` declaration (line ~163) and before the buyout early-return (line ~166):

```typescript
  // ── Pre-call individual start (APA T&Cs Section 2.1.3/2.2.3 note) ──
  // An individual starting before the unit call is paid for pre-call hours separately.
  // Their basic working day still starts at the call time.
  const preCallLineItems: CalculationLineItem[] = [];
  const preCallDayTypes: DayType[] = ['basic_working', 'continuous_working', 'prep', 'recce', 'build_strike', 'pre_light'];
  if (input.preCallStartTime && preCallDayTypes.includes(dayType)) {
    const preCallMins = timeToMinutes(input.preCallStartTime);
    const callMins = timeToMinutes(callTime);
    const preCallDuration = callMins - preCallMins;

    if (preCallDuration > 0) {
      const fiveAmMins = 5 * 60;

      // Determine pre-call OT rate based on day of week and role
      let preCallOtRate: number;
      if (isSundayOrBH) {
        preCallOtRate = bhr * 2;
      } else if (isSaturday) {
        preCallOtRate = Math.round(bdr * 1.5 / 10);
      } else {
        preCallOtRate = isPMPARunner ? bhr : otRate;
      }

      if (preCallMins < fiveAmMins) {
        // Split: triple time before 5am, OT rate from 5am to call
        const tripleHours = (Math.min(fiveAmMins, callMins) - preCallMins) / 60;
        preCallLineItems.push({
          description: 'Pre-call Triple Time (before 05:00)',
          hours: tripleHours,
          rate: tripleBhr,
          total: tripleHours * tripleBhr,
          timeFrom: input.preCallStartTime,
          timeTo: '05:00',
        });

        if (callMins > fiveAmMins) {
          const otHours = (callMins - fiveAmMins) / 60;
          preCallLineItems.push({
            description: 'Pre-call Overtime (05:00 to call)',
            hours: otHours,
            rate: preCallOtRate,
            total: otHours * preCallOtRate,
            timeFrom: '05:00',
            timeTo: callTime,
          });
        }
      } else {
        // All pre-call hours are at OT rate (start is at or after 5am)
        const preCallHours = preCallDuration / 60;
        preCallLineItems.push({
          description: `Pre-call Overtime (${input.preCallStartTime} to call)`,
          hours: preCallHours,
          rate: preCallOtRate,
          total: preCallHours * preCallOtRate,
          timeFrom: input.preCallStartTime,
          timeTo: callTime,
        });
      }
    }
  }
```

Then, at the end of `calculateCrewCost()`, just before the `return` statement (line ~753), prepend the pre-call items and adjust totals:

```typescript
  // Prepend pre-call line items and adjust totals
  if (preCallLineItems.length > 0) {
    lineItems.unshift(...preCallLineItems);
    const preCallTotal = preCallLineItems.reduce((sum, li) => sum + li.total, 0);
    subtotal += preCallTotal;
    grandTotal += preCallTotal;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engines/__tests__/apa-uk-precall.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add src/engines/apa-uk/calculator.ts src/engines/__tests__/apa-uk-precall.test.ts
git commit -m "feat(engine): implement pre-call individual start calculation with tests"
```

---

### Task 3: Add pre-call UI to CalculatorPage

**Files:**
- Modify: `src/pages/CalculatorPage.tsx`

- [ ] **Step 1: Add state variables**

In `src/pages/CalculatorPage.tsx`, after the `continuousAdditionalBreakGiven` state declaration (line ~469), add:

```typescript
const [preCallEnabled, setPreCallEnabled] = useState(false);
const [preCallStartTime, setPreCallStartTime] = useState('');
```

- [ ] **Step 2: Add pre-call checkbox + time picker UI**

After the closing `</div>` of the call/wrap time grid (line ~1661, right before `<Separator />`), add:

```typescript
            {/* Pre-call start (UK-APA only, not for rest/travel days) */}
            {activeEngine.meta.id === 'apa-uk' && dayType !== 'rest' && dayType !== 'travel' && (
              <div className="border-t border-border/40 pt-3 mt-1">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="preCallStart"
                    checked={preCallEnabled}
                    onCheckedChange={v => {
                      const enabled = !!v;
                      setPreCallEnabled(enabled);
                      if (enabled && !preCallStartTime) {
                        setPreCallStartTime(addHoursToTime(callTime, -1));
                      }
                    }}
                  />
                  <Label htmlFor="preCallStart" className={cn('text-sm font-medium', !preCallEnabled && 'text-muted-foreground')}>
                    Pre-call start
                  </Label>
                </div>
                {preCallEnabled && (
                  <div className="ml-7 mt-2">
                    <TimePicker
                      label="Individual Start"
                      value={preCallStartTime || addHoursToTime(callTime, -1)}
                      onChange={(v) => {
                        const startMins = parseInt(v.split(':')[0]) * 60 + parseInt(v.split(':')[1]);
                        const callMins = parseInt(callTime.split(':')[0]) * 60 + parseInt(callTime.split(':')[1]);
                        if (startMins >= callMins) {
                          setPreCallEnabled(false);
                          setPreCallStartTime('');
                        } else {
                          setPreCallStartTime(v);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 3: Pass preCallStartTime to the engine**

In the `useMemo` block that builds the engine input (line ~860-888), add `preCallStartTime` to the input object after `equipmentDiscount`:

```typescript
preCallStartTime: preCallEnabled ? preCallStartTime : undefined,
```

Also add `preCallEnabled` and `preCallStartTime` to the dependency array of the `useMemo` (line ~888).

- [ ] **Step 4: Reset pre-call when day type changes to rest/travel**

In `handleDayTypeChange` (line ~940-947), add:

```typescript
if (newType === 'rest' || newType === 'travel') {
  setPreCallEnabled(false);
  setPreCallStartTime('');
}
```

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Manual test in browser**

Run: `npm run dev`
Verify:
1. Pre-call checkbox appears below call/wrap times for Basic Working Day
2. Checking it reveals the Individual Start time picker defaulting to 1hr before call
3. Setting Individual Start to 05:30 with call at 08:00 shows "Pre-call Overtime" in breakdown
4. Checkbox does NOT appear for Rest Day or Travel Day
5. Switching engine to non-APA-UK hides the checkbox

- [ ] **Step 7: Commit**

```bash
git add src/pages/CalculatorPage.tsx
git commit -m "feat(ui): add pre-call start checkbox and time picker to calculator"
```

---

### Task 4: Persist pre-call data to database

**Files:**
- Create: `supabase/migrations/20260418120000_add_pre_call_start_time.sql`
- Modify: `src/pages/CalculatorPage.tsx` (save/load logic)

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260418120000_add_pre_call_start_time.sql`:

```sql
-- Add pre-call individual start time to project_days
ALTER TABLE project_days
ADD COLUMN IF NOT EXISTS pre_call_start_time TEXT DEFAULT NULL;
```

- [ ] **Step 2: Run migration against Supabase**

Run the migration via the Supabase dashboard or CLI:
```bash
npx supabase db push
```
If using remote Supabase directly, run the SQL in the SQL Editor.

- [ ] **Step 3: Add to FullProjectDay interface**

In `src/pages/CalculatorPage.tsx`, add to the `FullProjectDay` interface (after `is_bank_holiday` on line ~243):

```typescript
pre_call_start_time: string | null;
```

- [ ] **Step 4: Add to save payload**

In the `handleSave` function, add to the `payload` object (after `is_bank_holiday` on line ~1178):

```typescript
pre_call_start_time: preCallEnabled ? preCallStartTime : null,
```

- [ ] **Step 5: Add to loadDayIntoForm**

In `loadDayIntoForm` (after the `setPreviousWrap` line ~986), add:

```typescript
if (day.pre_call_start_time) {
  setPreCallEnabled(true);
  setPreCallStartTime(day.pre_call_start_time);
} else {
  setPreCallEnabled(false);
  setPreCallStartTime('');
}
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Manual test**

1. Set pre-call start to 05:30, save the day
2. Navigate away, come back -- pre-call checkbox should be checked with 05:30
3. Uncheck pre-call, save -- column should be null
4. Reload page, verify pre-call is unchecked

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260418120000_add_pre_call_start_time.sql src/pages/CalculatorPage.tsx
git commit -m "feat(db): persist pre-call start time to project_days"
```

---

### Task 5: Run full verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: End-to-end manual verification**

Open the app, select UK-APA engine:

1. **Weekday pre-call:** 1st AD, £532/day, call 08:00, wrap 19:30, pre-call 05:30
   - Expected: Pre-call Overtime line item: 2.5h x £67 = £167.50
   - Day total should be £167.50 more than without pre-call

2. **Pre-call before 5am:** Same setup, pre-call 04:00
   - Expected: Pre-call Triple Time: 1h x £159 = £159.00, Pre-call Overtime: 3h x £67 = £201.00

3. **Saturday pre-call:** Same setup, Saturday, pre-call 06:00
   - Expected: Pre-call rate = round(532 * 1.5 / 10) = £80/hr

4. **CWD conversion:** Call 08:00, no first break given, pre-call 05:30
   - Day should convert to CWD, but pre-call line items remain unchanged

5. **Save/load:** Save a day with pre-call, navigate away, return -- values restored

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```
