# Add Engine Checklist

Reference this document when starting work on any new calculator engine.
Work through each section in order — answer every question before writing code.

---

## 1. Deal Memo / Rate Card

- [ ] What is the engine's formal name? (shown in the UI, e.g. "UK APA T&Cs (2025)")
- [ ] What short name is used in the engine badge? (e.g. "APA UK", "SDYM-BE")
- [ ] What country does this engine serve? (ISO 3166-1 alpha-2, e.g. GB, BE, NL)
- [ ] What currency? (ISO 4217 code + symbol, e.g. GBP / £, EUR / €)
- [ ] What mileage unit — miles or km?
- [ ] Is this engine scoped to a specific domain? (e.g. crewdock.be — leave blank for the default domain)
- [ ] Attach or link the deal memo / rate card PDF to `docs/reference/`

---

## 2. Roles & Departments

- [ ] List every crew role in the deal memo with its department grouping
- [ ] For each role: what is the base day rate? Is there an hourly rate? An OT rate?
- [ ] Are there roles without overtime (buyout roles)?
- [ ] Are there flat rates for special day types (Saturday, Sunday/PH, recce, travel)?
- [ ] Does the engine derive its own rates (no user input required), or does the user enter an agreed rate?

---

## 3. Day Types

- [ ] List every day type in the deal memo (e.g. Basic Working Day, Travel Day, Prep Day, Recce, Build/Strike)
- [ ] For each day type: what is the default wrap time (if any)?
- [ ] Are there day types that change the overtime calculation (e.g. Continuous Working Day)?

---

## 4. Feature Flags

Answer yes/no for each flag — these go directly into `meta.ts`:

| Flag | Question | Answer |
|------|----------|--------|
| `agreedRateInput` | Does the user enter an agreed day rate, or does the engine derive it from the deal memo? (yes = user enters it) | |
| `bhrOtInfo` | Are there Basic Hourly Rate and OT grade details to show under the role picker? | |
| `breaksAndPenalties` | Does the deal memo include break rules with penalties for missed/curtailed breaks? | |
| `mileage` | Does the deal memo include mileage reimbursement (distance-based, not just travel time)? | |
| `equipmentTransport` | Does the deal memo adjust the km/mile rate when the crew member transports equipment? | |
| `favourites` | Does this engine have enough roles that a favourites shortcut is useful? (5+ roles = yes) | |
| `tocWarning` | Does the deal memo include a minimum rest period between wrap and next call? | |
| `callTypeBadges` | Does the deal memo define named call types (early call, late call, all-night call)? | |

---

## 5. Travel & Mileage Rules

- [ ] Is travel time paid? At what rate?
- [ ] Is mileage paid? At what rate per mile/km?
- [ ] Is there a base location / zone boundary (e.g. M25 for APA-UK)?
- [ ] Does carrying equipment change the mileage rate?

---

## 6. Files to Create

```
src/engines/<engine-id>/
  meta.ts          ← id, name, shortName, country, currency, currencySymbol, mileageUnit, domain?, features
  rates.ts         ← role definitions, flat rates, department helpers
  day-types.ts     ← day type list with labels and default wrap times
  calculator.ts    ← calculate() function implementing deal memo rules
  index.ts         ← assembles and exports the CalculatorEngine object
```

---

## 7. Files to Modify

- [ ] `src/engines/index.ts` — add the country → engine ID mapping in `countryEngineMap`
- [ ] `src/main.tsx` — import and register the new engine via `registerEngine()`
- [ ] `src/lib/detectSignupCountry.ts` (if exists) — verify country detection covers this engine's country

---

## 8. Tests

- [ ] Create `src/engines/__tests__/<engine-id>.test.ts`
- [ ] Cover at least: basic working day, travel day, overtime, any flat-rate day types
- [ ] Run `npm test` — all tests pass before merging

---

## 9. Pre-launch Checklist

- [ ] Engine renders correctly in the calculator UI
- [ ] Correct features show/hide based on feature flags
- [ ] Engine badge shows the correct short name next to the job name
- [ ] Saving and reloading a day retains the correct engine (does not switch)
- [ ] If domain-scoped: engine auto-selects on the correct domain
- [ ] Currency symbol is correct throughout (calculator, invoice, projects, history pages)
- [ ] Invoice page works with the new engine's line items
