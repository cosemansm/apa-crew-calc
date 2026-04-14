# Claude Code Prompt — Multi-Engine Calculator Refactor

> Paste this entire file as your prompt to Claude Code.
> It contains: the goal, the product context, design decisions, the Belgian deal memo data, the full implementation plan, and constraints.
> The detailed phase-by-phase plan lives in `docs/planning/multi-engine-plan.md` — read that file and follow it step by step.

---

## What we're building

CrewDock is a crew cost calculator for the film/commercials industry. It currently runs a single calculator engine hardcoded to the UK APA (Advertising Producers' Association) terms and conditions. We're refactoring it to support **multiple calculator engines** — different countries, different T&Cs, different deal memos — behind a shared abstraction layer.

The first two engines are:
1. **APA UK** (existing) — the current calculator, moved into a new folder structure
2. **Belgian Sodyum Deal Memo** (new) — a structurally different calculation system for Belgian commercials

These are **not** "same logic, different numbers." The two engines have fundamentally different OT models, day type structures, rate systems, and currency. They need to be fully independent implementations behind a shared TypeScript interface.

---

## Product context and design intent

This is a tool built primarily for the UK market. The multi-engine support is being added because:
- The owner personally works in Belgium and wants to use the Belgian deal memo for those jobs
- Belgian colleagues want access with their own T&Cs
- The `crewdock.be` domain has been purchased (should 301-redirect to `crewdock.com`)

**The multi-engine feature should be subtle, not marketed.** It's a utility, not a selling point. Specifically:
- Don't add splash screens, feature announcements, or prominent UI about "multi-country support"
- The per-job engine selector should be a small dropdown labelled "T&Cs" in the job creation/edit dialog
- The engine badge on job cards should only show when a job uses a different engine than the user's default (so UK users doing UK work see nothing extra)
- Settings gets a simple "Calculator Engine" dropdown for the global default — that's it

**Two levels of engine selection:**
1. **Global default per user** — set automatically at signup based on detected country (IP geolocation via Vercel headers). If Belgium → Belgian engine. If UK or unknown → APA UK. Changeable in Settings.
2. **Per-job override** — when creating/editing a job, a subtle dropdown lets you pick a different engine for that specific job. New jobs inherit the user's default.

---

## The Belgian Deal Memo (Sodyum 2026) — full reference

This is from `docs/Sodyum Deal Memo 2026.pdf`. The engine ID is `sdym-be`.

### Roles (initial scope — two roles only, more will be added later as deal memos arrive)

| Function | Hourly Base Rate | Day Rate (10h + 1h meal) |
|----------|-----------------|-------------------------|
| Gaffer | €54.00 | €594.00 |
| Lighting Assistant | €49.00 | €539.00 |

### Premiums & Surcharges

| Description | Gaffer | Lighting Assistant |
|-------------|--------|--------------------|
| Overtime (from 11th hour — 200%) | €108.00/hr | €98.00/hr |
| Night hours (22:00–06:00) additive surcharge | +€54.00/hr | +€49.00/hr |
| Journée continue (continuous workday) | €54.00/hr | €49.00/hr |
| Saturday / 6th consecutive day (150%) — 10h+1h meal | €891.00 | €808.50 |
| Sunday / Public Holiday (200%) — 10h+1h meal | €1,188.00 | €1,078.00 |
| Recce / Preparation day | €500.00 | — (not available) |
| Travel day | €450.00 | €410.00 |
| Mileage (own transport) | €0.43/km | €0.43/km |
| Mileage (own transport with equipment) | €0.80/km | €0.80/km |

### Key calculation rules

- **Standard day** = 10 working hours + 1 hour meal break. Day rate covers this.
- **Overtime** starts from the 11th working hour at 200% of the base hourly rate. This is a **fixed absolute rate** (€108 for Gaffer, €98 for LA) — it does NOT flex with an agreed rate. This is fundamentally different from APA's BHR × coefficient model.
- **Journée continue** applies if: no hot meal is provided, meal break < 60 minutes, or lunch is scheduled more than 6 hours after start of workday. When journée continue applies, overtime starts from the **10th working hour** instead of the 11th.
- **Night surcharge** (22:00–06:00): the full hourly base rate is added on top of whatever else applies. This is **additive/stacking**, not a multiplier. If someone is working OT during night hours, they get the OT rate PLUS the night surcharge.
- **Saturday / 6th consecutive day**: flat pre-calculated day rate at 150% (€891 / €808.50 for 10h+1h meal).
- **Sunday / Public Holiday**: flat pre-calculated day rate at 200% (€1,188 / €1,078 for 10h+1h meal).
- **Recce / Preparation day**: flat fee €500 (Gaffer only; not available for Lighting Assistant).
- **Travel day**: flat fee €450 (Gaffer) / €410 (Lighting Assistant).
- **Mileage**: two tiers — €0.43/km standard, €0.80/km when transporting equipment.
- **Working time**: calculated from truck/van base to base, including loading and unloading.
- **Cancellation fees**: ≤24h before call = 100% of agreed fees; 24–48h = 50%.
- **Payment terms**: 30 calendar days. Late = 15% surcharge + 1%/month interest.
- **Currency**: EUR (€). **Mileage unit**: km.

### Key structural differences from APA UK

| Aspect | APA UK | Belgian Sodyum |
|--------|--------|---------------|
| OT model | BHR (rate÷10) × grade coefficient (1.0/1.25/1.5) | Fixed absolute rate (200% of base hourly) |
| OT trigger | From 10th hr (basic) or 9th hr (continuous) | From 11th hr (standard) or 10th hr (journée continue) |
| Night premium | No separate night surcharge | +hourly rate stacking (22:00–06:00) |
| Saturday | BDR × 1.5 (derived) | Pre-calculated flat rate |
| Sunday/BH | BDR × 2 (derived) | Pre-calculated flat rate |
| Rates | Negotiable ranges (min/max) | Fixed, non-negotiable |
| Mileage | Single tier (£0.45/mile post-M25) | Two tiers (€0.43/km or €0.80/km with equipment) |
| Currency | GBP (£) | EUR (€) |
| Distance | Miles | Kilometres |

---

## How to implement

Read and follow `docs/planning/multi-engine-plan.md` — it contains the full 8-phase implementation plan with:
- Phase 1: Engine abstraction interface (TypeScript types)
- Phase 2: Migrate existing APA code into `src/engines/apa-uk/` (zero behaviour change)
- Phase 3: Build Belgian engine in `src/engines/sdym-be/`
- Phase 4: Database schema changes (Supabase migration)
- Phase 5: React Engine Context and hooks
- Phase 6: UI changes (Settings, Projects, Calculator, Invoices)
- Phase 7: Signup country detection
- Phase 8: Verification and testing

**Execute phases in order. Each phase should be a separate commit. Run `npm run build` after each phase to verify zero breakage.**

---

## Critical constraints

1. **ZERO REGRESSION on APA UK.** After Phase 2, the existing calculator must produce byte-identical results. Don't touch the `calculateCrewCost` function body — only move it and add a wrapper.

2. **The Belgian engine is real, not a stub.** It must calculate correctly per the deal memo above. Verify with: Gaffer, standard day Mon, call 08:00, wrap 20:00 → €594 + 1h OT (€108) = €702 grand total (excluding mileage/equipment).

3. **Currency symbols must never be hardcoded after refactoring.** Always use `engine.meta.currencySymbol`. Search for hardcoded `£` in Calculator, Invoice, and Settings pages and replace all of them.

4. **Keep multi-engine UI subtle.** The job engine selector is a small dropdown labelled "T&Cs". No flags, no splash. Only show the engine badge on a job card if it differs from the user's default.

5. **Engine-specific UI uses simple conditionals.** `engine.meta.id === 'apa-uk'` for APA-only elements, `engine.meta.id === 'sdym-be'` for Belgian-only elements. Don't over-engineer a component slot system yet.

6. **Old import paths must keep working.** `src/data/apa-rates.ts` and `src/data/calculation-engine.ts` become thin re-export shims pointing to the new engine location. Every existing import in the codebase continues to resolve.

7. **`npm run build` must pass after every phase.** No test suite exists, so the build is your verification gate.

---

## Quick start

```bash
# Read the project context
cat AGENTS.md

# Read the detailed implementation plan
cat docs/planning/multi-engine-plan.md

# Start with Phase 1
# Create src/engines/types.ts and src/engines/index.ts
```
