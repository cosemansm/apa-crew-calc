---
description: CrewDock add-engine workflow — research, plan, implement, and test a new calculator engine end to end
argument-hint: [engine name e.g. "APA UK" or "PACT UK"]
---

You are adding a new calculator engine to the CrewDock codebase. The engine name provided is: $ARGUMENTS

Follow every section below in order. Do not skip steps.

---

## 0. Before Anything Else — Get the Document

Say this to the user:

> "Before I start, please upload the deal memo or terms and conditions document for this engine. This is the PDF or document that defines the crew roles, rates, day types, and overtime rules. I'll read it to extract everything I need before writing any code."

Wait for the user to upload or provide the document. Do not proceed to section 1 until you have it.

---

## 1. Orientation

Read these files so you understand the existing architecture before touching anything:

- `docs/planning/add-engine-checklist.md` — full implementation checklist
- `docs/reference/new-engine-test-checklist.md` — full test checklist (automated + UI)
- `src/engines/sdym-be/` — reference implementation of the second engine
- `src/engines/apa-uk/` — reference implementation of the first engine
- `src/engines/types.ts` — EngineMeta, EngineRole, EngineResult types
- `src/engines/index.ts` — registry, getEngine, getEngineForCountry, DEFAULT_ENGINE_ID

Summarise the engine architecture, how feature flags work, and which files you will need to create and modify.

---

## 2. Research the Document

Read the deal memo or T&C document the user provided.

Answer every question in `docs/planning/add-engine-checklist.md` sections 1–5:

- Engine formal name and short name (for the badge)
- Internal engine ID (lowercase, hyphenated, e.g. `apa-uk`, `sdym-be`) — derive this from the engine name if not provided
- Country (ISO alpha-2), currency (ISO code + symbol), mileage unit
- All crew roles and departments with day rates, hourly rates, OT rates
- All day types with default wrap times
- Feature flags: answer yes/no for each flag in the checklist table
- Travel and mileage rules

Write your answers as a summary block and ask the user to confirm before proceeding to implementation.

---

## 3. Implementation

Use a subagent for implementation. Hand it your confirmed answers from section 2 and the sdym-be engine as a reference implementation.

Files to create:
```
src/engines/<engine-id>/
  meta.ts
  rates.ts
  day-types.ts
  calculator.ts
  index.ts
```

Files to modify:
- `src/engines/index.ts` — add country → engine ID mapping
- `src/main.tsx` — import and register the engine

---

## 4. Automated Tests

Create `src/engines/__tests__/<engine-id>.test.ts`.

Cover every item in `docs/reference/new-engine-test-checklist.md` section 1a:
- Basic/standard working day — no OT
- Basic/standard working day — with OT
- OT rounding (if applicable)
- Each flat-rate day type
- Night surcharge / post-midnight rate (if applicable)
- Mileage with and without equipment uplift (if applicable)
- Role-specific restrictions
- All roles have complete rate records

Then update `src/engines/__tests__/engine-switch.test.ts`:
- New engine throws on each APA-only day type: `prep`, `build_strike`, `pre_light`, `basic_working`, `continuous_working`
- New engine throws on day types from every other existing engine not in its own list
- `getRole()` returns `undefined` for roles belonging to other engines
- New engine's day type values do not overlap with other engines' exclusive types

Then update `src/engines/__tests__/registry.test.ts`:
- New country code maps to the new engine ID via `getEngineForCountry()`
- Existing mappings are unchanged

Run the full test suite:
```
npm test
```

All tests must pass before continuing.

---

## 5. UI Smoke Test Checklist

Work through every item in `docs/reference/new-engine-test-checklist.md` sections 2–4 manually with the user. Check off each item:

**Calculator — new job:**
- Engine appears in the selector
- Day type list shows only this engine's day types
- APA day types (prep, build/strike, pre-light) are absent
- Role picker shows only this engine's roles
- Feature-flag-gated sections appear/disappear correctly
- Calculation result is correct against the deal memo

**Calculator — engine switch mid-job:**
- Switching from APA-UK to new engine: APA day types reset, incompatible roles cleared
- Switching from new engine to APA-UK: new engine day types reset
- No visible error or blank crash during or after switch

**Save and reload:**
- Saved day reloads with correct engine (does not revert to apa-uk)
- All line items and totals preserved

**Jobs page, Dashboard, Share page:**
- Engine badge shows on non-default projects
- Dashboard creates job with correct engine
- Share link works; engine-mismatch error shown to users without access

**Invoice page:**
- Currency symbol correct
- Line items and totals match calculator

---

## 6. Final Checks

- [ ] No hardcoded engine IDs introduced (all logic driven by feature flags or `engine.meta`)
- [ ] Loading an APA-UK project does not activate the new engine
- [ ] Loading a new-engine project does not activate APA-UK
- [ ] `npm test` passes (run one final time)
- [ ] Commit all changes

---

## Reference Files

| File | Purpose |
|------|---------|
| `docs/planning/add-engine-checklist.md` | Pre-code research questions |
| `docs/reference/new-engine-test-checklist.md` | Full test checklist |
| `docs/reference/test-scenarios.md` | APA-UK scenario reference (template for new scenarios) |
| `src/engines/sdym-be/` | Second engine reference implementation |
| `src/engines/__tests__/engine-switch.test.ts` | Cross-engine isolation tests to extend |
