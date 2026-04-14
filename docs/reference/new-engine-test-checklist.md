# New Engine Test Checklist

Run through this after adding any new calculator engine. Covers automated tests, UI smoke tests, and cross-engine isolation.

---

## 1. Automated Tests

### 1a. Engine unit tests — `src/engines/__tests__/<engine-id>.test.ts`

Write one test per scenario. Cover at minimum:

- [ ] Basic/standard working day — no OT (boundary: exactly at OT threshold, no OT fires)
- [ ] Basic/standard working day — with OT (1+ hours of OT, correct rate applied)
- [ ] OT rounding — fractional OT rounds up to nearest 0.5 hr (if applicable)
- [ ] Each flat-rate day type (Saturday, Sunday/PH, Travel, Recce, etc.)
- [ ] Night surcharge or post-midnight rate (if the deal memo has one)
- [ ] Mileage — with and without equipment transport uplift (if applicable)
- [ ] Role-specific restriction — e.g. a day type only available to one role throws for others
- [ ] All roles in the engine have a complete rate record (no undefined rates)

### 1b. Cross-engine isolation — `src/engines/__tests__/engine-switch.test.ts`

Add to the existing file for each new engine:

- [ ] New engine throws on each APA-specific day type: `prep`, `build_strike`, `pre_light`, `basic_working`, `continuous_working`
- [ ] New engine throws on each day type from every other existing engine that is not in its own day type list
- [ ] `getRole()` returns `undefined` for roles that belong to a different engine
- [ ] New engine's day type values do not overlap with other engines' exclusive day types

### 1c. Registry tests — `src/engines/__tests__/registry.test.ts`

- [ ] New country code maps to the new engine ID via `getEngineForCountry()`
- [ ] Existing country mappings are unchanged (no regression)

### 1d. Run the full suite

```
npm test
```

All tests must pass before merging.

---

## 2. UI Smoke Tests

Work through these manually in the browser after deploying to staging/preview.

### 2a. Calculator page — new job

- [ ] Engine selector shows the new engine's name in the dropdown (if multi-engine is enabled)
- [ ] Selecting the new engine changes the day type list to only show that engine's day types
- [ ] APA-specific day types (prep, build/strike, pre-light) are not visible in the new engine's list
- [ ] The role picker shows only the new engine's roles, grouped by department
- [ ] Agreed rate input appears/disappears correctly per the engine's `agreedRateInput` feature flag
- [ ] Breaks and penalties section appears/disappears correctly per `breaksAndPenalties`
- [ ] Mileage section appears/disappears correctly per `mileage`
- [ ] Equipment transport option appears/disappears correctly per `equipmentTransport`
- [ ] Calculation result appears and the total looks correct against the deal memo

### 2b. Calculator page — engine switch mid-job

- [ ] Switching from APA-UK to the new engine: APA-specific day types reset to the new engine's first day type
- [ ] Switching from the new engine to APA-UK: new engine's day types that are not in APA-UK reset correctly
- [ ] After switching, any roles entered that do not exist in the new engine are cleared
- [ ] The form does not show a blank/broken result or throw a visible error during or after the switch
- [ ] The engine badge updates immediately on switch

### 2c. Saving and reloading

- [ ] Save a day with the new engine selected — the saved day appears in the project history
- [ ] Reload the project (navigate away and back) — the correct engine is restored, not defaulting to APA-UK
- [ ] All saved line items and totals are preserved correctly
- [ ] The engine badge next to the project name reflects the saved engine

### 2d. Jobs / Projects page

- [ ] Engine badge is shown on the project card if the engine is not the default (apa-uk)
- [ ] Opening a project from the jobs page loads the correct engine in the calculator

### 2e. Dashboard — new job creation

- [ ] If the user's default engine is the new engine, creating a job from the dashboard saves the correct `calc_engine`
- [ ] Opening that job opens the calculator with the new engine pre-selected

### 2f. Share page

- [ ] Sharing a job calculated with the new engine generates a valid share link
- [ ] Opening the share link shows the correct engine and line items
- [ ] A user without access to the new engine sees a clear engine-mismatch error, not a crash

---

## 3. Cross-Engine Isolation Checks

- [ ] Loading an APA-UK project does not activate the new engine or change its calculation
- [ ] Loading a new-engine project does not activate APA-UK or any other engine
- [ ] Feature flags specific to the new engine are not visible when APA-UK is active, and vice versa
- [ ] No hardcoded engine IDs (other than `DEFAULT_ENGINE_ID`) introduced in new code — all logic is driven by feature flags or `engine.meta`

---

## 4. Invoice Page

- [ ] Invoice renders correctly for a project saved with the new engine
- [ ] Currency symbol is correct (e.g. € for BE engines, £ for GB)
- [ ] Line items and totals match the calculator output

---

## 5. Reference

- `src/engines/__tests__/` — location for all engine test files
- `docs/planning/add-engine-checklist.md` — implementation checklist (run this before writing code)
- `docs/reference/test-scenarios.md` — full APA-UK calculation scenario reference (use as a template for writing new engine scenarios)
