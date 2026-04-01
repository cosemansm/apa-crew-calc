# APA Crew Calculator — Test Scenarios

Full reference covering every code path in the calculation engine.
Based on APA Recommended Terms for Crews on Commercials 2025.

**Reference roles used throughout:**

| Alias | Role | BDR | BHR | OT Rate | Grade | Notes |
|---|---|---|---|---|---|---|
| LT | Lighting Technician | £444 | £44 | £67 (custom) | I (1.5×) | customOtRate |
| CM | Construction Manager | £532 | £53 | £66 (1.25×BHR) | II (1.25×) | |
| FP | Focus Puller (1st AC) | £558 | £56 | £70 (1.25×BHR) | II (1.25×) | |
| GA | Gaffer | £568 | £57 | £71 (custom) | II (1.25×) | customOtRate |
| AD | 1st Assistant Director | £785 | £79 | £79 (1.0×BHR) | III (1.0×) | |
| DoP | Director of Photography | £1,516 | £152 | £152 (1.0×BHR) | III (1.0×) | isBasicWorkingNSD |
| PM | Production Manager | £609 | £61 | £76 (1.25×BHR) | II (1.25×) | isPMPARunner |
| RU | Production Runner | £238 | £24 | £36 (1.5×BHR) | I (1.5×) | isPMPARunner |

> **3× BHR (after-midnight triple time):** LT = £132, CM = £159, FP = £168, GA = £171, AD = £237, DoP = £456

---

## 1. Basic Working Day — Standard Weekday Call (S.2.1.1)

### T-001 — Minimum call, no OT, no penalties (clean day)
**Role:** LT (£444 / £44 / OT £67)
**Day:** Monday · Call 08:00 · Wrap 17:00 · dayLength 9.0 hrs
**Breaks:** First break given 13:00, 60 min · Second break N/A (day < 9.5 hrs from first break end)

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £444 | £444 |

Subtotal £444 · Penalties £0 · **Grand total £444**
_APA S.2.1.1 — standard call, no OT triggered (dayLength 9.0 < 11)_

---

### T-002 — Standard call with OT
**Role:** CM (£532 / £53 / OT £66)
**Day:** Wednesday · Call 08:00 · Wrap 21:00 · dayLength 13.0 hrs
**Breaks:** First break 13:00, 60 min · Second break 18:30, 30 min

OT hours = 13.0 − 11 = 2.0 → roundOTHours(2.0) = 2.0
OT = Math.round(2.0 × 66) = £132

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |
| Overtime | 2.0 | £66 | £132 |

Subtotal £664 · **Grand total £664**
_APA S.2.1.1, S.4.2 — OT starts 11 hrs after call (full break given)_

---

### T-003 — OT trigger boundary (exactly 11 hrs — no OT)
**Role:** CM (£532 / £53 / OT £66)
**Day:** Tuesday · Call 08:00 · Wrap 19:00 · dayLength 11.0 hrs
**Breaks:** First break given 13:00, 60 min

OT hours = 11.0 − 11 = 0.0 → no OT

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |

Subtotal £532 · **Grand total £532**
_APA S.2.1.1 — exactly at OT boundary; OT does not fire_

---

### T-004 — OT rounding: 7 minutes → rounds up to 0.5 hr
**Role:** CM (£532 / £53 / OT £66)
**Day:** Thursday · Call 08:00 · Wrap 19:07 · dayLength 11.117 hrs

OT hours = 0.117 → ceil(0.117 × 2) / 2 = ceil(0.233) / 2 = 1/2 = 0.5 hrs
OT = Math.round(0.5 × 66) = £33

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |
| Overtime | 0.5 | £66 | £33 |

Subtotal £565 · **Grand total £565**
_APA S.4.5 — "round up to nearest 30 mins"_

---

### T-005 — OT with after-midnight triple time
**Role:** LT (£444 / £44 / OT £67 / 3×BHR £132)
**Day:** Friday · Call 08:00 · Wrap 02:30 (next day) · dayLength 18.5 hrs
**Breaks:** First break 13:00, 60 min · Second break 19:00, 30 min

OT hours = 18.5 − 11 = 7.5
splitAfterMidnightOT: wrapActual = 150 + 1440 = 1590 min → after midnight = (1590 − 1440) / 60 = 2.5 hrs
midnightOT = min(7.5, 2.5) = 2.5 · regularOT = 5.0
Regular OT = Math.round(5.0 × 67) = £335
Midnight OT = Math.round(2.5 × 132) = £330

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £444 | £444 |
| Overtime | 5.0 | £67 | £335 |
| Overtime After Midnight (3× BHR) | 2.5 | £132 | £330 |

Subtotal £1,109 · **Grand total £1,109**
_APA S.4.4 — hours strictly after midnight charged at 3× BHR_

---

### T-006 — Wrap exactly at midnight (no midnight OT fires)
**Role:** CM (£532 / £53 / OT £66)
**Day:** Tuesday · Call 08:00 · Wrap 00:00 · dayLength 16.0 hrs

wrapActual = 0 + 1440 = 1440 · condition `wrapActual > 1440` → **false** → no midnight OT
OT hours = 16 − 11 = 5.0 · OT = Math.round(5.0 × 66) = £330

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |
| Overtime | 5.0 | £66 | £330 |

Subtotal £862 · **Grand total £862**
_APA S.4.4 — midnight boundary: wrapActual must be STRICTLY > 1440 for triple time_

---

### T-007 — Grade III role (OT coefficient 1.0 = OT at BHR)
**Role:** AD (£785 / £79 / OT £79)
**Day:** Thursday · Call 09:00 · Wrap 23:00 · dayLength 14.0 hrs
**Breaks:** Both given on time

OT = Math.round(3.0 × 79) = £237

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £785 | £785 |
| Overtime | 3.0 | £79 | £237 |

Subtotal £1,022 · **Grand total £1,022**
_APA S.4.3 — Grade III OT = BHR × 1.0_

---

## 2. Basic Working Day — Early Call (S.2.1.3)

> Early call = 05:00–07:00. Pre-7am hours charged at OT rate. OT still triggers 11 hrs after call.

### T-008 — Early call 06:00, no OT beyond 11 hrs
**Role:** CM (£532 / £53 / OT £66)
**Day:** Monday · Call 06:00 · Wrap 17:00 · dayLength 11.0 hrs
**Breaks:** First break 11:00, 60 min

earlyHours = (420 − 360) / 60 = 1.0 hr
earlyOT = Math.round(1.0 × 66) = £66
Day length = 11.0 → OT hours = 11.0 − 11 = 0 → no further OT

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Early Call Overtime (06:00–07:00) | 1.0 | £66 | £66 |
| Basic Daily Rate | 11 | £532 | £532 |

Subtotal £598 · **Grand total £598**
_APA S.2.1.3 — "for hours worked between 5am and 7am… at overtime rate"_

---

### T-009 — Early call 05:30, with OT and after-midnight wrap
**Role:** LT (£444 / £44 / OT £67 / 3×BHR £132)
**Day:** Friday · Call 05:30 · Wrap 01:00 (next day) · dayLength 19.5 hrs
**Breaks:** Both given

earlyHours = (420 − 330) / 60 = 1.5 hrs · earlyOT = Math.round(1.5 × 67) = £101
otStartTime = 05:30 + 11 h = 16:30
OT hours = 19.5 − 11 = 8.5
wrapActual = 60 + 1440 = 1500 → after midnight = (1500 − 1440)/60 = 1.0 hr
midnightOT = 1.0 · regularOT = 7.5
Regular OT = Math.round(7.5 × 67) = £503
Midnight OT = Math.round(1.0 × 132) = £132

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Early Call Overtime (05:30–07:00) | 1.5 | £67 | £101 |
| Basic Daily Rate | 11 | £444 | £444 |
| Overtime | 7.5 | £67 | £503 |
| Overtime After Midnight (3× BHR) | 1.0 | £132 | £132 |

Subtotal £1,180 · **Grand total £1,180**
_APA S.2.1.3, S.4.4_

---

## 3. Basic Working Day — Late Call (S.2.1.4)

> Late call = 11:00–17:00. Day anchored at 11:00 regardless of actual call time. OT after 11 hrs from 11:00 = 22:00.

### T-010 — Late call 13:00, wrap before OT start
**Role:** CM (£532 / £53 / OT £66)
**Day:** Tuesday · Call 13:00 · Wrap 21:00 · actual dayLength 8.0 hrs
**Breaks:** First break given · effectiveLength measured from 11:00 to wrap = 10.0 hrs

effectiveLength = (21:00 − 11:00) = 10.0 hrs · OT hours = max(0, 10.0 − 11) = 0

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate (from 11:00) | 11 | £532 | £532 |

Subtotal £532 · **Grand total £532**
_APA S.2.1.4 — "basic working day starts at 11am… 11 hours total"_

---

### T-011 — Late call 14:00, wrap at 00:30, OT + midnight triple
**Role:** FP (£558 / £56 / OT £70 / 3×BHR £168)
**Day:** Thursday · Call 14:00 · Wrap 00:30 (next day)
effectiveLength from 11:00 to 00:30 = 13.5 hrs
OT hours = max(0, 13.5 − 11) = 2.5
lateOtStart = 11:00 + 11 = 22:00
wrapActual = 30 + 1440 = 1470 → after midnight = (1470 − 1440)/60 = 0.5 hr
midnightOT = min(2.5, 0.5) = 0.5 · regularOT = 2.0
Regular OT = Math.round(2.0 × 70) = £140
Midnight OT = Math.round(0.5 × 168) = £84

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate (from 11:00) | 11 | £558 | £558 |
| Overtime | 2.0 | £70 | £140 |
| Overtime After Midnight (3× BHR) | 0.5 | £168 | £84 |

Subtotal £782 · **Grand total £782**
_APA S.2.1.4, S.4.4_

---

## 4. Basic Working Day — Night Shoot (S.2.1.2)

> Night call = 17:00–05:00 (next day). All hours at 2× BHR. Minimum 10 hrs. 1 hr lunch deducted.

### T-012 — Night shoot 22:00 call, wrap 07:00 (9 hrs → minimum 10 applied)
**Role:** LT (£444 / £44 · nightRate = 44 × 2 = £88)
**Day:** Monday · Call 22:00 · Wrap 07:00 · dayLength 9.0 hrs
nightHours = max(9.0 − 1, 10) = max(8, 10) = **10** (minimum applies)

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Night Shoot (2× BHR) | 10 | £88 | £880 |

Subtotal £880 · **Grand total £880**
_APA S.2.1.2 — minimum 10-hr call; 1-hr lunch deducted_

---

### T-013 — Night shoot 20:00 call, wrap 09:00 (13 hrs → 12 worked)
**Role:** LT (£444 / £44 · nightRate £88)
**Day:** Wednesday · Call 20:00 · Wrap 09:00 · dayLength 13.0 hrs
nightHours = max(13.0 − 1, 10) = max(12, 10) = **12**
Night pay = 12 × £88 = £1,056

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Night Shoot (2× BHR) | 12 | £88 | £1,056 |

Subtotal £1,056 · **Grand total £1,056**
_APA S.2.1.2 — 1-hr lunch deducted from actual hours_

---

### T-014 — Night shoot, PM/PA/Runner (night shoot uses flat BDR, not 2× BHR)
**Role:** PM (£609 / £61)
**Day:** Tuesday · Call 19:00 · Wrap 06:00 · dayLength 11.0 hrs
isPMPARunner = true → night shoot block does NOT use 2× BHR; falls through to PM standard weekday path.
PM weekday: BDR flat + OT after 11 hrs from call.
OT hours = max(0, 11.0 − 11) = 0

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £609 | £609 |

Subtotal £609 · **Grand total £609**
_Night shoot rate (2× BHR) does NOT apply to PM/PA/Runner — they use standard BDR_

---

## 5. Basic Working Day — Saturday (S.2.4(i))

> Non-PM/PA/Runner: 1.5× BHR for all hours, min 10 worked. PM/PA/Runner: 1.5× BDR flat + OT at 1.5× BHR.

### T-015 — Saturday, standard call, no OT (non-PM/PA/Runner)
**Role:** LT (£444 / £44 · satRate = Math.round(44 × 1.5) = Math.round(66) = £66)
**Day:** Saturday · Call 08:00 · Wrap 18:00 · dayLength 10.0 hrs
workedHours = max(10.0 − 1, 10) = max(9, 10) = **10**
Saturday pay = Math.round(10 × 66) = £660

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Saturday (1.5× BHR) | 10 | £66 | £660 |

Subtotal £660 · **Grand total £660**
_APA S.2.4(i) — "1.5× basic daily rate… minimum call of ten hours"_

---

### T-016 — Saturday, early call, with OT (non-PM/PA/Runner)
**Role:** LT (£444 / £44 · satRate £66 · 3×BHR £132)
**Day:** Saturday · Call 06:00 · Wrap 22:00 · dayLength 16.0 hrs
workedHours = max(16.0 − 1, 10) = **15**
splitAfterMidnightOT: wrapActual=1320 < 1440 → regularOT=15, midnightOT=0
Saturday pay = Math.round(15 × 66) = £990

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Saturday (1.5× BHR) | 15 | £66 | £990 |

Subtotal £990 · **Grand total £990**
_APA S.2.4(i), S.4.6 — Saturday OT at 1.5× BHR (same rate as base)_

---

### T-017 — Saturday, PM/PA/Runner, standard call with OT
**Role:** PM (£609 / £61 · pmSatBDR = Math.round(609 × 1.5) = Math.round(913.5) = £914 · pmSatOtRate = Math.round(61 × 1.5) = Math.round(91.5) = £92)
**Day:** Saturday · Call 08:00 · Wrap 21:00 · dayLength 13.0 hrs
workedHours = max(13 − 1, 10) = **12** · pmSatOtStart = 08:00 + 11 = 19:00
OT hours = max(0, 12 − 10) = 2.0 · OT = 2.0 × 92 = £184

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Saturday Basic Daily Rate (1.5× BDR) | 11 | £914 | £914 |
| Overtime (1.5× BHR) | 2.0 | £92 | £184 |

Subtotal £1,098 · **Grand total £1,098**
_APA Appendix 1(a)(ii) — PM/PA/Runner Saturday: flat 1.5× BDR + OT at 1.5× BHR_

---

## 6. Basic Working Day — Sunday / Bank Holiday (S.2.4(ii))

> Non-PM/PA/Runner: 2× BHR for all hours, min 10 worked. PM/PA/Runner: 2× BDR flat + OT at 2× BHR.

### T-018 — Sunday, standard call (non-PM/PA/Runner)
**Role:** CM (£532 / £53 · sunRate = Math.round(53 × 2) = £106)
**Day:** Sunday · Call 09:00 · Wrap 20:00 · dayLength 11.0 hrs
workedHours = max(11.0 − 1, 10) = **10**
Sunday pay = Math.round(10 × 106) = £1,060

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Sunday/BH (2× BHR) | 10 | £106 | £1,060 |

Subtotal £1,060 · **Grand total £1,060**
_APA S.2.4(ii) — "2× basic hourly rate… minimum call of ten hours"_

---

### T-019 — Sunday, PM/PA/Runner, with OT + after midnight
**Role:** RU (£238 / £24 · pmSunBDR = 238 × 2 = £476 · pmSunOtRate = 24 × 2 = £48 · 3×BHR = £72)
**Day:** Sunday · Call 07:00 · Wrap 02:00 (next day) · dayLength 19.0 hrs
workedHours = max(19 − 1, 10) = **18** · pmSunOtStart = 07:00 + 11 = 18:00
OT hours = max(0, 18 − 10) = 8.0
wrapActual = 120 + 1440 = 1560 → after midnight = (1560 − 1440)/60 = 2.0 hrs
midnightOT = min(8.0, 2.0) = 2.0 · regularOT = 6.0
Regular OT = Math.round(6.0 × 48) = £288
Midnight OT = Math.round(2.0 × 72) = £144

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Sunday/BH Basic Daily Rate (2× BDR) | 11 | £476 | £476 |
| Overtime (2× BHR) | 6.0 | £48 | £288 |
| Overtime After Midnight (3× BHR) | 2.0 | £72 | £144 |

Subtotal £908 · **Grand total £908**
_APA Appendix 1(a)(iii) — PM/PA/Runner Sunday: 2× BDR + OT at 2× BHR; triple still applies after midnight_

---

## 7. Continuous Working Day (S.2.2)

> BDR paid for 9-hr block. OT at BHR × coefficient after 9 hrs. No lunch deduction. Standard call = 07:00–11:00.

### T-020 — Standard continuous, no OT
**Role:** AD (£785 / £79 / OT £79)
**Day:** Monday · Call 08:00 · Wrap 17:00 · dayLength 9.0 hrs
OT hours = max(0, 9.0 − 9) = 0

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £785 | £785 |

Subtotal £785 · **Grand total £785**
_APA S.2.2.1_

---

### T-021 — Standard continuous, 4 hrs OT
**Role:** AD (£785 / £79 / OT £79)
**Day:** Tuesday · Call 08:00 · Wrap 21:00 · dayLength 13.0 hrs
OT hours = 13.0 − 9 = 4.0 · OT = Math.round(4.0 × 79) = £316

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £785 | £785 |
| Overtime | 4.0 | £79 | £316 |

Subtotal £1,101 · **Grand total £1,101**
_APA S.2.2.1_

---

### T-022 — Continuous, exactly 9 hrs (no break penalty possible)
**Role:** LT (£444 / £44)
**Day:** Wednesday · Call 08:00 · Wrap 17:00 · dayLength 9.0 hrs
dayLength = 9.0, condition `dayLength > 9` → false → NO break penalty even if continuousFirstBreakGiven=false

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £444 | £444 |

Penalties £0 · **Grand total £444**
_APA S.6.4 — break penalty only when "works in excess of 9 hours"_

---

### T-023 — Continuous, 9.1 hrs, break NOT given (penalty fires)
**Role:** LT (£444 / £44)
**Day:** Thursday · Call 08:00 · Wrap 17:06 · dayLength 9.1 hrs
continuousFirstBreakGiven = false
dayLength > 9 ✓ → 'No 2nd break', 0.5, £44, Math.round(44 × 0.5) = £22
OT hours = 9.1 − 9 = 0.1 → roundOTHours(0.1) = 0.5 · OT = Math.round(0.5 × 67) = £34

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £444 | £444 |
| Overtime | 0.5 | £67 | £34 |

Penalties: No 2nd break £22
Subtotal £478 · Penalties £22 · **Grand total £500**
_APA S.6.4 — "works in excess of 9 hours and no break is given: 30 mins at BHR"_

---

### T-024 — Continuous, 12.5 hrs exactly (additional break NOT triggered — strict boundary)
**Role:** AD (£785 / £79 / OT £79)
**Day:** Monday · Call 08:00 · Wrap 20:30 · dayLength 12.5 hrs
continuousFirstBreakGiven = true
dayLength = 12.5, `dayLength > 12.5` → **false** → no additional break penalty
OT hours = 12.5 − 9 = 3.5 → roundOTHours(3.5) = 3.5 · OT = Math.round(3.5 × 79) = Math.round(276.5) = £277

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £785 | £785 |
| Overtime | 3.5 | £79 | £277 |

Subtotal £1,062 · Penalties £0 · **Grand total £1,062**
_APA S.6.4 — additional break only required at STRICTLY > 12.5 hrs_

---

### T-025 — Continuous, 12.6 hrs, both breaks missed (two penalties)
**Role:** AD (£785 / £79 / OT £79)
**Day:** Tuesday · Call 08:00 · Wrap 20:36 · dayLength 12.6 hrs
continuousFirstBreakGiven = false · continuousAdditionalBreakGiven = false
Penalty 1 (> 9 hrs): 0.5 × £79 = £40 (round(79×0.5)=round(39.5)=£40)
Penalty 2 (> 12.5 hrs): 0.5 × £79 = £40
OT hours = 12.6 − 9 = 3.6 → roundOTHours(3.6) = ceil(7.2)/2 = 8/2 = 4.0
OT = Math.round(4.0 × 79) = £316

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £785 | £785 |
| Overtime | 4.0 | £79 | £316 |

Penalties: No 2nd break £40 · No add'l break £40
Subtotal £1,101 · Penalties £80 · **Grand total £1,181**
_APA S.6.4 — both break penalties stack_

---

### T-026 — Continuous, Night call (2× BDR)
**Role:** GA (£568 / £57 / OT £71 · doubleBDR = 568 × 2 = £1,136 · doubleOtRate = Math.round(57 × 2) = £114)
**Day:** Wednesday · Call 22:00 · Wrap 09:00 · dayLength 11.0 hrs
callType = night (22:00 ≥ 17:00)
OT hours = 11.0 − 9 = 2.0 · OT = Math.round(2.0 × 114) = £228

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Night Continuous Working Day (2× BDR) | 9 | £1,136 | £1,136 |
| Overtime | 2.0 | £114 | £228 |

Subtotal £1,364 · **Grand total £1,364**
_APA S.2.2.2/2.2.5 — "double basic daily rate" for night continuous; OT at 2× BHR_

---

### T-027 — Continuous, Early call (pre-7am OT + BDR)
**Role:** LT (£444 / £44 / OT £67)
**Day:** Thursday · Call 06:00 · Wrap 16:30 · dayLength 10.5 hrs
callType = early
earlyHours = (420 − 360) / 60 = 1.0 · earlyOT = Math.round(1.0 × 67) = £67
contOtStartTime = 06:00 + 9 = 15:00
OT hours = max(0, 10.5 − 9) = 1.5 · OT = Math.round(1.5 × 67) = £101

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Early Call Overtime (06:00–07:00) | 1.0 | £67 | £67 |
| Continuous Working Day (BDR) | 9 | £444 | £444 |
| Overtime | 1.5 | £67 | £101 |

Subtotal £612 · **Grand total £612**
_APA S.2.2.3 — early continuous: OT pre-7am, then BDR from call, OT after 9 hrs_

---

### T-028 — Continuous, Late call (anchored at 11:00)
**Role:** AD (£785 / £79 / OT £79)
**Day:** Monday · Call 13:00 · Wrap 22:30
lateContOtStart = 11:00 + 9 = 20:00
effectiveLength from 11:00 to 22:30 = 11.5 hrs
OT hours = max(0, 11.5 − 9) = 2.5 · OT = Math.round(2.5 × 79) = Math.round(197.5) = £198

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Late Call Continuous Working Day (from 11:00) | 9 | £785 | £785 |
| Overtime | 2.5 | £79 | £198 |

Subtotal £983 · **Grand total £983**
_APA S.2.2.4 — "basic continuous working day starts at 11am… overtime after 9 hrs from 11am" (= 20:00)_

---

### T-029 — Continuous, Saturday (1.5× BDR)
**Role:** GA (£568 / £57 · satBDR = Math.round(568 × 1.5) = Math.round(852) = £852 · satOtRate = Math.round(57 × 1.5) = Math.round(85.5) = £86)
**Day:** Saturday · Call 08:00 · Wrap 20:00 · dayLength 12.0 hrs
OT hours = 12.0 − 9 = 3.0 · OT = Math.round(3.0 × 86) = £258

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Saturday Continuous Working Day (1.5× BDR) | 9 | £852 | £852 |
| Overtime | 3.0 | £86 | £258 |

Subtotal £1,110 · **Grand total £1,110**
_APA S.2.4(v) — "1.5× basic daily rate"; S.4.6 — OT at 1.5× BHR_

---

### T-030 — Continuous, Sunday (2× BDR)
**Role:** FP (£558 / £56 · sunBDR = 558 × 2 = £1,116 · sunOtRate = Math.round(56 × 2) = £112)
**Day:** Sunday · Call 09:00 · Wrap 21:00 · dayLength 12.0 hrs
OT hours = 12.0 − 9 = 3.0 · OT = Math.round(3.0 × 112) = £336

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Sunday/BH Continuous Working Day (2× BDR) | 9 | £1,116 | £1,116 |
| Overtime | 3.0 | £112 | £336 |

Subtotal £1,452 · **Grand total £1,452**
_APA S.2.4(vi) — "2× basic daily rate"; OT at 2× BHR_

---

## 8. Converted to Continuous Working Day (S.6.2)

> Basic day converts to continuous when: (a) no first break given, or (b) first break starts > 6.5 hrs after call. The conversion itself is the consequence — no extra penalty on top.

### T-031 — No break given, converts to continuous
**Role:** CM (£532 / £53 / OT £66)
**Day:** Tuesday · Call 08:00 · Wrap 20:00 · dayLength 12.0 hrs
dayType input = basic_working · firstBreakGiven = **false** → convertedToContinuous = true
continuousFirstBreakGiven = true · continuousAdditionalBreakGiven = true
OT hours = 12.0 − 9 = 3.0 · OT = Math.round(3.0 × 66) = £198
dayDescription = "Continuous Working Day — Standard Call" (not "Converted to…")

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £532 | £532 |
| Overtime | 3.0 | £66 | £198 |

Penalties £0 · **Grand total £730**
_APA S.6.2 — conversion is the only consequence; no additional break penalty_

---

### T-032 — Break given at 6.5 hrs exactly (no conversion — boundary)
**Role:** CM (£532 / £53 / OT £66)
**Day:** Wednesday · Call 08:00 · First break at 14:30 (6.5 hrs after call) · Wrap 19:00
breakAfterCall = 6.5 hrs → condition `breakAfterCall / 60 > 6.5` → **false** (not strictly greater) → **no conversion**
Day stays basic_working. No delay penalty either (> 5.5 to ≤ 6.5 → delay penalty window).
Actually 6.5 ≤ 6.5 so the delay penalty also does NOT fire (> 5.5 AND ≤ 6.5 window: 6.5 is included? Check: `breakAfterHours > 5.5 && breakAfterHours <= 6.5` → 6.5 > 5.5 ✓ AND 6.5 ≤ 6.5 ✓ → **delay penalty DOES fire** for exactly 6.5 hrs).

Correction: breakAfterHours = 6.5 → delay penalty fires (£10), but conversion does NOT (strictly > 6.5 required).

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |

Penalties: First break delayed (£10)
Subtotal £532 · Penalties £10 · **Grand total £542**
_APA S.6.2 — delay window is 5.5 < x ≤ 6.5; conversion requires > 6.5 (strict)_

---

### T-033 — Break given at 7 hrs after call → converts to continuous
**Role:** CM (£532 / £53 / OT £66)
**Day:** Thursday · Call 08:00 · First break at 15:00 (7.0 hrs) · Wrap 21:00 · dayLength 13.0 hrs
breakAfterCall = 7.0 > 6.5 → convertedToContinuous = true
continuousFirstBreakGiven = false · continuousAdditionalBreakGiven = true
OT hours = 13.0 − 9 = 4.0 → roundOTHours = 4.0 · OT = Math.round(4.0 × 66) = £264
No break penalty (continuousFirstBreakGiven = false, but dayLength = 13.0 > 9 → 'No 2nd break')
Wait — dayLength = 13 > 9 and continuousFirstBreakGiven = false → penalty fires: 0.5 × £53 = Math.round(26.5) = £27
dayLength = 13 < 12.5 → no additional break penalty

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £532 | £532 |
| Overtime | 4.0 | £66 | £264 |

Penalties: No 2nd break (£27)
Subtotal £796 · Penalties £27 · **Grand total £823**
_APA S.6.2 + S.6.4 — day converted; then continuousFirstBreakGiven=false means the crew member also missed the 9-hr continuous break_

---

### T-034 — Converted + continues past 12.5 hrs, both continuous breaks missed
**Role:** LT (£444 / £44 / OT £67)
**Day:** Friday · Call 07:30 · firstBreakGiven = false → converts · Wrap 21:15 · dayLength 13.75 hrs
continuousFirstBreakGiven = false · continuousAdditionalBreakGiven = false
OT hours = 13.75 − 9 = 4.75 → roundOTHours(4.75) = ceil(9.5)/2 = 10/2 = 5.0
OT = Math.round(5.0 × 67) = £335
Penalty 1 (> 9 hrs, continuousFirstBreakGiven=false): 0.5 × £44 = £22
Penalty 2 (> 12.5 hrs, continuousAdditionalBreakGiven=false): 0.5 × £44 = £22

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £444 | £444 |
| Overtime | 5.0 | £67 | £335 |

Penalties: No 2nd break £22 · No add'l break £22
Subtotal £779 · Penalties £44 · **Grand total £823**
_APA S.6.2, S.6.4 — conversion + both continuous break penalties_

---

## 9. Break Penalties — Basic Working Day (S.6.1–6.3)

### T-035 — First break delayed (5.5–6.5 hrs window, £10 penalty)
**Role:** FP (£558 / £56 / OT £70)
**Day:** Tuesday · Call 08:00 · First break at 14:00 (6.0 hrs) · Wrap 19:00

breakAfterCall = 6.0 hrs → 5.5 < 6.0 ≤ 6.5 → delay penalty £10

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £558 | £558 |

Penalties: First break delayed £10
**Grand total £568**
_APA S.6.2 — "If Delayed: £10 penalty"_

---

### T-036 — First break on time but curtailed (< 30 min) → OT triggered sooner
**Role:** CM (£532 / £53 / OT £66)
**Day:** Monday · Call 08:00 · First break at 12:30, duration 20 min (curtailment = 40 min) · Wrap 20:00 · dayLength 12.0 hrs

curtailment = 40 min = 0.667 hrs → otStartHours = 11 − 0.667 = 10.333
OT hours = max(0, 12.0 − 10.333) = 1.667 → roundOTHours(1.667) = ceil(3.333)/2 = 4/2 = 2.0
OT = Math.round(2.0 × 66) = £132
Curtailment penalty: 'First break curtailed', 0.5, £53, Math.round(53 × 0.5) = Math.round(26.5) = £27

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |
| Overtime | 2.0 | £66 | £132 |

Penalties: First break curtailed £27
Subtotal £664 · Penalties £27 · **Grand total £691**
_APA S.6.1 — curtailed break triggers earlier OT + penalty_

---

### T-037 — Second break not due (day too short)
**Role:** LT (£444 / £44)
**Day:** Wednesday · Call 08:00 · First break 13:00, 60 min · Wrap 18:30 · dayLength 10.5 hrs

firstBreakEnd = 840 min · secondBreakDue = 840 + 330 = 1170 min = 19:30
wrapAbsMins = 480 + (10.5 × 60) = 1110 min · 1110 < 1170 → second break NOT due

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £444 | £444 |

Penalties £0 · **Grand total £444**
_Second break only required if production would run to or past the due time_

---

### T-038 — Second break missed (due, not given)
**Role:** CM (£532 / £53 / OT £66)
**Day:** Thursday · Call 08:00 · First break 13:00, 60 min (end 14:00) · Second break NOT given · Wrap 20:30 · dayLength 12.5 hrs

secondBreakDue = 840 + 330 = 1170 min · wrapAbsMins = 480 + 750 = 1230 ≥ 1170 → DUE
secondBreakGiven = false → 'Missed 2nd break', 0.5, £53, Math.round(53 × 0.5) = Math.round(26.5) = £27
OT hours = max(0, 12.5 − 11) = 1.5 · OT = Math.round(1.5 × 66) = £99

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |
| Overtime | 1.5 | £66 | £99 |

Penalties: Missed 2nd break £27
Subtotal £631 · Penalties £27 · **Grand total £658**
_APA S.6.3 — "0.5 hr at BHR as compensation for missed second break"_

---

### T-039 — Second break late (> 5.5 hrs from first break end)
**Role:** CM (£532 / £53)
**Day:** Friday · Call 08:00 · First break 12:00, 60 min (end 13:00) · Second break at 19:00 (6.0 hrs after first break end) · Wrap 21:00

secondBreakDue = 780 + 330 = 1110 min · secondBreakTime = 19:00 = 1140 min
gap = 1140 − 780 = 360 min = 6.0 hrs > 5.5 → 'Second break late (missed penalty)', 0.5, £53, £27

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |
| Overtime | 2.0 | £66 | £132 |

Penalties: Second break late (missed penalty) £27
Subtotal £664 · Penalties £27 · **Grand total £691**
_APA S.6.3 — late second break treated as missed_

---

## 10. Non-Shooting Days — NSD (S.2.3)

> Prep / Recce / Build & Strike / Pre-light: 8-hr day at BHR. OT after 9 hrs (with break) or 8 hrs (without). Weekend at multiplied BHR.

### T-040 — Prep Day, weekday, break given (OT after 9 hrs)
**Role:** CM (£532 / £53 / OT £66)
**Day:** Monday · dayType = prep · Call 08:00 · Wrap 18:30 · dayLength 10.5 hrs · firstBreakGiven = true

otStartNSD = 9 (break given) · OT hours = max(0, 10.5 − 9) = 1.5 → roundOTHours = 1.5
OT = Math.round(1.5 × 66) = £99
Prep line: 8 × £53 = £424

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Prep Day | 8 | £53 | £424 |
| Overtime | 1.5 | £66 | £99 |

Subtotal £523 · **Grand total £523**
_APA S.2.3 — 8-hr NSD; OT starts 9 hrs from call if break given_

---

### T-041 — Prep Day, weekday, no break (OT after 8 hrs)
**Role:** CM (£532 / £53 / OT £66)
**Day:** Tuesday · dayType = prep · Call 08:00 · Wrap 17:30 · dayLength 9.5 hrs · firstBreakGiven = false

otStartNSD = 8 (no break) · OT hours = max(0, 9.5 − 8) = 1.5 → roundOTHours = 1.5
OT = Math.round(1.5 × 66) = £99

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Prep Day | 8 | £53 | £424 |
| Overtime | 1.5 | £66 | £99 |

Subtotal £523 · **Grand total £523**
_APA S.2.3 — OT triggers 1 hr earlier when no break given_

---

### T-042 — Pre-light Day, weekday, meal not provided (£7.50 penalty)
**Role:** GA (£568 / £57 / OT £71)
**Day:** Thursday · dayType = pre_light · Call 09:00 · Wrap 18:00 · dayLength 9.0 hrs · firstBreakGiven = **false**

Pre-light: 8 × £57 = £456 · plOtStartTime = 09:00 + 9 = 18:00
OT hours = max(0, 9.0 − 9) = 0
firstBreakGiven = false → 'Pre-light meal allowance (not provided)', £7.50

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Pre-light Day | 8 | £57 | £456 |

Penalties: Pre-light meal allowance £7.50
Subtotal £456 · Penalties £7.50 · **Grand total £463.50**
_APA S.2.3 — "£7.50 if meal not provided on pre-light day"_

---

### T-043 — Recce Day, Saturday (1.5× BHR)
**Role:** FP (£558 / £56 · satRate = Math.round(56 × 1.5) = Math.round(84) = £84 · satOtRate = £84)
**Day:** Saturday · dayType = recce · Call 09:00 · Wrap 20:00 · dayLength 11.0 hrs · firstBreakGiven = true

baseHours = 8 · Pre-light base: 8 × £84 = £672
otStartNSD = 9 (break given) · plOtStartTime = 09:00 + 9 = 18:00
OT hours = max(0, 11.0 − 9) = 2.0 · OT = Math.round(2.0 × 84) = £168

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Recce Day | 8 | £84 | £672 |
| Overtime | 2.0 | £84 | £168 |

Subtotal £840 · **Grand total £840**
_APA S.2.4(vii) — "1.5× BHR for 8 hours; OT at 1.5× BHR"_

---

### T-044 — Build/Strike Day, Sunday (2× BHR)
**Role:** CM (£532 / £53 · sunRate = Math.round(53 × 2) = £106 · sunOtRate = £106)
**Day:** Sunday · dayType = build_strike · Call 08:00 · Wrap 19:00 · dayLength 11.0 hrs · firstBreakGiven = false

baseHours = 8 · Base: 8 × £106 = £848
otStartNSD = 8 (no break) · OT hours = max(0, 11.0 − 8) = 3.0 · OT = Math.round(3.0 × 106) = £318

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Build/Strike Day | 8 | £106 | £848 |
| Overtime | 3.0 | £106 | £318 |

Subtotal £1,166 · **Grand total £1,166**
_APA S.2.4(viii) — "2× BHR for 8 hours; OT at 2× BHR"_

---

### T-045 — PM/PA/Runner on NSD (no OT applies)
**Role:** RU (£238 / £24)
**Day:** Wednesday · dayType = prep · Call 08:00 · Wrap 22:00 · dayLength 14.0 hrs
isPMPARunner = true → NSD block skipped entirely; returns BDR flat with no OT

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Prep Day (no OT) | 1 | £238 | £238 |

**Grand total £238**
_APA Appendix 1 — PM/PA/Runner exempt from NSD OT_

---

### T-046 — DOP on Prep (treated as Basic Working Day — S.2.3 exception)
**Role:** DoP (£1,516 / £152 / OT £152 · isBasicWorkingNSD = true)
**Day:** Monday · dayType = prep → **treated as basic_working** for DoP
**Call 08:00 · Wrap 21:00 · dayLength 13.0 hrs · both breaks given**

OT hours = max(0, 13.0 − 11) = 2.0 · OT = Math.round(2.0 × 152) = £304
dayDescription = "Prep Day (Basic Working Day rules — S.2.3) — Standard Call"

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £1,516 | £1,516 |
| Overtime | 2.0 | £152 | £304 |

Subtotal £1,820 · **Grand total £1,820**
_APA S.2.3 — "does not apply to DOP, Art Directors and Location Managers"_

---

## 11. Rest Day (S.2.3)

### T-047 — Rest Day (flat BDR, any day of week, no OT)
**Role:** LT (£444 / £44)
**Day:** Sunday · dayType = rest · any call/wrap
dayType = rest → flat BDR regardless of day; no OT ever

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Rest Day (flat fee) | 1 | £444 | £444 |

**Grand total £444**
_APA S.2.3 — "flat fee = basic daily rate; no overtime regardless of day"_

---

## 12. Travel Day (S.2.4(xiii–xiv))

### T-048 — Travel Day, < 5 hrs (minimum 5 applied)
**Role:** CM (£532 / £53)
**Day:** Monday · dayType = travel · Call 09:00 · Wrap 12:00 · dayLength 3.0 hrs
travelHrs = max(3.0, 5) = **5** · Travel pay = 5 × £53 = £265

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Travel Day | 5 | £53 | £265 |

**Grand total £265**
_APA S.2.4(xiii) — "minimum call of 5 hours… BHR regardless of day of the week"_

---

### T-049 — Travel Day, longer than 5 hrs, Saturday
**Role:** CM (£532 / £53)
**Day:** Saturday · dayType = travel · Call 08:00 · Wrap 17:00 · dayLength 9.0 hrs
travelHrs = max(9.0, 5) = **9** · Travel pay = 9 × £53 = £477
(BHR regardless of day — Saturday premium does NOT apply)

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Travel Day | 9 | £53 | £477 |

**Grand total £477**
_APA S.2.4(xiii) — "regardless of time or day of the week"_

---

## 13. Time Off the Clock — TOC (S.5)

> Minimum 11-hr gap between wrap and next call. APA S.5: max **1 hour** TOC payable. PM/PA/Runner exempt.

### T-050 — Exactly 11 hrs gap (no TOC)
**Role:** CM (£532 / £53 / OT £66)
**Previous wrap:** 21:00 · **Call:** 08:00 next day · Gap = 660 min = 11.0 hrs
Condition `gapHours < 11` → **false** → no TOC

**Grand total:** BDR only, no TOC penalty
_APA S.5 — exactly 11 hrs does NOT trigger TOC_

---

### T-051 — Gap 10.5 hrs → 0.5 hr TOC
**Role:** CM (£532 / £53 / OT £66)
**Previous wrap:** 21:30 · **Call:** 08:00 · Gap = 630 min = 10.5 hrs
shortfall = min(11 − 10.5, 1) = 0.5 · tocHours = roundOTHours(0.5) = 0.5
TOC = Math.round(0.5 × 66) = £33

| Penalty | Hrs | Rate | Amount |
|---|---|---|---|
| TOC (0.5hr) | 0.5 | £66 | £33 |

Plus BDR (assuming standard day): **Grand total £565**
_APA S.5_

---

### T-052 — Gap 8 hrs → shortfall 3 hrs, capped at 1 hr
**Role:** CM (£532 / £53 / OT £66)
**Previous wrap:** 23:00 · **Call:** 07:00 · Gap = 480 min = 8.0 hrs
shortfall = min(11 − 8, 1) = **min(3, 1) = 1.0** → tocHours = 1.0
TOC = Math.round(1.0 × 66) = £66

| Penalty | Hrs | Rate | Amount |
|---|---|---|---|
| TOC (1hr) | 1.0 | £66 | £66 |

_APA S.5 — "only be engaged to work one hour of TOC" — cap regardless of shortfall_

---

### T-053 — Gap 1 min under 11 hrs → rounds up to 0.5 hr TOC
**Role:** LT (£444 / £44 / OT £67)
**Previous wrap:** 21:01 · **Call:** 08:00 · Gap = 659 min = 10.983 hrs
shortfall = min(0.017, 1) = 0.017 · tocHours = roundOTHours(0.017) = ceil(0.033)/2 = 1/2 = **0.5**
TOC = Math.round(0.5 × 67) = Math.round(33.5) = £34

_Even 1 minute under 11 hrs triggers a 0.5-hr TOC (APA S.4.5 rounding applies)_

---

### T-054 — PM/PA/Runner, short gap (no TOC — exempt)
**Role:** PM (£609 · isPMPARunner = true)
**Previous wrap:** 22:00 · **Call:** 08:00 · Gap = 10 hrs
`!isPMPARunner` → **false** → TOC block not entered

**No TOC penalty.**
_APA S.5 — "does not apply to PM's, PA's and Runners"_

---

## 14. Travel Time Pay (S.3.1)

> On working days: deduct first hour of outward and homeward journey (2 hrs total) from travel hours. On non-shooting days: no deduction. Pay only if total working + travel ≥ 11 hrs.

### T-055 — Working day, 3 hrs travel, threshold met → 1 hr paid
**Role:** FP (£558 / £56)
**Day:** Wednesday · basic_working · dayLength 11.0 hrs · travelHours 3.0
workingHours + travelHours = 14.0 ≥ 11 → payable
deduction = min(3.0, 2) = 2.0 · payable = 1.0 hr · travelPay = 1.0 × £56 = £56

Additional: travelPay = **£56**
_APA S.3.1 — "less the first hour of the outward and homeward journey"_

---

### T-056 — Working day, 2 hrs travel, threshold NOT met
**Role:** FP (£558 / £56)
**Day:** Monday · basic_working · dayLength 8.0 hrs · travelHours 2.0
8.0 + 2.0 = 10.0 hrs < 11 → **no travel pay**

travelPay = £0
_APA S.3.1 — total must reach 11 hrs to trigger travel pay_

---

### T-057 — Working day, travel deduction eats all travel time (2 hrs travel)
**Role:** CM (£532 / £53)
**Day:** Tuesday · basic_working · dayLength 11.0 hrs · travelHours 2.0
deduction = min(2.0, 2) = 2.0 · payable = max(0, 2.0 − 2.0) = **0** · travelPay = **£0**

_Both travel hours consumed by the 2-hr deduction_

---

### T-058 — Non-shooting day (prep), 5 hrs travel, no deduction
**Role:** CM (£532 / £53)
**Day:** Monday · prep · dayLength 7.0 hrs · travelHours 5.0
7.0 + 5.0 = 12.0 ≥ 11 → payable
isWorkingDay = false (not basic_working or continuous_working) → deduction = **0**
payable = 5.0 hrs · travelPay = 5.0 × £53 = **£265**

_APA S.3.1 — 2-hr deduction only applies to working days_

---

## 15. Mileage (S.3.2)

### T-059 — 46 miles outside M25 → £23
**Role:** any
mileage = 46 × 0.50 = **£23.00**

### T-060 — Zero miles → £0
mileage = 0 × 0.50 = **£0**

### T-061 — Combined: mileage + travel time
**Role:** CM (£532 / £53)
**Day:** Wednesday · basic_working · dayLength 11.0 hrs · travelHours 4.0 · mileage 60 miles
travelPay: payable = max(0, 4.0 − 2.0) = 2.0 hrs → 2.0 × £53 = £106
mileage = 60 × 0.50 = £30
grandTotal = £532 (BDR) + £106 (travel) + £30 (mileage) = **£668**

---

## 16. Equipment

### T-062 — Equipment with 10% discount
equipmentValue £500 · discount 10%
equipmentTotal = Math.round(500 × 0.9 × 100) / 100 = **£450.00**

### T-063 — Equipment no discount
equipmentValue £750 · discount 0%
equipmentTotal = **£750.00**

### T-064 — Equipment 100% discount
equipmentValue £500 · discount 100%
equipmentTotal = Math.round(500 × 0.0 × 100) / 100 = **£0.00**

---

## 17. Long Days and Industry Edge Cases

### T-065 — 18-hr day, basic working, converted, midnight OT, both continuous breaks missed, TOC
**Role:** LT (£444 / £44 / OT £67 / 3×BHR £132)
**Day:** Friday · Call 08:00 · Wrap 02:00 (next day) · dayLength 18.0 hrs
Input: basic_working, firstBreakGiven=false → converts to continuous
continuousFirstBreakGiven=false · continuousAdditionalBreakGiven=false
previousWrap: 22:00 → gap = 10 hrs < 11 → TOC

OT hours = 18.0 − 9 = 9.0
wrapActual = 120 + 1440 = 1560 → after midnight = (1560−1440)/60 = 2.0 hrs
midnightOT = 2.0 · regularOT = 7.0
Regular OT = Math.round(7.0 × 67) = £469
Midnight OT = Math.round(2.0 × 132) = £264
Penalty 1 (> 9 hrs, no first break): 0.5 × £44 = £22
Penalty 2 (> 12.5 hrs, no add'l break): 0.5 × £44 = £22
TOC: shortfall = min(1, 1) = 1.0 · Math.round(1.0 × 67) = £67

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Continuous Working Day (BDR) | 9 | £444 | £444 |
| Overtime | 7.0 | £67 | £469 |
| Overtime After Midnight (3× BHR) | 2.0 | £132 | £264 |

Penalties: No 2nd break £22 · No add'l break £22 · TOC (1hr) £67
Subtotal £1,177 · Penalties £111 · **Grand total £1,288**

---

### T-066 — Saturday night shoot, wrap 04:00, with after-midnight triple
**Role:** LT (£444 / £44 · satRate £66 · 3×BHR £132)
**Day:** Saturday · Call 21:00 · Wrap 04:00 · dayLength 7.0 hrs
workedHours = max(7.0 − 1, 10) = **10** (minimum)
wrapActual = 240 + 1440 = 1680 → after midnight = (1680−1440)/60 = 4.0 hrs
regularHrs = max(0, 10.0 − 4.0) = 6.0 · midnightHrs = 4.0
Saturday (regular) = Math.round(6.0 × 66) = £396
Saturday After Midnight = Math.round(4.0 × 132) = £528

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Saturday (1.5× BHR) | 6.0 | £66 | £396 |
| Saturday After Midnight (3× BHR) | 4.0 | £132 | £528 |

Subtotal £924 · **Grand total £924**
_APA S.2.4(i), S.4.4 — Saturday minimum call + after-midnight triple_

---

### T-067 — Sunday night shoot, short turnaround, next-day call 08:00
**Role:** FP (£558 / £56 · sunRate = £112 · 3×BHR £168)
**Day:** Sunday · Call 20:00 · Wrap 05:00 (next day) · dayLength 9.0 hrs
workedHours = max(9.0 − 1, 10) = **10**
wrapActual = 300 + 1440 = 1740 → after midnight = (1740−1440)/60 = 5.0 hrs
regularHrs = max(0, 10.0 − 5.0) = 5.0 · midnightHrs = 5.0
Sunday (regular) = Math.round(5.0 × 112) = £560
Sunday After Midnight = Math.round(5.0 × 168) = £840

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Sunday/BH (2× BHR) | 5.0 | £112 | £560 |
| Overtime After Midnight (3× BHR) | 5.0 | £168 | £840 |

Subtotal £1,400 · **Grand total £1,400**

---

### T-068 — Standard day, full penalty stack (first break delayed + second break missed + OT)
**Role:** CM (£532 / £53 / OT £66)
**Day:** Thursday · Call 08:00 · First break at 14:15 (6.25 hrs) · duration 60 min · Second break NOT given · Wrap 22:00 · dayLength 14.0 hrs

First break at 6.25 hrs → 5.5 < 6.25 ≤ 6.5 → delay penalty £10
Second break: firstBreakEnd = 915 · due = 915 + 330 = 1245 · wrapAbsMins = 480 + 840 = 1320 ≥ 1245 → DUE · secondBreakGiven=false → 'Missed 2nd break', £27
OT hours = max(0, 14.0 − 11) = 3.0 · OT = Math.round(3.0 × 66) = £198

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |
| Overtime | 3.0 | £66 | £198 |

Penalties: First break delayed £10 · Missed 2nd break £27
Subtotal £730 · Penalties £37 · **Grand total £767**

---

### T-069 — All components: BDR + OT + midnight + TOC + travel + mileage + equipment
**Role:** CM (£532 / £53 / OT £66 / 3×BHR £159)
**Day:** Wednesday · Call 08:00 · Wrap 02:00 · dayLength 18.0 hrs
previousWrap 22:00 (gap 10 hrs → TOC) · travelHours 3.0 · mileage 40 miles · equipment £300 · discount 20%

OT hours = 18 − 11 = 7.0
wrapActual = 120 + 1440 = 1560 → midnightOT = 2.0 · regularOT = 5.0
Regular OT = Math.round(5.0 × 66) = £330
Midnight OT = Math.round(2.0 × 159) = £318
TOC: shortfall = min(1, 1) = 1.0 · Math.round(1.0 × 66) = £66
travelPay: deduction = 2 · payable = 1.0 · 1.0 × £53 = £53
mileage = 40 × 0.50 = £20
equipment = Math.round(300 × 0.8 × 100)/100 = £240

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Basic Daily Rate | 11 | £532 | £532 |
| Overtime | 5.0 | £66 | £330 |
| Overtime After Midnight (3× BHR) | 2.0 | £159 | £318 |

Penalties: TOC (1hr) £66
Subtotal £1,180 · Penalties £66 · travelPay £53 · mileage £20 · equipment £240
**Grand total £1,559**

---

## 18. Buyout Role

### T-070 — Buyout: flat rate, no OT regardless of hours
**Role:** custom, isBuyout=true · BDR £800
**Day:** Saturday · Call 06:00 · Wrap 22:00 · mileage 20 miles · equipment £200

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Day Rate (buyout) | 1 | £800 | £800 |

mileage = £10 · equipment = £200 · **Grand total £1,010**
_Buyout role: single flat line, no break penalties, no OT, no TOC — mileage and equipment still apply_

---

## 19. PM/PA/Runner — Early Call on Saturday/Sunday

### T-071 — PM early call Saturday
**Role:** PM (£609 / £61 · pmSatBDR = Math.round(609 × 1.5) = £914 · pmSatOtRate = Math.round(61 × 1.5) = Math.round(91.5) = £92)
**Day:** Saturday · Call 06:00 · Wrap 20:00 · dayLength 14.0 hrs
earlyHours = 1.0 · earlyOT = Math.round(1.0 × 92) = £92
pmSatOtStart = 06:00 + 11 = 17:00
workedHours = max(14 − 1, 10) = 13 · OT hours = max(0, 13 − 10) = 3.0 · OT = 3.0 × 92 = £276

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Early Call Overtime (06:00–07:00) | 1.0 | £92 | £92 |
| Saturday Basic Daily Rate (1.5× BDR) | 11 | £914 | £914 |
| Overtime (1.5× BHR) | 3.0 | £92 | £276 |

Subtotal £1,282 · **Grand total £1,282**

---

### T-072 — Runner early call Sunday
**Role:** RU (£238 / £24 · pmSunBDR = 238 × 2 = £476 · pmSunOtRate = 24 × 2 = £48)
**Day:** Sunday · Call 05:30 · Wrap 18:00 · dayLength 12.5 hrs
earlyHours = (420 − 330)/60 = 1.5 · earlyOT = Math.round(1.5 × 48) = £72
pmSunOtStart = 05:30 + 11 = 16:30
workedHours = max(12.5 − 1, 10) = 11.5 · OT hours = max(0, 11.5 − 10) = 1.5 · OT = 1.5 × 48 = £72

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Early Call Overtime (05:30–07:00) | 1.5 | £48 | £72 |
| Sunday/BH Basic Daily Rate (2× BDR) | 11 | £476 | £476 |
| Overtime (2× BHR) | 1.5 | £48 | £72 |

Subtotal £620 · **Grand total £620**

---

## 20. Rate Calculation Checks

### T-073 — BHR rounding: BDR £532 → BHR £53 (not £53.20)
Math.round(532 / 10) = Math.round(53.2) = **£53** ✓

### T-074 — BHR rounding: BDR £444 → BHR £44
Math.round(444 / 10) = Math.round(44.4) = **£44** ✓

### T-075 — OT rounding: 22 minutes of OT → rounds to 0.5 hr
OT = 22 min = 0.367 hrs → ceil(0.367 × 2)/2 = ceil(0.733)/2 = 1/2 = **0.5** ✓

### T-076 — OT rounding: 31 minutes → rounds to 1.0 hr
OT = 31 min = 0.517 hrs → ceil(0.517 × 2)/2 = ceil(1.033)/2 = 2/2 = **1.0** ✓

### T-077 — 3× BHR: LT at £44 → £132
3 × 44 = **£132** ✓

### T-078 — customOtRate takes precedence over BHR × coefficient
LT: customOtRate = £67 vs Math.round(44 × 1.5) = Math.round(66) = £66
Engine uses: **£67** (customOtRate wins) ✓

---

## 21. Bank Holiday

### T-079 — Bank Holiday treated as Sunday (2× BHR)
**Role:** CM (£532 / £53 · sunRate £106)
**Day:** Bank Holiday (e.g. Boxing Day) · isBankHoliday=true · basic_working
Same path as Sunday/BH — `isSundayOrBH = true`

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Sunday/BH (2× BHR) | 10 | £106 | £1,060 |

**Grand total £1,060**
_APA S.2.4(ii) — bank holidays use Sunday rates_

---

### T-080 — Bank Holiday + continuous working
**Role:** GA (£568 / £57 · sunBDR = 568 × 2 = £1,136 · sunOtRate = Math.round(57 × 2) = £114)
**Day:** Bank Holiday · continuous_working · Call 08:00 · Wrap 21:00 · dayLength 13.0 hrs

OT hours = 13.0 − 9 = 4.0 · OT = Math.round(4.0 × 114) = £456

| Line item | Hrs | Rate | Amount |
|---|---|---|---|
| Sunday/BH Continuous Working Day (2× BDR) | 9 | £1,136 | £1,136 |
| Overtime | 4.0 | £114 | £456 |

Subtotal £1,592 · **Grand total £1,592**

---

## Summary Index by Code Path

| Engine path | Test IDs |
|---|---|
| Basic working, standard weekday | T-001 to T-007 |
| Basic working, early call (05:00–07:00) | T-008, T-009 |
| Basic working, late call (11:00–17:00) | T-010, T-011 |
| Basic working, night call (17:00–05:00) | T-012, T-013, T-014 |
| Basic working, Saturday non-PM | T-015, T-016 |
| Basic working, Saturday PM/PA/Runner | T-017 |
| Basic working, Sunday/BH non-PM | T-018 |
| Basic working, Sunday/BH PM/PA/Runner | T-019 |
| Continuous, standard | T-020, T-021 |
| Continuous, 9-hr break boundary | T-022, T-023 |
| Continuous, 12.5-hr break boundary | T-024, T-025 |
| Continuous, night call | T-026 |
| Continuous, early call | T-027 |
| Continuous, late call | T-028 |
| Continuous, Saturday | T-029 |
| Continuous, Sunday/BH | T-030 |
| Converted to continuous (no break given) | T-031 |
| Converted to continuous (break too late) | T-033 |
| Conversion boundary (exactly 6.5 hrs) | T-032 |
| Converted + long day + both breaks missed | T-034, T-065 |
| First break delayed (5.5–6.5 hrs) | T-035 |
| First break curtailed (<30 min) | T-036 |
| Second break not due (day too short) | T-037 |
| Second break missed | T-038 |
| Second break late | T-039 |
| NSD — weekday, break given/not given | T-040, T-041 |
| NSD — pre-light meal allowance | T-042 |
| NSD — Saturday | T-043 |
| NSD — Sunday | T-044 |
| NSD — PM/PA/Runner (no OT) | T-045 |
| NSD — isBasicWorkingNSD exception (DoP/AD/LocMgr) | T-046 |
| Rest Day | T-047 |
| Travel Day < 5 hrs (minimum applied) | T-048 |
| Travel Day > 5 hrs, Saturday (no premium) | T-049 |
| TOC — exactly 11 hrs (no penalty) | T-050 |
| TOC — shortfall < 1 hr | T-051, T-053 |
| TOC — shortfall ≥ 1 hr (capped at 1 hr) | T-052 |
| TOC — PM/PA/Runner exempt | T-054 |
| Travel time pay — threshold met | T-055 |
| Travel time pay — threshold not met | T-056 |
| Travel time pay — deduction eats all | T-057 |
| Travel time pay — NSD (no deduction) | T-058 |
| Mileage 50p/mile | T-059, T-061 |
| Equipment with discount | T-062 |
| Equipment no discount | T-063 |
| Equipment 100% discount | T-064 |
| Long day (18+ hrs) + midnight + TOC + penalties | T-065 |
| Saturday night wrap after midnight | T-066 |
| Sunday night wrap after midnight | T-067 |
| Full penalty stack | T-068 |
| All components combined | T-069 |
| Buyout role | T-070 |
| PM early Saturday | T-071 |
| PM early Sunday | T-072 |
| BHR/OT rounding checks | T-073 to T-078 |
| Bank Holiday (Sunday rate) | T-079, T-080 |
| Wrap exactly at midnight | T-006 |
| OT rounding (7 min → 0.5 hr) | T-004 |
| After-midnight triple time | T-005, T-066, T-067 |
