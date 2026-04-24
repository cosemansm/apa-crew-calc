# AI Assistant T&C Q&A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the AI Input page into a dual-mode assistant that auto-classifies user input as either a timesheet entry (existing flow) or a T&C question (new RAG-powered Q&A chat).

**Architecture:** A classifier determines intent, routing timesheet entries to the existing parser and questions to a new pipeline: embed the query via Gemini, cosine-match against pre-embedded APA T&C chunks, and send the top matches as context to Gemini for a cited conversational answer displayed in a chat thread.

**Tech Stack:** Gemini 2.5 Flash (generation), Gemini text-embedding-004 (embeddings), React, TypeScript, Vite, Vitest

**Spec:** `docs/superpowers/specs/2026-04-24-ai-assistant-tc-qa-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/data/apa-tc-sections.ts` | Create | Hand-curated T&C text chunks with section IDs and titles |
| `scripts/embed-tc-chunks.ts` | Create | Node script to generate embeddings via Gemini API |
| `src/data/apa-tc-chunks.json` | Create (generated) | Pre-computed chunks + 768-dim embeddings |
| `src/lib/tc-search.ts` | Create | Cosine similarity search over chunk embeddings |
| `src/lib/tc-search.test.ts` | Create | Tests for cosine similarity and chunk ranking |
| `src/lib/classify-input.ts` | Create | Intent classification (question vs timesheet) |
| `src/lib/classify-input.test.ts` | Create | Tests for classification logic |
| `src/lib/tc-chat.ts` | Create | Gemini chat call with T&C context + conversation history |
| `src/lib/gemini.ts` | Modify | Add embedText() helper for query embedding |
| `src/pages/AIInputPage.tsx` | Modify | Add classification routing, chat thread UI, thinking animation |

---

### Task 1: Curate T&C text chunks

**Files:**
- Create: `src/data/apa-tc-sections.ts`

This is the foundation — hand-extract the APA T&C PDF text into structured chunks. Each chunk maps to one numbered section from the PDF table of contents. The text should be cleaned (no table formatting artefacts, just the prose and key facts).

- [ ] **Step 1: Create the T&C sections data file**

```ts
// src/data/apa-tc-sections.ts

export interface TCSection {
  sectionId: string;
  title: string;
  text: string;
}

export const APA_TC_SECTIONS: TCSection[] = [
  {
    sectionId: '1',
    title: 'Your Services',
    text: `You will provide the services of your grade in consideration of which we agree to pay you such sum as we agree between us which shall be not less than the minimum and not more than the maximum for that grade set out in Appendix 1 (your "basic daily rate") on weekdays, together with such additional payments as this agreement entitles you to.

We will pay invoices from crew with whom we contract direct within seven days of receipt. You agree that such services will be of a good professional standard consistent with what we might reasonably expect to receive from a person employed on your grade.

You agree to treat all information you obtain as a result of your engagement as confidential and that the copyright in anything you create pursuant to your engagement is assigned to us by way of future assignment. You waive all moral rights in respect of such work.`,
  },
  {
    sectionId: '2',
    title: 'Day Types and Best Practice',
    text: `Our recommendation and best practice for APA members is not to schedule shoot days to go beyond 12 hours (10 hours plus one hour for lunch plus one hour overtime) from the main unit call time other than in exceptional circumstances and unscheduled overtime beyond that time for the main unit should be avoided except where it arises from unanticipated issues that arise during the shoot day.

N.B. Unit Call is a call time when the day officially starts however some departments may commence work prior to the unit call; a department call. A department call time is when the whole of the department starts, not an individual e.g. generator driver that may have to collect equipment earlier. Main unit call dictates what kind of day it will be (ie. continuous working, night shoot etc). The provisions of 2 do not apply to PM's, PA's and Runners, for their Day Type entitlements please see Appendix 1.

Crew rate definitions: Basic Daily Rate (BDR) is the 10+1 hours day rate as per Appendix 1. Basic Hourly Rate (BHR) equals 1/10 of the Basic Daily Rate. Double Hourly Rate (2xBHR) equals BHR x 2. Triple Hourly Rate (3xBHR) equals BHR x 3. Standard Hourly Overtime (OT) equals BHR x OT Coefficient (x1, x1.25, x1.5) as per OT Grades outlined in Section 4 and Appendix 1.`,
  },
  {
    sectionId: '2.1',
    title: 'The Basic Working Day',
    text: `The Basic Working Day includes 11 hours in total (10 working hours and 1 hour for lunch). You will be notified by the production company of the call time and where you should attend and you will attend at that time and place. For a Basic Working Day you will be paid your Basic Daily Rate as per Appendix 1. Your Basic Hourly Rate is one tenth of your Basic Daily Rate.`,
  },
  {
    sectionId: '2.1.1',
    title: 'Basic Working Day With Call Time Between 7am and 11am (Standard Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. If your call time is between 7 a.m. and 11 a.m., this is considered as a standard call. The basic working day starts at the call time and includes 11 hours in total, 10 working hours and one hour for lunch. Overtime applies after 11 hours. We will notify you of the call time and where you should attend and you will attend at that time and place.`,
  },
  {
    sectionId: '2.1.2',
    title: 'Basic Working Day With Call Time Before 5am (Night Call)',
    text: `If the call time is before 5 a.m., this is considered as a night call and night shoot rule applies; you will be paid at double basic hourly rate for every hour worked; from call time to wrap, with a minimum call of ten hours. We will notify you of the call time and where you should attend and you will attend at that time and place.

If night shoot call time is on Saturday, Monday-Friday night shoot rule applies throughout the engagement even though the engagement goes into Sunday. If the night shoot call time is on Sunday, Monday-Friday night shoot rule applies throughout the engagement; you will be paid double your basic hourly rate for all hours worked with a minimum of ten hours throughout the engagement. There is no such thing as 'double-double' rate.`,
  },
  {
    sectionId: '2.1.3',
    title: 'Basic Working Day With Call Time Between 5am and 7am (Early Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. If your call time is between 5 a.m. and 7 a.m., your basic work day starts at the call time and we will pay you at your overtime rate for hours worked between 5 a.m. and 7 a.m. The rest of the day will be charged as basic working day (calculated from a call time). Early call rule applies on all days throughout a week, Monday to Sunday. Overtime will start 11 hours after a call time.

Note: an individual who commences work earlier than 5am (e.g a genny driver), will be paid for the hours worked prior to their department call time and their basic working day starts at their department's call time. Such an individual who commences earlier than 5am is paid at their triple hourly rate for the time they work up until 5am and at their overtime rate from 5am until the department call.`,
  },
  {
    sectionId: '2.1.4',
    title: 'Basic Working Day With Call Time Between 11am and 5pm (Late Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. If your call time is between 11 a.m. and 5 p.m., this is considered as a late call. No matter when the call time is being given, the basic working day starts at 11 a.m. and includes 11 hours in total - 10 working hours and one hour for lunch. Overtime applies after 11 hours from 11am. We will notify you of the call time and where you should attend and you will attend at that time and place.`,
  },
  {
    sectionId: '2.1.5',
    title: 'Basic Working Day With Call Time Between 5pm and 5am (Night Call)',
    text: `The provisions of this clause apply to work on week days ie Monday to Friday. All work commencing between 5 p.m. and 5 a.m. is considered as night work and you will be paid double your basic hourly rate for all hours worked with a minimum call of ten hours. Breaks apply the same way as on a standard day shoot (i.e. first and second break). No overtime or 'triple time after midnight' rate applies, the rate stays the same throughout the whole engagement; from call time to wrap.

N.B. Going past 5am (next day) is not considered as a new day engagement, you continue to be paid at double your basic hourly rate for all hours worked until the end of that day.

For night shoot with call time at or from 5 p.m. on Saturday we will pay you two times your basic hourly rate for all hours worked on that day with a minimum call of ten hours, the rate remains the same even though the engagement goes into Sunday. For night shoot with call time at or from 5 p.m. on Sunday we will pay you two times your basic hourly rate for all hours worked on that day with a minimum call of ten hours. There is no such thing as double-double rate for a night shoot on Sunday.`,
  },
  {
    sectionId: '2.2',
    title: 'Continuous Working Day',
    text: `Continuous Working Day is any day on which you work for a continuous period (no breaks) of 9 hours. The Continuous Working Day's standard call time is between 7 a.m. the earliest and 11 a.m. the latest. We will provide you with food and beverages at an appropriate time during the Continuous Working Day. Overtime will apply after 9 hours from the call time at the overtime rate as per Appendix 1. If the Continuous Working Day is a Saturday then overtime will apply at 1.5 the BDR and if the Continuous Working Day is a Sunday at 2 times the BDR.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed (i.e. if not given at appropriate time, then the missed break penalty is payable).`,
  },
  {
    sectionId: '2.2.1',
    title: 'Continuous Working Day With Call Time Between 7am and 11am (Standard Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. The Continuous Working Day's standard call time is between 7 a.m. the earliest and 11 a.m. the latest. The basic continuous working day starts at the call time and includes 9 hours in total. Overtime will apply after 9 hours from the call time. We will notify you of the call time and where you should attend and you will attend at that time and place.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.2.2',
    title: 'Continuous Working Day With Call Time Before 5am (Night Call)',
    text: `If the call time is before 5 a.m. and the day is a Continuous Working Day, we will pay you your double basic daily rate. We will provide you with food and beverages at an appropriate time during the Continuous Working Day. Overtime will apply after 9 hours from the call time and is charged at double basic hourly rate.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.2.3',
    title: 'Continuous Working Day With Call Time Between 5am and 7am (Early Call)',
    text: `If your call time is between 5 a.m. and 7 a.m. and the day is a Continuous Working Day, your basic work days starts at the call time and we will pay you at your overtime rate for hours worked between 5 a.m. and 7 a.m. The rest of the day will be charged as basic continuous working day of 9 hours, calculated from the call time. Overtime will apply after 9 hours from the call time.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.2.4',
    title: 'Continuous Working Day With Call Time Between 11am and 5pm (Late Call)',
    text: `The provisions of this clause apply to work on weekdays ie Monday to Friday. If your call time is between 11 a.m. and 5 p.m. and the day is a Continuous Working Day, this is considered as a late call. No matter when the call time is being given, the basic continuous working day starts at 11 a.m. and includes 9 hours in total. Overtime will apply after 9 hours from the call time.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.2.5',
    title: 'Continuous Working Day With Call Time Between 5pm and 5am (Night Call)',
    text: `If your call time is between 5 p.m. and 5 a.m. and the day is a Continuous Working Day, we will pay you your double basic daily rate. The day includes 9 hours in total. Overtime will apply after 9 hours from the call time and is charged at double basic hourly rate.

After the nine hour continuous working day crew are entitled to a 30 minute break. If you are not given the 30 mins break, you will be paid 30 mins at your basic hourly rate as compensation. There will be a further 30 minutes break after 12 1/2 hours from the call time (and the same rule will apply if that break is not given). These breaks can't be delayed.`,
  },
  {
    sectionId: '2.3',
    title: 'Non-Shooting Day',
    text: `Non-Shooting Day is a working day on which shooting does not take place. The non-shooting working day shall be eight hours, charged at your basic hourly rate. Overtime will begin after 8 hours and will be charged at standard overtime rate.

Non-shooting day types: rest day, prep day, recce day, pre-light day, construction (build) day, strike day.

Rest Day is a non-shooting working day when you at production's request remain on location but filming is not taking place for some reason. You will be paid a flat fee which is your basic daily rate, no overtime, penalties or meal compensations apply. This applies on any day of the week.

Prep Day, Recce Day, Construction Day & Strike Day is a non-shooting working day which consists of 8 hours, charged at your basic hourly rate. Overtime will begin after 8 hours and will be charged at standard overtime rate.

Pre-light Day (crew working on a dedicated location/at studio as instructed by production) is a non-shooting working day which consists of 8 hours + 1 hours for lunch, charged at your basic hourly rate. Overtime will begin after 9 hours and will be charged at standard overtime rate.

The above does not apply to DOP, Art Directors and Location Managers, for those crew members each day of engagement is considered as Basic Working Day (see 2) and they work on the basic working day basis of 10 hours + 1 hour for lunch. Overtime applies after 11 hours.

We are not obliged to provide food or compensate for food expenses on non-shooting days apart from pre-light.`,
  },
  {
    sectionId: '2.4',
    title: 'Working on Saturdays, Sundays, Bank Holiday and Statutory Holiday',
    text: `(i) Basic Working Day if on Saturday means you will be paid at one and a half times your basic daily rate for all the hours worked on that day at a minimum call of ten hours.

(ii) Basic Working Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid at two times your basic hourly rate (2xBHR) for all hours worked on that day with a minimum call of ten hours.

(iii) Night Shoot if on Saturday means you will be paid at two times your basic hourly rate (2xBHR) for all hours worked that day with a minimum call of ten hours.

(iv) Night Shoot if on Sundays, Bank Holidays and Statutory Holidays means you will be paid two times of your basic hourly rate for all hours worked on that day with a minimum call of ten hours. There is no such thing as double-double rate.

(v) Continuous Working Day if on Saturday means you will be back at one and a half times your basic daily rate. Overtime commences after 9 hours from the call time. For each overtime hour, you will be paid one and a half times your basic hourly (1.5xBHR).

(vi) Continuous Working Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid at two times your basic daily rate. Overtime commences after 9 hours from the call time. For each overtime hour, you will get paid double your basic hourly (2xBHR).

(vii) Prep Day, Recce Day, Build Day & Strike Day if on Saturday means you will be paid one and a half times your hourly basic rate for 8 hours. Overtime will commence after 8 hours and will be charged at one and a half times your basic hourly (1.5xBHR) rate.

(viii) Prep Day, Recce Day, Build Day & Strike Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid double hourly basic rate for 8 hours. Overtime will commence after 8 hours and will be charged at double basic hourly (2xBHR) rate.

(ix) Pre-light Day if on Saturday means you will be paid one and a half your basic rate for 8 hours. Overtime will commence after 9 hours (lunch hour is included in the day) and will be charged at one and a half times your basic hourly (1.5xBHR) rate.

(x) Pre-light Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid double hourly basic rate for 8 hours. Overtime will commence after 9 hours and will be charged at double basic hourly (2xBHR) rate.

(xi) Rest Day if on Saturday means you will be paid at your basic daily rate for that day. This is a fixed fee and no overtime applies.

(xii) Rest Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid at your basic daily rate for that day. This is a fixed fee and no overtime applies.

(xiii) Travel Day if on Saturday means you will be paid at your basic hourly rate, regardless of time, or day of the week with minimum call of 5 hours.

(xiv) Travel Day if on Sundays, Bank Holidays and Statutory Holidays means you will be paid at your basic hourly rate, regardless of time, or day of the week with minimum call of 5 hours.

Reminder: none of the provisions of Clause 2 apply to PM's, PA's and Runners, whose entitlements are set out in Appendix 1.`,
  },
  {
    sectionId: '3.1',
    title: 'Travel Time',
    text: `Travel time is always paid at single time, regardless of time, or day of the week. If travel time & working time total less than 11 hours, then no travel time is payable.

Travel Time on Non-Shooting Day: If under the terms of this agreement you must travel on a day which is not a working day, we will pay you for the hours you travel of your basic hourly rate subject to a minimum of five hours. After a travel non-shooting day, your following working day start will be calculated on base to base basis (meaning e.g. from hotel to hotel). This applies to all location based shooting where the crew stays at a hotel.

Travel Time on Basic Working Day: For the purpose of calculating travel time, the starting point is W1F 9SE for London-based production companies. On working days we will pay you for time spent travelling less the first hour of the outward and homeward journey, at your basic hourly rate. Travel time is always paid at basic hourly rate, regardless of time, or day of the week.

If we ask you to collect equipment or personnel from other address than your home address, you will be paid for your time collecting and delivering as working time (base to base basis).`,
  },
  {
    sectionId: '3.2',
    title: 'Travel Expenses',
    text: `If you use your car to reach a location (in case of studio shoot - expenses don't apply) we will pay you 50p per mile except that you will not be entitled to be paid if the location is within the M25. If there are multiple locations within the M25, mileage at 50p per mile will be paid from the first location to second location and all subsequent location moves (mileage to the first location within M25 is not payable).

If location is outside M25 and you are using your car to reach the location, we will pay you 50p per mile mileage compensation which will be calculated from W1F 9SE to location and back as per the Movement Order issued by Location Manager or Production.

Note: For production companies based in cities other than London, please apply the same formula as above, using a 20 miles radius from the production company address.`,
  },
  {
    sectionId: '3.3',
    title: 'Travel by Air',
    text: `Where we require to travel by air, we will provide you with air travel on a scheduled passenger service. Further, on all flights and stopovers we will provide you with meals and refreshments.

If the flight time exceeds 4 hours there will be no shooting on the day of the flight except in exceptional circumstances.

When the scheduled flight time exceeds 8 hours there will be no shooting until 24 hours after arrival at the destination except in exceptional circumstances.

None of the provisions of clause 3 shall apply to PM's, PA's or Runners.`,
  },
  {
    sectionId: '4',
    title: 'Overtime Overview',
    text: `You agree to work such hours in addition to the basic working day as are necessary, for which we shall pay you at overtime rate. Overtime rate is based on the following formula: basic hourly rate x overtime crew grade. These provisions do not apply to PM's, PA's or Runners, whose overtime entitlement is as set out in Appendix 1.

Based on your basic working day rate, you belong in one of three overtime grades.`,
  },
  {
    sectionId: '4.1',
    title: 'Overtime Monday to Friday - Grade I (Basic Daily Rate £0 - £444)',
    text: `If your basic daily rate is £444 or less we will pay you one and a half times (1.5) your basic hourly rate for each hour of overtime you work. OT Coefficient: 1.5.`,
  },
  {
    sectionId: '4.2',
    title: 'Overtime Monday to Friday - Grade II (Basic Daily Rate £445 - £676)',
    text: `If your basic daily rate is between £445 and £676 inclusive we will pay one and a quarter times (1.25) your basic hourly rate for each hour of overtime you work. OT Coefficient: 1.25.`,
  },
  {
    sectionId: '4.3',
    title: 'Overtime Monday to Friday - Grade III (Basic Daily Rate £677 and more)',
    text: `If your basic daily rate is £677 or more you will be paid one times (1.0) your basic hourly rate for each hour of overtime you work. OT Coefficient: 1.0.`,
  },
  {
    sectionId: '4.4',
    title: 'Overtime After Midnight',
    text: `You will be paid at three times your basic hourly rate for all overtime worked between midnight and 5am and continuously thereafter until wrap is called. This does not apply to PM's, PA's or Runners. For their overtime entitlements please see Appendix 1.`,
  },
  {
    sectionId: '4.5',
    title: 'Overtime Charge Rounding',
    text: `The overtime is charged per minute and you are entitled to round up the overtime to 30mins only, e.g. if you work for 10 OT minutes, you are entitled to 30 minutes of OT.`,
  },
  {
    sectionId: '4.6',
    title: 'Overtime on Saturdays',
    text: `If you work on a Saturday we will pay you one and a half times your basic hourly rate for all hours worked on that day with a minimum call of ten hours. Overtime after midnight is still paid at triple time based on your basic hourly rate. In circumstances of going past 5am - this will not be considered as a new day engagement, you will be continuously paid at the 'overtime midnight rate' (triple time of your basic hourly rate) until the wrap. This does not apply to PM's, PA's and Runners, for their overtime on Saturdays please see Appendix 1.`,
  },
  {
    sectionId: '4.7',
    title: 'Overtime on Sundays, Bank Holiday and Statutory Holidays',
    text: `If you work on Sundays, Bank Holidays or Statutory Holidays we will pay you two times your basic hourly rate for all hours worked on that day with a minimum call of ten hours. Overtime after midnight is still paid at triple time based on your basic hourly rate. In circumstances of going past 5am - this will not be considered as a new day engagement, you will be continuously paid at the 'overtime midnight rate' (triple time of your basic hourly rate) until the wrap. This does not apply to PM's, PA's and Runners, for their overtime entitlements please see Appendix 1.`,
  },
  {
    sectionId: '5',
    title: 'Time Off The Clock',
    text: `If production lasts more than 1 day, the minimum break between wrap and following day call time shall be 11 hours ('time off the clock'). Crew shall not be engaged to work without at least a 10 hour break between call times i.e. they may only be engaged to work one hour of TOC in respect of any one break. If TOC is reduced to 10 hours, we will pay you for the one TOC hour worked at your basic overtime rate in addition to being paid for those hours worked as a part of the basic day rate. Time off the clock and any penalties arising from it does not apply to PM's, PA's and Runners.`,
  },
  {
    sectionId: '6.1',
    title: 'Breakfast',
    text: `Breakfast is provided as a courtesy of a production company however it is not compulsory to be provided. Nor are crew entitled to be compensated for not being provided breakfast.`,
  },
  {
    sectionId: '6.2',
    title: 'First Break',
    text: `Your first break of one hour will begin no more than 5 1/2 hours after work has commenced. If the break is missed, it isn't also delayed - you will be only paid 'missed break penalty'.

If Delayed: we will pay you a penalty of £10.

If the first meal break does not commence within 6 1/2 hours of main unit call the day becomes a continuous working day and the provisions of 2.2 apply. For the avoidance of doubt no late lunch penalties are then payable.

If Curtailed: overtime will commence eleven hours from the start time less the amount of time the first break was curtailed (e.g. if the first break was curtailed by 20 minutes overtime will commence 10 hours and 40 minutes from the start time). If no overtime is worked then the crew member will be paid for the time by which their break was curtailed at single time.

If Missed: When 6 1/2 hours have elapsed since the main unit call, that day will be treated as if it were a Continuous Working Day.

Compensation / Penalty: We will either provide you with a free meal or pay you £7.50 meal allowance.

If Missed on a night shoot: Missed break on a night shoot is charged at basic hourly rate.

Note: Lunch break is not a part of a working day and therefore crew are not being paid during the time of a break.`,
  },
  {
    sectionId: '6.3',
    title: 'Second Break',
    text: `Your second break of half an hour will begin no more than 5 1/2 hours after the end of the first break.

If Delayed: Second Break can't be delayed, the break either is given to the crew or is not.

If Curtailed: we will pay you for those minutes we have curtailed the break by.

If Missed: you will get paid at basic hourly rate to compensate for the 30 minutes of that missed break.

Compensation / Penalty: There is no financial compensation if food is not provided.

If Missed on a night shoot: Missed break on a night shoot is charged at basic hourly rate.

Note: Second break is a part of a working day and therefore crew are being paid during the time of a break.`,
  },
  {
    sectionId: '6.4',
    title: 'Additional Break on Continuous Working Day',
    text: `Your additional break of half an hour will begin no more than 12 1/2 hours from the call time and is preceded by a break of 30 minutes (based on provisions of "second break", please see 6.3 for details) after 9 hours from the call time, this break ONLY applies to Continuous Working Day.

If Delayed: Additional Break can't be delayed, the break either is given to the crew after 12 1/2 hours. If missed, break penalty is payable.

If Missed: When the additional break is missed, you will get paid at basic hourly rate to compensate for the 30 minutes of that missed break.

Compensation / Penalty: N/A.

Note: This additional break is a part of a working day and therefore crew are being paid during the time of a break. Breaks and penalties do not apply to PM's, PA's or Runners.`,
  },
  {
    sectionId: '7',
    title: 'Cancellation Fees',
    text: `If a production is cancelled for any reason except an event of Force Majeure the amount payable to you under this agreement shall be determined as follows: All seven days of the week count for the notice period. For the purpose of calculating the number of days notice given, the day on which notice is given is included but the shoot day is not.

If the period of engagement is three days or less, the cancellation fee applies to the whole engagement. If the period of engagement is more than three days, then each day is a separate engagement and the cancellation fee is calculated for each day. Build days, recce days, pre-light days, shoot days & strike days are all considered as an engagement.

Fee cancellation calculation:
- 7 and more days prior to the engagement - no calculation fee applies
- 6-4 days prior to the engagement - 50% of the agreed fee
- 3-2 days prior to the engagement - 75% of the agreed fee
- On the day prior to the engagement - 100% of the agreed fee

Fee cancellation calculation (crew confirmed for longer period e.g. art director, prod. manager etc.): Crew that have commenced work prior to cancellation are entitled to being paid for work they have already done and for a reasonable compensation having regard for their obligation to seek replacement work.`,
  },
  {
    sectionId: '8',
    title: 'Insurance',
    text: `We will arrange insurance for you when you work for us overseas or on a hazardous location in the UK. We will provide you with the terms of such insurance if you request them in writing.`,
  },
  {
    sectionId: '9',
    title: 'Assignment of Services',
    text: `We shall be entitled to assign the benefit of your services under this agreement but we shall remain obliged to pay you such sums as you are entitled to under this agreement.`,
  },
  {
    sectionId: '10',
    title: 'Holiday Pay',
    text: `A crew member is entitled to the equivalent of 5.6 weeks' paid holiday during each holiday year (including all bank holiday entitlements), calculated on a pro rata basis depending on the number of hours that the crew member actually works. The holiday entitlement for a crew member is therefore equivalent to 12.07% of the hours the crew member works, rounded up to the nearest hour. The crew member's payments include a payment in lieu of their 12.07% holiday entitlement.`,
  },
  {
    sectionId: '11',
    title: 'Force Majeure',
    text: `If your engagement is cancelled because of an event of Force Majeure (as defined in Appendix 2) we shall pay you for the work you have done up to the point where production has ceased but we will not be liable for any other payments.`,
  },
  {
    sectionId: 'appendix-1',
    title: 'Appendix 1 - Recommended Crew Rates',
    text: `Appendix 1 contains the recommended minimum and maximum basic daily rates for all crew grades, along with their overtime grade, OT coefficient, BHR, 2xBHR, 3xBHR, and standard hourly overtime rate.

Provisions for PM's, PA's and Runners:
(a) In all instances overtime will be paid to Production Managers, Production Assistants and Runners on SHOOT DAYS ONLY for hours worked beyond the Basic Working Day between the main unit call and tail lights.
(i) Monday to Friday shoot days: overtime at BHR for all overtime between main unit call and tail lights.
(ii) Saturday shoot days: paid 1.5x BDR; overtime at 1.5x BHR for hours beyond Basic Working Day between main unit call and tail lights.
(iii) Sundays, Bank Holidays, Night shoots (as defined above): paid 2x BDR; overtime at 2x BHR for hours beyond Basic Working Day between main unit call and tail lights.

(b) Casting Director Session Breakdown: For casting session up to 4 characters, casting director will receive the £852 session fee. Prep day fee (half of session fee, i.e. £426) will be payable in addition to the casting session fee. For casting 5-8 characters, a second prep would be charged along with a second casting session fee.

(c) Programmable Lighting Desk Operator Role Definition: An electrician who is operating and programming a lighting desk requiring lighting cues during a take, effects (i.e. flicker / fire effects), control of moving lights or multi-channel LEDs or time coded/midi/analogue synchronisation and triggering (motion control). Such rate and grade only applicable when the position is deemed necessary and agreed in advance between the Gaffer and Production Manager (it shall not apply to a basic fader lighting desk being operated by an electrician).`,
  },
  {
    sectionId: 'appendix-2',
    title: 'Appendix 2 - Force Majeure Definition',
    text: `An event of Force Majeure shall be defined as any event that is not reasonably insurable including but not limited to any act of terrorism, threat of terrorism, any hostile or war like action in time of peace or war, the use or threat of use of any weapon of war employing atomic fission or radioactive force, any instruction or rebellion or revolution or civil war or usurped power or any action taken by any governmental authority in hindering or combating or defending against such occurrence, seizure or destruction under quarantine or customs regulation or confiscation by order of any government or public authority or risks of contraband or illegal transportation of trade, any civil commotion assuming the proportions of or amounting to a popular rising or riot or martial law or the act of any lawfully constituted civil authority (except to the extent that certain acts of civil authority may reasonably be insurable from time to time).`,
  },
];
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc -b --noEmit 2>&1 | head -20`
Expected: No errors related to `apa-tc-sections.ts`

- [ ] **Step 3: Commit**

```bash
git add src/data/apa-tc-sections.ts
git commit -m "feat(ai): add hand-curated APA T&C text chunks for RAG"
```

---

### Task 2: Embedding script and pre-computed chunks

**Files:**
- Create: `scripts/embed-tc-chunks.ts`
- Create: `src/data/apa-tc-chunks.json` (generated output)

A Node script that reads the sections from Task 1, calls Gemini's embedding API, and writes the result as a JSON file. This script runs locally/in CI when the T&C document changes — it is NOT part of the app bundle.

- [ ] **Step 1: Create the embedding script**

```ts
// scripts/embed-tc-chunks.ts
//
// Usage: VITE_GEMINI_API_KEY=<key> npx tsx scripts/embed-tc-chunks.ts
//
// Reads APA T&C sections, embeds each via Gemini text-embedding-004,
// writes src/data/apa-tc-chunks.json.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Direct import of the sections — tsx handles the path alias via tsconfig
// but we use a relative path here to keep the script independent.
import { APA_TC_SECTIONS } from '../src/data/apa-tc-sections.js';

const API_KEY = process.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Error: VITE_GEMINI_API_KEY env var is required');
  process.exit(1);
}

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${API_KEY}`;

interface EmbeddedChunk {
  sectionId: string;
  title: string;
  text: string;
  embedding: number[];
}

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Embedding API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

async function main() {
  console.log(`Embedding ${APA_TC_SECTIONS.length} sections...`);

  const chunks: EmbeddedChunk[] = [];

  for (const section of APA_TC_SECTIONS) {
    const input = `${section.title}\n\n${section.text}`;
    console.log(`  [${section.sectionId}] ${section.title} (${input.length} chars)`);
    const embedding = await embedText(input);
    chunks.push({
      sectionId: section.sectionId,
      title: section.title,
      text: section.text,
      embedding,
    });
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  const outPath = resolve(import.meta.dirname, '../src/data/apa-tc-chunks.json');
  writeFileSync(outPath, JSON.stringify(chunks, null, 2));
  console.log(`\nWrote ${chunks.length} chunks to ${outPath}`);
  console.log(`File size: ${(JSON.stringify(chunks).length / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the embedding script**

Run: `VITE_GEMINI_API_KEY=$(grep VITE_GEMINI_API_KEY .env | cut -d= -f2) npx tsx scripts/embed-tc-chunks.ts`

Expected: Output showing each section being embedded, final file written to `src/data/apa-tc-chunks.json` at ~100-150KB.

- [ ] **Step 3: Verify the generated JSON structure**

Run: `node -e "const d = require('./src/data/apa-tc-chunks.json'); console.log('Chunks:', d.length); console.log('First embedding dim:', d[0].embedding.length); console.log('Sample:', d[0].sectionId, d[0].title)"`

Expected:
```
Chunks: 28
First embedding dim: 768
Sample: 1 Your Services
```

- [ ] **Step 4: Commit**

```bash
git add scripts/embed-tc-chunks.ts src/data/apa-tc-chunks.json
git commit -m "feat(ai): add embedding script and pre-computed T&C chunk vectors"
```

---

### Task 3: Cosine similarity search

**Files:**
- Create: `src/lib/tc-search.ts`
- Create: `src/lib/__tests__/tc-search.test.ts`

Pure functions for cosine similarity and ranking chunks. No API calls — this runs entirely in the browser against the pre-computed embeddings.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/tc-search.test.ts
import { describe, it, expect } from 'vitest';
import { cosineSimilarity, rankChunks } from '../tc-search';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it('handles non-unit vectors', () => {
    const a = [3, 4];
    const b = [6, 8]; // same direction, different magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});

describe('rankChunks', () => {
  const chunks = [
    { sectionId: 'A', title: 'First', text: 'aaa', embedding: [1, 0, 0] },
    { sectionId: 'B', title: 'Second', text: 'bbb', embedding: [0, 1, 0] },
    { sectionId: 'C', title: 'Third', text: 'ccc', embedding: [0, 0, 1] },
  ];

  it('ranks by cosine similarity descending', () => {
    const queryEmbedding = [1, 0.1, 0]; // closest to A
    const results = rankChunks(queryEmbedding, chunks, 3);
    expect(results[0].sectionId).toBe('A');
  });

  it('respects topK limit', () => {
    const results = rankChunks([1, 1, 1], chunks, 2);
    expect(results).toHaveLength(2);
  });

  it('returns all chunks if topK exceeds length', () => {
    const results = rankChunks([1, 1, 1], chunks, 10);
    expect(results).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/tc-search.test.ts`
Expected: FAIL — module `tc-search` not found

- [ ] **Step 3: Implement the search module**

```ts
// src/lib/tc-search.ts

export interface TCChunk {
  sectionId: string;
  title: string;
  text: string;
  embedding: number[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export function rankChunks(
  queryEmbedding: number[],
  chunks: TCChunk[],
  topK: number,
): TCChunk[] {
  return chunks
    .map(chunk => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => chunk);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/tc-search.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/tc-search.ts src/lib/__tests__/tc-search.test.ts
git commit -m "feat(ai): add cosine similarity search for T&C chunks"
```

---

### Task 4: Intent classifier

**Files:**
- Create: `src/lib/classify-input.ts`
- Create: `src/lib/__tests__/classify-input.test.ts`

A local heuristic classifier (no API call) that determines if user input is a timesheet entry or a T&C question. Fast, free, works offline. Falls back to "question" for ambiguous inputs.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/classify-input.test.ts
import { describe, it, expect } from 'vitest';
import { classifyInput } from '../classify-input';

describe('classifyInput', () => {
  // Timesheet entries
  it('classifies input with call/wrap times as timesheet', () => {
    expect(classifyInput('Call 0800 wrap 1700')).toBe('timesheet');
  });

  it('classifies input with role + rate as timesheet', () => {
    expect(classifyInput('Gaffer Monday £568')).toBe('timesheet');
  });

  it('classifies multi-day shoot as timesheet', () => {
    expect(classifyInput('3 day shoot as DoP at £1200')).toBe('timesheet');
  });

  it('classifies input with time patterns as timesheet', () => {
    expect(classifyInput('6am to 9pm as Focus Puller')).toBe('timesheet');
  });

  // T&C questions
  it('classifies question about overtime as question', () => {
    expect(classifyInput('What overtime grade is a Gaffer?')).toBe('question');
  });

  it('classifies question about cancellation as question', () => {
    expect(classifyInput('How do cancellation fees work?')).toBe('question');
  });

  it('classifies question about breaks as question', () => {
    expect(classifyInput('What happens if my first break is missed?')).toBe('question');
  });

  it('classifies question about mileage as question', () => {
    expect(classifyInput('How much mileage can I claim outside the M25?')).toBe('question');
  });

  it('classifies question about holiday pay as question', () => {
    expect(classifyInput('What is the holiday pay entitlement?')).toBe('question');
  });

  it('classifies input with question mark as question', () => {
    expect(classifyInput('Can I claim travel on a rest day?')).toBe('question');
  });

  // Ambiguous — defaults to question
  it('defaults ambiguous input to question', () => {
    expect(classifyInput('overtime rules')).toBe('question');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/classify-input.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the classifier**

```ts
// src/lib/classify-input.ts

export type InputIntent = 'timesheet' | 'question';

// Patterns that strongly indicate timesheet data entry
const TIMESHEET_PATTERNS = [
  // Times: 0800, 08:00, 6am, 6pm, 18:00
  /\b\d{4}\b/,                          // 0800
  /\b\d{1,2}:\d{2}\b/,                  // 08:00
  /\b\d{1,2}\s*(am|pm)\b/i,             // 6am, 6pm
  // Call/wrap keywords with time-like context
  /\b(call|wrap|called|wrapped)\s+(at\s+)?\d/i,
  // Rate: £568, £1,200
  /£\d+/,
  // Multi-day patterns: "3 day shoot", "2 days"
  /\b\d+\s*day(s)?\s*(shoot|as|at)\b/i,
];

// Patterns that indicate a question
const QUESTION_PATTERNS = [
  /\?$/,                                 // ends with ?
  /^(what|how|when|where|why|who|can|do|does|is|are|should|would|could)\b/i,
  /\b(explain|tell me|what's|whats|what is|how much|how many|how does|how do)\b/i,
];

export function classifyInput(input: string): InputIntent {
  const trimmed = input.trim();

  // Count signals for each category
  const timesheetScore = TIMESHEET_PATTERNS.filter(p => p.test(trimmed)).length;
  const questionScore = QUESTION_PATTERNS.filter(p => p.test(trimmed)).length;

  // Strong timesheet signal: has time data AND no question markers
  if (timesheetScore >= 2 && questionScore === 0) return 'timesheet';

  // Any question signal wins if no strong timesheet signal
  if (questionScore > 0) return 'question';

  // Weak timesheet signal (only 1 pattern, no question markers)
  if (timesheetScore >= 1) return 'timesheet';

  // Default: question (less disruptive if wrong)
  return 'question';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/classify-input.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/classify-input.ts src/lib/__tests__/classify-input.test.ts
git commit -m "feat(ai): add local intent classifier for timesheet vs T&C question"
```

---

### Task 5: Gemini embedding + T&C chat helpers

**Files:**
- Modify: `src/lib/gemini.ts` (add `embedText` function)
- Create: `src/lib/tc-chat.ts` (T&C answer generation with conversation history)

- [ ] **Step 1: Add embedText to gemini.ts**

Add this function to the bottom of `src/lib/gemini.ts`:

```ts
// --- Embedding ---

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;

export async function embedText(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

  const response = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error?.message || `Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding.values;
}
```

- [ ] **Step 2: Create the T&C chat module**

```ts
// src/lib/tc-chat.ts

import type { TCChunk } from './tc-search';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TCAnswer {
  content: string;
  sections: string[]; // e.g. ["4.1", "4.2"]
}

function buildSystemPrompt(chunks: TCChunk[]): string {
  const context = chunks
    .map(c => `[Section ${c.sectionId}: ${c.title}]\n${c.text}`)
    .join('\n\n---\n\n');

  return `You are a knowledgeable assistant for UK commercials crew members. You answer questions about the APA Recommended Terms for Engaging Crew on the Production of Commercials (2025 edition).

RULES:
1. Answer ONLY based on the APA T&C context provided below. Do not make up information.
2. If the context does not contain the answer, say so honestly — suggest which section might be relevant or recommend the user check the full document.
3. Use clear, crew-friendly language. Avoid unnecessary legalese.
4. When referencing specific rates, grades, or rules, be precise and include the numbers.
5. At the END of your answer, on a new line, list the section numbers you referenced in this exact format:
   SOURCES: 4.1, 4.2, 6.2
   If no sections were referenced, write: SOURCES: none

APA T&C CONTEXT:
${context}`;
}

export async function askTCQuestion(
  question: string,
  chunks: TCChunk[],
  history: ChatMessage[],
): Promise<TCAnswer> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

  const systemPrompt = buildSystemPrompt(chunks);

  // Build conversation contents for Gemini
  const contents = [
    {
      role: 'user' as const,
      parts: [{ text: systemPrompt }],
    },
    {
      role: 'model' as const,
      parts: [{ text: 'I understand. I\'ll answer questions about the APA T&Cs based only on the context provided, citing section numbers in every answer.' }],
    },
    // Previous conversation turns
    ...history.map(msg => ({
      role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
      parts: [{ text: msg.content }],
    })),
    // Current question
    {
      role: 'user' as const,
      parts: [{ text: question }],
    },
  ];

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini. Please try again.');

  // Parse SOURCES line from the end of the response
  const sourcesMatch = text.match(/SOURCES:\s*(.+)$/im);
  const sections = sourcesMatch
    ? sourcesMatch[1].split(',').map((s: string) => s.trim()).filter((s: string) => s && s !== 'none')
    : [];

  // Remove the SOURCES line from the displayed content
  const content = text.replace(/\n?SOURCES:\s*.+$/im, '').trim();

  return { content, sections };
}
```

- [ ] **Step 3: Verify both files compile**

Run: `npx tsc -b 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/gemini.ts src/lib/tc-chat.ts
git commit -m "feat(ai): add Gemini embedding helper and T&C chat module"
```

---

### Task 6: Wire up the AI Input page — classification + chat UI

**Files:**
- Modify: `src/pages/AIInputPage.tsx`

This is the main UI task. The page gets a new `'chat'` stage alongside the existing `'input'` and `'review'` stages. The input stage is updated with new examples and the send handler now classifies intent before routing.

- [ ] **Step 1: Update the stage type and add chat state**

At the top of `AIInputPage.tsx`, change the `Stage` type and add chat-related imports and state:

Replace:
```ts
type Stage = 'input' | 'review';
```

With:
```ts
type Stage = 'input' | 'review' | 'chat';
```

Add these imports near the top of the file (alongside existing imports):
```ts
import { classifyInput } from '@/lib/classify-input';
import { embedText } from '@/lib/gemini';
import { rankChunks, type TCChunk } from '@/lib/tc-search';
import { askTCQuestion, type ChatMessage, type TCAnswer } from '@/lib/tc-chat';
import { MessageSquare, RotateCcw } from 'lucide-react';
import tcChunksData from '@/data/apa-tc-chunks.json';

const tcChunks = tcChunksData as TCChunk[];
```

Add chat state inside the `AIInputPage` component, after the existing state declarations:
```ts
  // Chat state
  const [chatMessages, setChatMessages] = useState<(ChatMessage & { sections?: string[] })[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
```

- [ ] **Step 2: Update the handleParse function to classify input**

Replace the existing `handleParse` function with a new `handleSubmit` that classifies first:

```ts
  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);

    const intent = classifyInput(input);

    if (intent === 'question') {
      // Route to chat
      setChatMessages([{ role: 'user', content: input }]);
      setChatInput('');
      setStage('chat');
      setChatLoading(true);
      setLoading(false);

      try {
        const queryEmbedding = await embedText(input);
        const relevantChunks = rankChunks(queryEmbedding, tcChunks, 5);
        const answer = await askTCQuestion(input, relevantChunks, []);
        setChatMessages(prev => [...prev, { role: 'assistant', content: answer.content, sections: answer.sections }]);
      } catch (err) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I couldn't process that question. ${err instanceof Error ? err.message : 'Please try again.'}` }]);
      } finally {
        setChatLoading(false);
      }
      return;
    }

    // Timesheet flow (existing)
    try {
      const parsed = await parseTimesheetWithGemini(input);
      setEntries(parsed.map((e, i) => {
        const entry: EditableEntry = { ...e, _id: `entry-${i}-${Date.now()}` };
        if (!entry.callTime) {
          entry.callTime = '08:00';
          entry.missingFields = entry.missingFields.filter(f => f !== 'callTime');
        }
        if (entry.dayType === 'rest') {
          entry.missingFields = entry.missingFields.filter(f => f !== 'callTime' && f !== 'wrapTime');
        } else if (!entry.wrapTime) {
          const hours = DEFAULT_WRAP_HOURS[entry.dayType];
          if (hours !== undefined) {
            entry.wrapTime = addHoursToTime(entry.callTime, hours);
            entry.missingFields = entry.missingFields.filter(f => f !== 'wrapTime');
          }
        }
        return entry;
      }));
      setProjectName('');
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };
```

Update the `onKeyDown` handler on the `<Textarea>` and the `<Button>` onClick in the input stage to call `handleSubmit` instead of `handleParse`.

- [ ] **Step 3: Add the chat follow-up handler**

Add this function after `handleSubmit`:

```ts
  const handleChatFollowUp = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const question = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: question }]);
    setChatLoading(true);

    try {
      // Build history from existing messages (exclude sections metadata)
      const history: ChatMessage[] = chatMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const queryEmbedding = await embedText(question);
      const relevantChunks = rankChunks(queryEmbedding, tcChunks, 5);
      const answer = await askTCQuestion(question, relevantChunks, history);
      setChatMessages(prev => [...prev, { role: 'assistant', content: answer.content, sections: answer.sections }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong. ${err instanceof Error ? err.message : 'Please try again.'}` }]);
    } finally {
      setChatLoading(false);
    }
  };
```

- [ ] **Step 4: Update the examples section in the input stage**

Replace the existing examples array with two groups:

```tsx
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Try an example</CardTitle>
            <CardDescription>Click any example to load it</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Timesheet entries</p>
              <div className="space-y-2">
                {[
                  'Call 0800 wrap 1700 + 2h OT',
                  'I was a Focus Puller on Monday at £558. Called at 7am, wrapped at 10pm.',
                  '2 day shoot as Gaffer at £568. Monday 0800–2100, Tuesday 0700–1900 continuous day.',
                ].map((example, i) => (
                  <button
                    key={`ts-${i}`}
                    className="w-full text-left p-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/50 hover:border-[#1F1F21]/20 transition-all"
                    onClick={() => setInput(example)}
                  >
                    "{example}"
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Ask about APA T&Cs</p>
              <div className="space-y-2">
                {[
                  'What overtime grade is a Gaffer?',
                  'How do cancellation fees work for a 4-day shoot?',
                  'What happens if my first break is missed?',
                  'How much mileage can I claim outside the M25?',
                ].map((example, i) => (
                  <button
                    key={`qa-${i}`}
                    className="w-full text-left p-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/50 hover:border-[#1F1F21]/20 transition-all"
                    onClick={() => setInput(example)}
                  >
                    "{example}"
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
```

- [ ] **Step 5: Update the page header card**

Update the `CardTitle` and `CardDescription` in the input stage to reflect the dual-mode:

```tsx
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> AI Assistant
            </CardTitle>
            <CardDescription>
              Enter a timesheet in plain English or ask any question about the APA Terms & Conditions.
            </CardDescription>
```

Also update the button label from "Review" to "Send":

```tsx
              <Button onClick={handleSubmit} disabled={loading || !input.trim()}>
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing…</>
                  : <><Send className="h-4 w-4 mr-1" /> Send</>
                }
              </Button>
```

- [ ] **Step 6: Add the chat stage render block**

Add this block between the input stage return and the review stage return (before `// ─── Review stage`):

```tsx
  // ─── Chat stage ──────────────────────────────────────────────────────────

  if (stage === 'chat') {
    return (
      <ProLockOverlay
        featureName="AI Assistant"
        featureDescription="Ask questions about APA T&Cs or enter timesheets in plain text."
      >
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setStage('input'); setChatMessages([]); setInput(''); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> APA T&C Assistant
              </h2>
              <p className="text-sm text-muted-foreground">
                Answers based on the APA Recommended Terms 2025
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setChatMessages([]); setChatInput(''); }}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> New chat
            </Button>
          </div>

          {/* Messages */}
          <div className="space-y-3">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-start' : 'justify-end',
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                    msg.role === 'user'
                      ? 'bg-muted text-foreground'
                      : 'bg-[#1F1F21] text-white',
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.role === 'assistant' && msg.sections && msg.sections.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                      {msg.sections.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/10 text-[11px] font-medium text-white/70"
                        >
                          S.{s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {chatLoading && (
              <div className="flex justify-end">
                <div className="bg-[#1F1F21] rounded-2xl px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#FFD528] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-[#FFD528] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-[#FFD528] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-white/50">Checking the T&Cs...</span>
                </div>
              </div>
            )}
          </div>

          {/* Follow-up input */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Ask a follow-up question..."
                  className="min-h-[60px] text-sm flex-1 resize-none"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleChatFollowUp(); }}
                />
                <Button
                  onClick={handleChatFollowUp}
                  disabled={chatLoading || !chatInput.trim()}
                  className="self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ProLockOverlay>
    );
  }
```

- [ ] **Step 7: Verify the page compiles**

Run: `npx tsc -b 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/pages/AIInputPage.tsx
git commit -m "feat(ai): add T&C Q&A chat mode to AI Input page"
```

---

### Task 7: Update page title and manual test

**Files:**
- Modify: `src/pages/AIInputPage.tsx` (minor — update `usePageTitle`)

- [ ] **Step 1: Update the page title**

Change:
```ts
usePageTitle('AI Input');
```
To:
```ts
usePageTitle('AI Assistant');
```

- [ ] **Step 2: Run the full build to verify everything compiles**

Run: `npx tsc -b && npx vite build 2>&1 | tail -20`
Expected: Build succeeds, no errors. The `apa-tc-chunks.json` should appear in the bundle output.

- [ ] **Step 3: Run all existing tests to verify nothing is broken**

Run: `npx vitest run`
Expected: All tests pass (including new tests from Tasks 3 and 4)

- [ ] **Step 4: Manual smoke test**

Run: `npx vite dev`

Test these scenarios:
1. Type "Call 0800 wrap 1700" and click Send — should route to the existing review/edit cards
2. Type "What overtime grade is a Gaffer?" and click Send — should show chat UI with bouncing dots, then an answer citing Section 4 / Appendix 1
3. In the chat, type a follow-up "What about on a Saturday?" — should answer with Saturday overtime rules
4. Click "New chat" — should clear the thread
5. Click the back arrow — should return to the input page
6. Click a T&C example — should load into the input field

- [ ] **Step 5: Commit the page title change and push**

```bash
git add src/pages/AIInputPage.tsx
git commit -m "chore(ai): rename AI Input to AI Assistant"
git push
```
