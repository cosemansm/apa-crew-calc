# Pre-Call Individual Start (UK-APA Engine)

## Problem

When a crew member starts work before the main unit call (e.g. van pickup at 05:30, unit call at 08:00), the calculator has no way to capture these pre-call hours. Users must either enter the individual's start as the call time (incorrectly shifting all CWD/break clocks forward) or lose the pre-call overtime entirely.

## APA T&C Basis

**Section 2, N.B. (page 3):** "Unit Call is a call time when the day officially starts however some departments may commence work prior to the unit call; a department call time is when the whole of the department starts, not an individual e.g. generator driver that may have to collect equipment earlier. (All references to call time throughout the document are references to the unit call times.)"

**Section 2.1.3 / 2.2.3 note:** An individual who commences work earlier than their department call is paid for the hours worked prior to their department call time. Their basic working day starts at their department's call time. If they start before 5am, they are paid at triple hourly rate up to 5am and overtime rate from 5am to department call.

**Section 6.2 (page 10):** "If the first meal break does not commence within 6 1/2 hours of main unit call the day becomes a Continuous Working Day." -- This confirms CWD conversion is measured from the unit call, not the individual's start.

## Solution

Add an optional "Pre-call start" checkbox to the UK-APA calculator. When checked, a time picker appears for the individual's actual start time. Pre-call hours are calculated as separate line items; all existing day-length, CWD, and break calculations remain anchored to the call time.

## Scope

- UK-APA engine only
- Applies to all day types that have a call time (basic working, continuous working, prep, recce, build & strike, pre-light)
- Does NOT apply to travel days or rest days

## UI Changes

### CalculatorPage.tsx

A "Pre-call start" checkbox appears below the Call Time / Wrap Time row, inside the same section but separated by a subtle border-top. Matches the existing checkbox pattern used for breaks/penalties.

**Unchecked (default):** Single line -- empty checkbox + "Pre-call start" label in muted text.

**Checked:** Checkbox fills with brand yellow. Below it (indented 28px), a TimePicker labelled "Individual Start" appears with a default value of 1 hour before the current call time. The time picker uses the same component and styling as the existing Call/Wrap pickers, with the yellow border highlight.

**Validation:** Individual start must be before call time. If the user sets it to the same time or later, uncheck the box automatically and clear the value.

**State:** Two new state variables:
- `preCallEnabled: boolean` (default false)
- `preCallStartTime: string` (default '', set to 1hr before call when first enabled)

These values are included when saving a day to the database (`project_days` row) via the existing `extra` JSON field.

## Engine Changes

### types.ts

Add to `EngineCalculationInput`:
```typescript
preCallStartTime?: string;  // Individual start time before call (e.g. "05:30")
```

### calculator.ts

When `preCallStartTime` is set and is before `callTime`:

1. Calculate pre-call duration in hours: `callMins - preCallStartMins` (in minutes, converted)
2. Split into rate bands:
   - Hours before 05:00 -- triple hourly rate (3x BHR)
   - Hours from 05:00 (or preCallStartTime if after 05:00) to callTime -- overtime rate (OT rate per grade)
3. Prepend these as line items at the top of the `lineItems` array, before the existing day calculation
4. Add the pre-call total to `subtotal` and `grandTotal`

**No other changes to the engine.** Day length, CWD conversion, break entitlements, OT thresholds -- all remain calculated from `callTime` exactly as they are today.

### Rate logic by day of week

Pre-call hours use the same rate multipliers as the early call rules already in the engine:
- **Weekday:** OT rate (BHR x OT coefficient), triple before 5am
- **Saturday:** 1.5x BHR for OT portion, triple before 5am
- **Sunday/BH:** 2x BHR for OT portion, triple before 5am

This mirrors sections 2.1.3 and 2.2.3 rate tables.

### PM/PA/Runner handling

Per the T&Cs, PM/PA/Runner special rules apply to early call rates too. The pre-call calculation should use the same rate logic that `callType === 'early'` uses for PM/PA/Runners in the existing code.

## Breakdown Display

Pre-call line items appear at the top of the cost breakdown card:

```
Pre-call Overtime          05:30-08:00 · £67 x 2.5     £167.50
Basic Daily Rate           08:00-19:00 · £532 x 1      £532.00
Overtime                   19:00-19:30 · £67 x 0.5      £33.50
```

If the pre-call spans before 5am (e.g. start at 04:00, call at 08:00):

```
Pre-call Triple Time       04:00-05:00 · £159 x 1      £159.00
Pre-call Overtime          05:00-08:00 · £67 x 3        £201.00
Basic Daily Rate           08:00-19:00 · £532 x 1      £532.00
```

## Database / Persistence

Pre-call data is stored in the existing `extra` JSON column on `project_days`:

```json
{
  "preCallEnabled": true,
  "preCallStartTime": "05:30"
}
```

No migration needed -- `extra` is already a JSONB column.

## Edge Cases

1. **Pre-call start equals call time:** Treated as no pre-call. Checkbox auto-unchecks.
2. **Pre-call start after call time:** Invalid. Checkbox auto-unchecks.
3. **Pre-call start before midnight (previous day):** Not supported in this iteration. The time picker only handles same-day times before call. This is an extremely rare edge case.
4. **Day converts to CWD:** Pre-call hours are unaffected by the conversion. They remain as separate line items. The CWD 9-hour clock starts at call time regardless.
5. **Early call day (call between 5am-7am) with pre-call:** The pre-call covers hours before the call time. The existing early call logic then handles 5am-7am as it does today. If the pre-call start is before 5am, the pre-call triple-time covers up to 5am, and pre-call OT covers 5am to call time.
6. **Night call / late call with pre-call:** Pre-call still calculates the gap between individual start and call time at the appropriate rates.
