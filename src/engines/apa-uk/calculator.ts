import type { CrewRole } from './rates';
import * as Sentry from '@sentry/react';

export type DayType =
  | 'basic_working'
  | 'continuous_working'
  | 'prep'
  | 'recce'
  | 'build_strike'
  | 'pre_light'
  | 'rest'
  | 'travel';

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | 'bank_holiday';

export type CallType = 'standard' | 'early' | 'late' | 'night';

export interface CalculationInput {
  role: CrewRole;
  agreedDailyRate: number;
  dayType: DayType;
  dayOfWeek: DayOfWeek;
  callTime: string; // HH:MM format
  wrapTime: string; // HH:MM format
  // Break inputs - time-based
  firstBreakGiven: boolean;
  firstBreakTime?: string; // HH:MM - when first break was given
  firstBreakDurationMins: number; // actual duration (default 60 for basic, 30 for continuous)
  secondBreakGiven: boolean;
  secondBreakTime?: string; // HH:MM - when second break was given
  secondBreakDurationMins: number; // actual duration (default 30)
  // Continuous working day breaks
  continuousFirstBreakGiven: boolean; // 30min break after 9hrs
  continuousAdditionalBreakGiven: boolean; // 30min break after 12.5hrs
  travelHours: number;
  mileageOutsideM25: number;
  previousWrapTime?: string; // for time-off-the-clock calculation
  preCallStartTime?: string; // HH:MM - individual start before unit call
  equipmentValue?: number;    // gross equipment charge
  equipmentDiscount?: number; // discount % (0–100)
}

export interface CalculationLineItem {
  description: string;
  hours: number;
  rate: number;
  total: number;
  timeFrom?: string; // HH:MM — start of this charge period
  timeTo?: string;   // HH:MM — end of this charge period
  isDayRate?: boolean; // flat day fee — display as rate×1, not rate×hours
}

export interface CalculationResult {
  lineItems: CalculationLineItem[];
  subtotal: number;
  travelPay: number;
  mileage: number;
  mileageMiles: number;
  penalties: CalculationLineItem[];
  equipmentValue: number;
  equipmentDiscount: number;
  equipmentTotal: number;
  grandTotal: number;
  callType: CallType;
  dayDescription: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) {
    Sentry.captureException(new Error(`Invalid time format: "${time}"`), { extra: { context: 'calculation-engine timeToMinutes' } });
  }
  return h * 60 + m;
}

// Add hours (decimal) to a HH:MM string, wrapping past midnight
function addHoursToTime(baseTime: string, hours: number): string {
  const totalMins = Math.round(timeToMinutes(baseTime) + hours * 60);
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getCallType(callTimeStr: string, dayType: DayType): CallType {
  const mins = timeToMinutes(callTimeStr);
  const hour = Math.floor(mins / 60);

  if (dayType !== 'basic_working' && dayType !== 'continuous_working' && dayType !== 'pre_light') {
    return 'standard';
  }

  if (hour >= 17 || hour < 5) return 'night';
  if (hour >= 5 && hour < 7) return 'early';
  if (hour >= 7 && hour < 11) return 'standard';
  if (hour >= 11 && hour < 17) return 'late';
  return 'standard';
}

function calculateDayLengthHours(callTime: string, wrapTime: string): number {
  let callMins = timeToMinutes(callTime);
  let wrapMins = timeToMinutes(wrapTime);
  if (wrapMins <= callMins) wrapMins += 24 * 60; // wrap is next day
  return (wrapMins - callMins) / 60;
}

function isWeekend(day: DayOfWeek): boolean {
  return day === 'saturday' || day === 'sunday' || day === 'bank_holiday';
}

// Helper: split OT hours into regular and after-midnight (3xBHR) portions
// Per Section 4.4/4.6/4.7: triple time for all OT between midnight and 5am, and continuously thereafter until wrap
function splitAfterMidnightOT(
  otHours: number,
  callTime: string,
  wrapTime: string,
  dayLength: number
): { regularOT: number; midnightOT: number } {
  if (otHours <= 0) return { regularOT: 0, midnightOT: 0 };

  const callMins = timeToMinutes(callTime);
  const wrapMins = timeToMinutes(wrapTime);
  const wrapActual = wrapMins <= callMins ? wrapMins + 24 * 60 : wrapMins;

  // Midnight is at 24*60 from the perspective of the call day
  const midnightMins = 24 * 60;

  // If wrap is after midnight (wrap actual > midnight)
  if (wrapActual > midnightMins) {
    // Hours after midnight = wrap - midnight
    const afterMidnightTotal = (wrapActual - midnightMins) / 60;
    // The OT portion that falls after midnight
    const midnightOT = Math.min(otHours, afterMidnightTotal);
    const regularOT = otHours - midnightOT;
    return { regularOT, midnightOT };
  }

  return { regularOT: otHours, midnightOT: 0 };
}

export function calculateCrewCost(input: CalculationInput): CalculationResult {
  const { role, agreedDailyRate, dayOfWeek, callTime, wrapTime } = input;
  let { dayType } = input;

  // APA S.2.3: DOP, Art Directors and Location Managers are always on Basic Working Day
  // terms even on non-shooting days (prep/recce/build_strike/pre_light).
  // Their day is treated as 10+1hrs with OT after 11hrs.
  const isBasicWorkingNSD = role.specialRules === 'basic_working_nsd';
  if (isBasicWorkingNSD && (dayType === 'prep' || dayType === 'recce' || dayType === 'build_strike' || dayType === 'pre_light')) {
    dayType = 'basic_working';
  }

  const bdr = agreedDailyRate;
  const bhr = role.customBhr ?? Math.round(bdr / 10);
  const dayLength = calculateDayLengthHours(callTime, wrapTime);
  const lineItems: CalculationLineItem[] = [];
  const penalties: CalculationLineItem[] = [];
  const isSaturday = dayOfWeek === 'saturday';
  const isSundayOrBH = dayOfWeek === 'sunday' || dayOfWeek === 'bank_holiday';
  const isWeekday = !isWeekend(dayOfWeek);

  // Determine OT coefficient from the role data
  const otCoefficient = role.otCoefficient;
  const otRate = role.customOtRate ?? Math.round(bhr * otCoefficient);
  const tripleBhr = bhr * 3;

  // PM/PA/Runner special handling (Appendix 1)
  const isPMPARunner = role.specialRules === 'pm_pa_runner';

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

  // Buyout: return agreed daily rate as a single line item, no OT or BHR breakdown.
  if (role.isBuyout) {
    const eqTotal = Math.round((input.equipmentValue ?? 0) * (1 - (input.equipmentDiscount ?? 0) / 100));
    return {
      lineItems: [{ description: 'Day Rate (buyout)', hours: 1, rate: bdr, total: bdr }],
      subtotal: bdr,
      travelPay: 0,
      mileage: input.mileageOutsideM25 > 0 ? input.mileageOutsideM25 * 0.50 : 0,
      mileageMiles: input.mileageOutsideM25,
      penalties: [],
      equipmentValue: input.equipmentValue ?? 0,
      equipmentDiscount: input.equipmentDiscount ?? 0,
      equipmentTotal: eqTotal,
      grandTotal: bdr + eqTotal + (input.mileageOutsideM25 > 0 ? input.mileageOutsideM25 * 0.50 : 0),
      callType: 'standard',
      dayDescription: 'Buyout',
    };
  }

  // Per APA T&Cs Section 6.2 (two thresholds):
  //   > 5.5 hrs after call  → first break is "delayed" → £10 penalty
  //   > 6.5 hrs after call  → day converts to Continuous Working Day (no further lunch penalties)
  // If no break is given at all the day is treated as Continuous Working Day.
  let convertedToContinuous = false;
  if (dayType === 'basic_working' && !isPMPARunner) {
    let breakMissedOrTooLate = false;

    if (!input.firstBreakGiven) {
      breakMissedOrTooLate = true;
    } else if (input.firstBreakTime) {
      const callMins = timeToMinutes(callTime);
      const breakMins = timeToMinutes(input.firstBreakTime);
      let breakAfterCall = breakMins - callMins;
      if (breakAfterCall < 0) breakAfterCall += 24 * 60;
      if (breakAfterCall / 60 > 6.5) {
        breakMissedOrTooLate = true;
      }
    }

    if (breakMissedOrTooLate) {
      convertedToContinuous = true;
      dayType = 'continuous_working';
    }
  }

  const callType = getCallType(callTime, dayType);

  // Calculate curtailment adjustment for OT start time (Section 6.2)
  // "If first break is curtailed then overtime will commence eleven hours from the
  // start time less the amount of time the first break was curtailed by"
  let curtailmentAdjustMins = 0;
  if (dayType === 'basic_working' && !convertedToContinuous && input.firstBreakGiven) {
    const curtailedMins = 60 - input.firstBreakDurationMins;
    if (curtailedMins > 0) {
      curtailmentAdjustMins = curtailedMins;
    }
  }
  const otStartHours = 11 - curtailmentAdjustMins / 60; // Adjusted OT start for basic working day

  if (dayType === 'rest') {
    // Section 2.3: Rest day - flat fee = BDR, no overtime, any day of week
    lineItems.push({ description: 'Rest Day (flat fee)', hours: 1, rate: bdr, total: bdr });

  } else if (dayType === 'travel') {
    // Section 3: Travel provisions do NOT apply to PM/PA/Runners
    if (isPMPARunner) {
      lineItems.push({ description: 'Travel Day (not applicable to PM/PA/Runner)', hours: 0, rate: 0, total: 0 });
    } else {
      // Section 3/2.4(xiii)(xiv): Travel day - BHR per hour, min 5 hours, regardless of day
      const travelHrs = Math.max(dayLength, 5);
      lineItems.push({ description: 'Travel Day', hours: travelHrs, rate: bhr, total: travelHrs * bhr });
    }

  } else if (dayType === 'prep' || dayType === 'recce' || dayType === 'build_strike') {
    // Section 2.3: Non-shooting day - 8 hours at BHR, OT after 8 hrs at standard OT rate
    // Section 2.3 table: *if first break is given, OT starts after 9 hours
    // Section 2.4(vii)(viii): Weekend rates apply
    const baseHours = 8;
    const breakGivenOnNSD = input.firstBreakGiven;
    const otStartNSD = breakGivenOnNSD ? 9 : 8; // If break given, OT after 9hrs not 8hrs
    const rateMultiplier = isSundayOrBH ? 2 : isSaturday ? 1.5 : 1;
    // Derive rate from BDR to avoid double-rounding through bhr
    const hourlyRate = Math.round(bdr * rateMultiplier / 10);
    const nsdOtStartTime = addHoursToTime(callTime, otStartNSD);
    lineItems.push({
      description: `${dayType === 'build_strike' ? 'Build/Strike' : dayType.charAt(0).toUpperCase() + dayType.slice(1)} Day`,
      hours: baseHours,
      rate: hourlyRate,
      total: baseHours * hourlyRate,
      timeFrom: callTime,
      timeTo: nsdOtStartTime,
      isDayRate: true,
    });
    // PM/PA/Runner: no OT on non-shooting days (Appendix 1(a): "SHOOT DAYS ONLY")
    if (!isPMPARunner) {
      const otHours = Math.max(0, dayLength - otStartNSD);
      if (otHours > 0) {
        const nsdOtRate = isWeekday ? otRate : Math.round(bdr * rateMultiplier / 10);
        lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: nsdOtRate, total: roundOTHours(otHours) * nsdOtRate, timeFrom: nsdOtStartTime, timeTo: wrapTime });
      }
    }

  } else if (dayType === 'pre_light') {
    // Section 2.3: Pre-light - 8hrs + 1hr lunch, OT after 9hrs at standard OT rate
    // Section 2.4(ix)(x): Weekend rates apply
    const baseHours = 8;
    const rateMultiplier = isSundayOrBH ? 2 : isSaturday ? 1.5 : 1;
    // Derive rate from BDR to avoid double-rounding through bhr
    const hourlyRate = Math.round(bdr * rateMultiplier / 10);
    const plOtStartTime = addHoursToTime(callTime, 9);

    // Early call OT for pre-light days (Section 2.1.3: early call applies all days)
    if (callType === 'early' && !isPMPARunner) {
      const callMins = timeToMinutes(callTime);
      const earlyHours = Math.max(0, (7 * 60 - callMins) / 60);
      const plEarlyOtRate = isWeekday ? otRate : Math.round(bdr * rateMultiplier / 10);
      lineItems.push({
        description: `Early Call Overtime (${callTime}-07:00)`,
        hours: earlyHours,
        rate: plEarlyOtRate,
        total: earlyHours * plEarlyOtRate,
        timeFrom: callTime,
        timeTo: '07:00',
      });
    }

    lineItems.push({
      description: 'Pre-light Day',
      hours: baseHours,
      rate: hourlyRate,
      total: baseHours * hourlyRate,
      timeFrom: callTime,
      timeTo: plOtStartTime,
      isDayRate: true,
    });
    // Section 2.3 table: £7.50 meal allowance if meal not provided on pre-light
    if (!input.firstBreakGiven) {
      penalties.push({ description: 'Pre-light meal allowance (not provided)', hours: 0, rate: 7.50, total: 7.50 });
    }
    // PM/PA/Runner: no OT on non-shooting days (Appendix 1(a): "SHOOT DAYS ONLY")
    if (!isPMPARunner) {
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const plOtRate = isWeekday ? otRate : Math.round(bdr * rateMultiplier / 10);
        lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: plOtRate, total: roundOTHours(otHours) * plOtRate, timeFrom: plOtStartTime, timeTo: wrapTime });
      }
    }

  } else if (dayType === 'continuous_working') {
    // Section 2.2: Continuous working day - 9 hrs, no lunch break
    const contOtStartTime = addHoursToTime(callTime, 9);

    if (callType === 'night') {
      // Section 2.2.5: Night continuous - 2xBDR for 9hrs, OT at 2xBHR
      const doubleBdr = bdr * 2;
      lineItems.push({ description: 'Night Continuous Working Day (2x BDR)', hours: 9, rate: doubleBdr, total: doubleBdr, timeFrom: callTime, timeTo: contOtStartTime });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const nightOtRate = bhr * 2;
        lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: nightOtRate, total: roundOTHours(otHours) * nightOtRate, timeFrom: contOtStartTime, timeTo: wrapTime });
      }
    } else if (isSaturday) {
      // Section 2.4(v): Saturday continuous - 1.5xBDR, OT at 1.5xBHR
      const satBdr = Math.round(bdr * 1.5);
      lineItems.push({ description: 'Saturday Continuous Working Day (1.5x BDR)', hours: 9, rate: satBdr, total: satBdr, timeFrom: callTime, timeTo: contOtStartTime });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const satOtRate = Math.round(bdr * 1.5 / 10);
        // FIX #20: After-midnight triple time on continuous days
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime (1.5x BHR)', hours: regularOT, rate: satOtRate, total: regularOT * satOtRate, timeFrom: contOtStartTime, timeTo: wrapTime });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
        }
      }
    } else if (isSundayOrBH) {
      // Section 2.4(vi): Sunday/BH continuous - 2xBDR, OT at 2xBHR
      const sunBdr = bdr * 2;
      lineItems.push({ description: 'Sunday/BH Continuous Working Day (2x BDR)', hours: 9, rate: sunBdr, total: sunBdr, timeFrom: callTime, timeTo: contOtStartTime });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const sunOtRate = bhr * 2;
        // FIX #20: After-midnight triple time on continuous days
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime (2x BHR)', hours: regularOT, rate: sunOtRate, total: regularOT * sunOtRate, timeFrom: contOtStartTime, timeTo: wrapTime });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
        }
      }
    } else if (callType === 'early') {
      // Section 2.2.3: Early call continuous - OT for 5am-7am, BDR 9hrs, OT after 9hrs from call
      const callMins = timeToMinutes(callTime);
      const earlyHours = Math.max(0, (7 * 60 - callMins) / 60);
      const earlyContOtStart = addHoursToTime(callTime, 9);
      lineItems.push({ description: `Early Call Overtime (${callTime}-07:00)`, hours: earlyHours, rate: otRate, total: earlyHours * otRate, timeFrom: callTime, timeTo: '07:00' });
      lineItems.push({ description: 'Continuous Working Day (BDR)', hours: 9, rate: bdr, total: bdr, timeFrom: '07:00', timeTo: earlyContOtStart });
      // FIX #7: OT after 9 hours from call time (NOT subtracting earlyHours)
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        // FIX #20: After-midnight triple time
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: regularOT * otRate, timeFrom: earlyContOtStart, timeTo: wrapTime });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
        }
      }
    } else if (callType === 'late') {
      // Section 2.2.4: Late call continuous - day starts at 11am, BDR 9hrs
      const lateContOtStart = addHoursToTime('11:00', 9);
      lineItems.push({ description: 'Late Call Continuous Working Day (from 11:00)', hours: 9, rate: bdr, total: bdr, timeFrom: callTime, timeTo: lateContOtStart });
      const effectiveLength = calculateDayLengthHours('11:00', wrapTime);
      const otHours = Math.max(0, effectiveLength - 9);
      if (otHours > 0) {
        // FIX #20: After-midnight triple time
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), '11:00', wrapTime, effectiveLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: regularOT * otRate, timeFrom: lateContOtStart, timeTo: wrapTime });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
        }
      }
    } else {
      // Section 2.2.1: Standard continuous
      lineItems.push({ description: 'Continuous Working Day (BDR)', hours: 9, rate: bdr, total: bdr, timeFrom: callTime, timeTo: contOtStartTime });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        // FIX #20: After-midnight triple time
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: regularOT * otRate, timeFrom: contOtStartTime, timeTo: wrapTime });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
        }
      }
    }

  } else {
    // BASIC WORKING DAY (Section 2.1)
    // Section 2.1.3: "Early call rule applies on all days throughout a week, Monday to Sunday"
    // So early call must be checked BEFORE weekend branches
    // OT start time for basic working day (from call, adjusted for curtailment)
    const basicOtStartTime = addHoursToTime(callTime, otStartHours);

    if (callType === 'night') {
      // Section 2.1.2/2.1.5: Night shoot - 2xBHR for all hours, min 10 working hrs
      // Section 2.4(iii)(iv): Night on Sat/Sun also 2xBHR (no double-double)
      const nightHours = Math.max(dayLength - 1, 10); // subtract 1hr lunch, min 10
      const nightRate = bhr * 2;

      if (isPMPARunner) {
        // Appendix 1(a)(iii): PM/PA/Runner night shoot - 2x BDR, OT at 2x BHR
        const pmNightBdr = bdr * 2;
        const pmNightOtStart = addHoursToTime(callTime, 10);
        lineItems.push({ description: 'Night Shoot (2x BDR)', hours: 1, rate: pmNightBdr, total: pmNightBdr, timeFrom: callTime, timeTo: pmNightOtStart });
        const otHours = Math.max(0, nightHours - 10);
        if (otHours > 0) {
          const pmNightOtRate = bhr * 2;
          lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: pmNightOtRate, total: roundOTHours(otHours) * pmNightOtRate, timeFrom: pmNightOtStart, timeTo: wrapTime });
        }
      } else {
        lineItems.push({
          description: 'Night Shoot (2x BHR, all hours)',
          hours: nightHours,
          rate: nightRate,
          total: nightHours * nightRate,
          timeFrom: callTime,
          timeTo: wrapTime,
        });
      }

    } else if (callType === 'early') {
      // Section 2.1.3: Early call (5am-7am) - applies Mon-Sun per T&Cs
      const callMins = timeToMinutes(callTime);
      const earlyHours = Math.max(0, (7 * 60 - callMins) / 60);

      if (isPMPARunner) {
        if (isSundayOrBH) {
          const pmSunBdr = bdr * 2;
          const pmSunOtRate = bhr * 2;
          const pmSunOtStart = addHoursToTime(callTime, 11);
          lineItems.push({ description: `Early Call Overtime (${callTime}-07:00, 2x BHR)`, hours: earlyHours, rate: pmSunOtRate, total: earlyHours * pmSunOtRate, timeFrom: callTime, timeTo: '07:00' });
          lineItems.push({ description: 'Sunday/BH Basic Daily Rate (2x BDR)', hours: 11, rate: pmSunBdr, total: pmSunBdr, timeFrom: '07:00', timeTo: pmSunOtStart });
          const otHours = Math.max(0, dayLength - 11);
          if (otHours > 0) {
            lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: pmSunOtRate, total: roundOTHours(otHours) * pmSunOtRate, timeFrom: pmSunOtStart, timeTo: wrapTime });
          }
        } else if (isSaturday) {
          const pmSatBdr = Math.round(bdr * 1.5);
          const pmSatOtRate = Math.round(bdr * 1.5 / 10);
          const pmSatOtStart = addHoursToTime(callTime, 11);
          lineItems.push({ description: `Early Call Overtime (${callTime}-07:00, 1.5x BHR)`, hours: earlyHours, rate: pmSatOtRate, total: earlyHours * pmSatOtRate, timeFrom: callTime, timeTo: '07:00' });
          lineItems.push({ description: 'Saturday Basic Daily Rate (1.5x BDR)', hours: 11, rate: pmSatBdr, total: pmSatBdr, timeFrom: '07:00', timeTo: pmSatOtStart });
          const otHours = Math.max(0, dayLength - 11);
          if (otHours > 0) {
            lineItems.push({ description: 'Overtime (1.5x BHR)', hours: roundOTHours(otHours), rate: pmSatOtRate, total: roundOTHours(otHours) * pmSatOtRate, timeFrom: pmSatOtStart, timeTo: wrapTime });
          }
        } else {
          const pmWkdOtStart = addHoursToTime(callTime, 11);
          lineItems.push({ description: `Early Call Overtime (${callTime}-07:00)`, hours: earlyHours, rate: bhr, total: earlyHours * bhr, timeFrom: callTime, timeTo: '07:00' });
          lineItems.push({ description: 'Basic Daily Rate', hours: 11, rate: bdr, total: bdr, timeFrom: '07:00', timeTo: pmWkdOtStart });
          const otHours = Math.max(0, dayLength - 11);
          if (otHours > 0) {
            lineItems.push({ description: 'Overtime (BHR)', hours: roundOTHours(otHours), rate: bhr, total: roundOTHours(otHours) * bhr, timeFrom: pmWkdOtStart, timeTo: wrapTime });
          }
        }
      } else if (isSundayOrBH) {
        const sunRate = bhr * 2;
        lineItems.push({ description: `Early Call Overtime (${callTime}-07:00, 2x BHR)`, hours: earlyHours, rate: sunRate, total: earlyHours * sunRate, timeFrom: callTime, timeTo: '07:00' });
        const workedHours = Math.max(dayLength - earlyHours - 1, 10);
        const { regularOT: regularHrs, midnightOT: midnightHrs } = splitAfterMidnightOT(workedHours, '07:00', wrapTime, dayLength - earlyHours);
        if (regularHrs > 0) {
          lineItems.push({ description: 'Sunday/Bank Holiday (2x BHR)', hours: regularHrs, rate: sunRate, total: regularHrs * sunRate, timeFrom: '07:00', timeTo: wrapTime });
        }
        if (midnightHrs > 0) {
          lineItems.push({ description: 'Sunday/BH After Midnight (3x BHR)', hours: midnightHrs, rate: tripleBhr, total: midnightHrs * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
        }
      } else if (isSaturday) {
        // Section 2.4(i)/4.6: All Saturday hours at 1.5x BDR, min 10 working hrs from 07:00
        const satDayRate = Math.round(bdr * 1.5);
        const satOtRate = Math.round(bdr * 1.5 / 10);
        lineItems.push({ description: `Early Call Overtime (${callTime}-07:00, 1.5x BHR)`, hours: earlyHours, rate: satOtRate, total: earlyHours * satOtRate, timeFrom: callTime, timeTo: '07:00' });
        const workedHours = Math.max(dayLength - earlyHours - 1, 10);
        const otHours = Math.max(0, workedHours - 10);
        lineItems.push({ description: 'Saturday Basic Working Day (1.5x BDR)', hours: 1, rate: satDayRate, total: satDayRate, timeFrom: '07:00', timeTo: wrapTime });
        if (otHours > 0) {
          const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), '07:00', wrapTime, dayLength - earlyHours);
          if (regularOT > 0) {
            lineItems.push({ description: 'Saturday Overtime (1.5x BHR)', hours: regularOT, rate: satOtRate, total: regularOT * satOtRate, timeFrom: '07:00', timeTo: wrapTime });
          }
          if (midnightOT > 0) {
            lineItems.push({ description: 'Saturday After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
          }
        }
      } else {
        // Weekday early call
        lineItems.push({ description: `Early Call Overtime (${callTime}-07:00)`, hours: earlyHours, rate: otRate, total: earlyHours * otRate, timeFrom: callTime, timeTo: '07:00' });
        lineItems.push({ description: 'Basic Daily Rate', hours: 11, rate: bdr, total: bdr, timeFrom: '07:00', timeTo: basicOtStartTime });
        const otHours = Math.max(0, dayLength - otStartHours);
        if (otHours > 0) {
          const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
          if (regularOT > 0) {
            lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: regularOT * otRate, timeFrom: basicOtStartTime, timeTo: wrapTime });
          }
          if (midnightOT > 0) {
            lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
          }
        }
      }

    } else if (isSaturday) {
      // Section 2.4(i)/4.6: Saturday - 1.5xBHR for all hours, min 10 working hrs
      const workedHours = Math.max(dayLength - 1, 10); // subtract 1hr lunch

      if (isPMPARunner) {
        const pmSatBdr = Math.round(bdr * 1.5);
        const pmSatOtRate = Math.round(bdr * 1.5 / 10);
        const pmSatOtStart = addHoursToTime(callTime, 11);
        lineItems.push({ description: 'Saturday Basic Daily Rate (1.5x BDR)', hours: 1, rate: pmSatBdr, total: pmSatBdr, timeFrom: callTime, timeTo: pmSatOtStart });
        const otHours = Math.max(0, workedHours - 10);
        if (otHours > 0) {
          lineItems.push({ description: 'Overtime (1.5x BHR)', hours: roundOTHours(otHours), rate: pmSatOtRate, total: roundOTHours(otHours) * pmSatOtRate, timeFrom: pmSatOtStart, timeTo: wrapTime });
        }
      } else {
        // Section 2.4(i): Saturday = 1.5x BDR as a day rate, min 10 working hrs
        const satDayRate = Math.round(bdr * 1.5);
        const satOtRate = Math.round(bdr * 1.5 / 10);
        const otHours = Math.max(0, workedHours - 10);
        lineItems.push({ description: 'Saturday Basic Working Day (1.5x BDR)', hours: 1, rate: satDayRate, total: satDayRate, timeFrom: callTime, timeTo: wrapTime });
        if (otHours > 0) {
          const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
          if (regularOT > 0) {
            lineItems.push({ description: 'Saturday Overtime (1.5x BHR)', hours: regularOT, rate: satOtRate, total: regularOT * satOtRate, timeFrom: callTime, timeTo: wrapTime });
          }
          if (midnightOT > 0) {
            lineItems.push({ description: 'Saturday After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
          }
        }
      }

    } else if (isSundayOrBH) {
      // Section 2.4(ii)/4.7: Sunday/BH - 2xBHR for all hours, min 10 working hrs
      const workedHours = Math.max(dayLength - 1, 10); // subtract 1hr lunch

      if (isPMPARunner) {
        const pmSunBdr = bdr * 2;
        const pmSunOtRate = bhr * 2;
        const pmSunOtStart = addHoursToTime(callTime, 11);
        lineItems.push({ description: 'Sunday/BH Basic Daily Rate (2x BDR)', hours: 1, rate: pmSunBdr, total: pmSunBdr, timeFrom: callTime, timeTo: pmSunOtStart });
        const otHours = Math.max(0, workedHours - 10);
        if (otHours > 0) {
          lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: pmSunOtRate, total: roundOTHours(otHours) * pmSunOtRate, timeFrom: pmSunOtStart, timeTo: wrapTime });
        }
      } else {
        const sunRate = bhr * 2;
        const { regularOT: regularHrs, midnightOT: midnightHrs } = splitAfterMidnightOT(workedHours, callTime, wrapTime, dayLength);
        if (regularHrs > 0) {
          lineItems.push({ description: 'Sunday/Bank Holiday (2x BHR)', hours: regularHrs, rate: sunRate, total: regularHrs * sunRate, timeFrom: callTime, timeTo: wrapTime });
        }
        if (midnightHrs > 0) {
          lineItems.push({ description: 'Sunday/BH After Midnight (3x BHR)', hours: midnightHrs, rate: tripleBhr, total: midnightHrs * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
        }
      }

    } else if (callType === 'late') {
      // Section 2.1.4: Late call (Mon-Fri only) - day starts at 11am, BDR 11hrs
      const lateOtStart = addHoursToTime('11:00', 11);
      lineItems.push({ description: 'Late Call Basic Daily Rate (from 11:00)', hours: 11, rate: bdr, total: bdr, timeFrom: callTime, timeTo: lateOtStart });
      const effectiveLength = calculateDayLengthHours('11:00', wrapTime);
      const otHours = Math.max(0, effectiveLength - 11);

      if (otHours > 0 && !isPMPARunner) {
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), '11:00', wrapTime, effectiveLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: regularOT * otRate, timeFrom: lateOtStart, timeTo: wrapTime });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
        }
      } else if (otHours > 0 && isPMPARunner) {
        lineItems.push({ description: 'Overtime (BHR)', hours: roundOTHours(otHours), rate: bhr, total: roundOTHours(otHours) * bhr, timeFrom: lateOtStart, timeTo: wrapTime });
      }

    } else {
      // Section 2.1.1: Standard call (7am-11am), Mon-Fri
      lineItems.push({ description: 'Basic Daily Rate', hours: 11, rate: bdr, total: bdr, timeFrom: callTime, timeTo: basicOtStartTime });
      const otHours = Math.max(0, dayLength - otStartHours);

      if (otHours > 0 && !isPMPARunner) {
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: regularOT * otRate, timeFrom: basicOtStartTime, timeTo: wrapTime });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: midnightOT * tripleBhr, timeFrom: '00:00', timeTo: wrapTime });
        }
      } else if (otHours > 0 && isPMPARunner) {
        lineItems.push({ description: 'Overtime (BHR)', hours: roundOTHours(otHours), rate: bhr, total: roundOTHours(otHours) * bhr, timeFrom: basicOtStartTime, timeTo: wrapTime });
      }
    }
  }

  // ============= BREAK PENALTIES =============
  // Not for PM/PA/Runner, not for non-shooting days (Section 6)

  // Basic working day break penalties (only if NOT converted to continuous)
  if (!isPMPARunner && !convertedToContinuous && dayType === 'basic_working') {
    // First break (1 hour) - must begin within 5.5 hours of call (Section 6.2)
    if (input.firstBreakGiven && input.firstBreakTime) {
      const callMins = timeToMinutes(callTime);
      const breakMins = timeToMinutes(input.firstBreakTime);
      let breakAfterCall = breakMins - callMins;
      if (breakAfterCall < 0) breakAfterCall += 24 * 60;
      const breakAfterHours = breakAfterCall / 60;

      // Delayed: given after 5.5hrs but before 6.5hrs = £10 penalty
      if (breakAfterHours > 5.5 && breakAfterHours <= 6.5) {
        penalties.push({ description: 'First break delayed penalty', hours: 0, rate: 10, total: 10 });
      }

      // FIX #22: Curtailed break - penalty + OT start already adjusted above via otStartHours
      const curtailedMins = 60 - input.firstBreakDurationMins;
      if (curtailedMins > 0) {
        const curtailedPay = (curtailedMins / 60) * bhr;
        penalties.push({ description: `First break curtailed (${curtailedMins} mins short)`, hours: curtailedMins / 60, rate: bhr, total: curtailedPay });
      }
    }

    // Second break (30 mins) - within 5.5hrs after end of first break (Section 6.3)
    // FIX #23: Only check if day is long enough for second break entitlement
    if (input.firstBreakGiven && input.firstBreakTime) {
      const firstBreakEndMins = timeToMinutes(input.firstBreakTime) + input.firstBreakDurationMins;
      const callMins = timeToMinutes(callTime);
      let wrapFromCall = timeToMinutes(wrapTime) - callMins;
      if (wrapFromCall < 0) wrapFromCall += 24 * 60;
      const wrapAbsMins = callMins + wrapFromCall;
      // Second break entitlement starts 5.5hrs after first break ends
      const secondBreakDueMins = firstBreakEndMins + 5.5 * 60;

      if (wrapAbsMins >= secondBreakDueMins) {
        // Day is long enough that second break should have been given
        if (input.secondBreakGiven && input.secondBreakTime) {
          const curtailedMins = 30 - input.secondBreakDurationMins;
          if (curtailedMins > 0) {
            const curtailedPay = (curtailedMins / 60) * bhr;
            penalties.push({ description: `Second break curtailed (${curtailedMins} mins short)`, hours: curtailedMins / 60, rate: bhr, total: curtailedPay });
          }
          // Check if late (can't be delayed — late = missed)
          const secondBreakMins = timeToMinutes(input.secondBreakTime);
          let gapFromFirstEnd = secondBreakMins - firstBreakEndMins;
          if (gapFromFirstEnd < 0) gapFromFirstEnd += 24 * 60;
          if (gapFromFirstEnd / 60 > 5.5) {
            penalties.push({ description: 'Second break late (missed penalty)', hours: 0.5, rate: bhr, total: bhr * 0.5 });
          }
        } else if (!input.secondBreakGiven) {
          if (callType === 'night') {
            penalties.push({ description: 'Missed 2nd break (night shoot)', hours: 0.5, rate: bhr, total: bhr * 0.5 });
          } else {
            penalties.push({ description: 'Missed 2nd break', hours: 0.5, rate: bhr, total: bhr * 0.5 });
          }
        }
      }
    }
  }

  // Continuous working day break penalties (Section 6.4)
  // Applies equally to genuine continuous days and basic days converted to continuous.
  // Always use the continuous break fields — never the basic-day secondBreakGiven field.
  if (!isPMPARunner && dayType === 'continuous_working') {
    if (dayLength > 9 && !input.continuousFirstBreakGiven) {
      penalties.push({ description: 'No 2nd break', hours: 0.5, rate: bhr, total: bhr * 0.5 });
    }
    if (dayLength > 12.5 && !input.continuousAdditionalBreakGiven) {
      penalties.push({ description: 'No add\'l break', hours: 0.5, rate: bhr, total: bhr * 0.5 });
    }
  }

  // ============= TIME OFF THE CLOCK (Section 5) =============
  // APA S.5: minimum break between wrap and next call is 11 hours ('time off the clock').
  // If break is less than 11 hours, crew are owed exactly ONE hour of TOC per break.
  // "they may only be engaged to work one hour of TOC in respect of any one break"
  // Example from T&Cs: Day 1 wrap 23:00, Day 2 call 08:00 (9hr gap) → 1hr TOC.
  if (input.previousWrapTime && !isPMPARunner) {
    const prevWrapMins = timeToMinutes(input.previousWrapTime);
    const callMins = timeToMinutes(callTime);
    let gap = callMins - prevWrapMins;
    if (gap < 0) gap += 24 * 60;
    const gapHours = gap / 60;
    if (gapHours < 11) {
      // Full shortfall paid as TOC: 8h break = 3h TOC, 9h break = 2h TOC, etc.
      const tocHours = roundOTHours(11 - gapHours);
      const tocLabel = `TOC (${tocHours}hr)`;
      penalties.push({ description: tocLabel, hours: tocHours, rate: otRate, total: otRate * tocHours });
    }
  }

  // ============= TRAVEL (Section 3.1) =============
  // Travel provisions do NOT apply to PM/PA/Runners (Section 3 end)
  // Travel time only payable if travel + working time >= 11 hours
  // On working days: deduct first hour of outward and homeward journey (2hrs total)
  let travelPay = 0;
  if (input.travelHours > 0 && !isPMPARunner) {
    const workingHours = dayLength;
    if (workingHours + input.travelHours >= 11) {
      // Section 3.1: On working days, deduct first hour each way (2hrs total)
      const isWorkingDay = dayType === 'basic_working' || dayType === 'continuous_working';
      const deduction = isWorkingDay ? Math.min(input.travelHours, 2) : 0;
      const payableTravelHours = Math.max(0, input.travelHours - deduction);
      travelPay = payableTravelHours * bhr;
    }
  }

  // ============= MILEAGE (Section 3.2) =============
  // 50p per mile outside M25
  const mileageMiles = input.mileageOutsideM25;
  const mileage = mileageMiles * 0.50;

  // ============= EQUIPMENT =============
  const equipmentValue = input.equipmentValue ?? 0;
  const equipmentDiscount = input.equipmentDiscount ?? 0;
  const equipmentTotal = Math.round(equipmentValue * (1 - equipmentDiscount / 100) * 100) / 100;

  // Prepend pre-call line items and adjust totals
  if (preCallLineItems.length > 0) {
    lineItems.unshift(...preCallLineItems);
  }

  const subtotal = lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const penaltiesTotal = penalties.reduce((sum, item) => sum + (item.total ?? 0), 0);

  const grandTotal = subtotal + penaltiesTotal + travelPay + mileage + equipmentTotal;

  const dayDescriptions: Record<DayType, string> = {
    basic_working: 'Basic Working Day',
    continuous_working: 'Continuous Working Day',
    prep: 'Prep Day',
    recce: 'Recce Day',
    build_strike: 'Build/Strike Day',
    pre_light: 'Pre-light Day',
    rest: 'Rest Day',
    travel: 'Travel Day',
  };

  return {
    lineItems,
    subtotal,
    travelPay,
    mileage,
    mileageMiles,
    penalties,
    equipmentValue,
    equipmentDiscount,
    equipmentTotal,
    grandTotal,
    callType,
    dayDescription: `${convertedToContinuous ? 'Continuous Working Day' : isBasicWorkingNSD && input.dayType !== 'basic_working' && input.dayType !== 'continuous_working' && input.dayType !== 'rest' && input.dayType !== 'travel' ? `${dayDescriptions[input.dayType]} (Basic Working Day rules — S.2.3)` : dayDescriptions[dayType]} - ${callType.charAt(0).toUpperCase() + callType.slice(1)} Call`,
  };
}

function roundOTHours(hours: number): number {
  // Section 4.5: OT charged per minute, rounded up to 30 mins
  if (hours <= 0) return 0;
  return Math.ceil(hours * 2) / 2;
}

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
    preCallStartTime: input.preCallStartTime,
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
