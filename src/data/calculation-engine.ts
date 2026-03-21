import type { CrewRole } from './apa-rates';

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
}

export interface CalculationLineItem {
  description: string;
  hours: number;
  rate: number;
  total: number;
}

export interface CalculationResult {
  lineItems: CalculationLineItem[];
  subtotal: number;
  travelPay: number;
  mileage: number;
  mileageMiles: number;
  penalties: CalculationLineItem[];
  grandTotal: number;
  callType: CallType;
  dayDescription: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function getCallType(callTimeStr: string, dayType: DayType): CallType {
  const mins = timeToMinutes(callTimeStr);
  const hour = Math.floor(mins / 60);

  if (dayType !== 'basic_working' && dayType !== 'continuous_working') {
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
  const otRate = Math.round(bhr * otCoefficient);
  const tripleBhr = bhr * 3;

  // PM/PA/Runner special handling (Appendix 1)
  const isPMPARunner = role.specialRules === 'pm_pa_runner';

  // Per APA T&Cs Section 6.2: If first break is not given within 6.5 hours of call,
  // the day becomes a Continuous Working Day. No late lunch penalties apply.
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
    const hourlyRate = Math.round(bhr * rateMultiplier);
    lineItems.push({
      description: `${dayType === 'build_strike' ? 'Build/Strike' : dayType.charAt(0).toUpperCase() + dayType.slice(1)} Day (${baseHours} hrs)`,
      hours: baseHours,
      rate: hourlyRate,
      total: baseHours * hourlyRate,
    });
    // PM/PA/Runner: no OT on non-shooting days (Appendix 1(a): "SHOOT DAYS ONLY")
    if (!isPMPARunner) {
      const otHours = Math.max(0, dayLength - otStartNSD);
      if (otHours > 0) {
        const nsdOtRate = isWeekday ? Math.round(bhr * otCoefficient) : Math.round(bhr * rateMultiplier);
        lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: nsdOtRate, total: roundOTHours(otHours) * nsdOtRate });
      }
    }

  } else if (dayType === 'pre_light') {
    // Section 2.3: Pre-light - 8hrs + 1hr lunch, OT after 9hrs at standard OT rate
    // Section 2.4(ix)(x): Weekend rates apply
    const baseHours = 8;
    const rateMultiplier = isSundayOrBH ? 2 : isSaturday ? 1.5 : 1;
    const hourlyRate = Math.round(bhr * rateMultiplier);
    lineItems.push({
      description: `Pre-light Day (${baseHours} hrs + 1hr lunch)`,
      hours: baseHours,
      rate: hourlyRate,
      total: baseHours * hourlyRate,
    });
    // PM/PA/Runner: no OT on non-shooting days (Appendix 1(a): "SHOOT DAYS ONLY")
    if (!isPMPARunner) {
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const plOtRate = isWeekday ? Math.round(bhr * otCoefficient) : Math.round(bhr * rateMultiplier);
        lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: plOtRate, total: roundOTHours(otHours) * plOtRate });
      }
    }

  } else if (dayType === 'continuous_working') {
    // Section 2.2: Continuous working day - 9 hrs, no lunch break

    if (callType === 'night') {
      // Section 2.2.5: Night continuous - 2xBDR for 9hrs, OT at 2xBHR
      const doubleBdr = bdr * 2;
      lineItems.push({ description: 'Night Continuous Working Day (2x BDR)', hours: 9, rate: doubleBdr, total: doubleBdr });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const nightOtRate = bhr * 2;
        lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: nightOtRate, total: roundOTHours(otHours) * nightOtRate });
      }
    } else if (isSaturday) {
      // Section 2.4(v): Saturday continuous - 1.5xBDR, OT at 1.5xBHR
      const satBdr = Math.round(bdr * 1.5);
      lineItems.push({ description: 'Saturday Continuous Working Day (1.5x BDR)', hours: 9, rate: satBdr, total: satBdr });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const satOtRate = Math.round(bhr * 1.5);
        // FIX #20: After-midnight triple time on continuous days
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime (1.5x BHR)', hours: regularOT, rate: satOtRate, total: Math.round(regularOT * satOtRate) });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: Math.round(midnightOT * tripleBhr) });
        }
      }
    } else if (isSundayOrBH) {
      // Section 2.4(vi): Sunday/BH continuous - 2xBDR, OT at 2xBHR
      const sunBdr = bdr * 2;
      lineItems.push({ description: 'Sunday/BH Continuous Working Day (2x BDR)', hours: 9, rate: sunBdr, total: sunBdr });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const sunOtRate = bhr * 2;
        // FIX #20: After-midnight triple time on continuous days
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime (2x BHR)', hours: regularOT, rate: sunOtRate, total: Math.round(regularOT * sunOtRate) });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: Math.round(midnightOT * tripleBhr) });
        }
      }
    } else if (callType === 'early') {
      // Section 2.2.3: Early call continuous - OT for 5am-7am, BDR 9hrs, OT after 9hrs from call
      const callMins = timeToMinutes(callTime);
      const earlyHours = Math.max(0, (7 * 60 - callMins) / 60);
      lineItems.push({ description: `Early Call Overtime (${callTime}-07:00)`, hours: earlyHours, rate: otRate, total: Math.round(earlyHours * otRate) });
      lineItems.push({ description: 'Continuous Working Day (BDR)', hours: 9, rate: bdr, total: bdr });
      // FIX #7: OT after 9 hours from call time (NOT subtracting earlyHours)
      // Per T&C: "Overtime will apply after 9 hours from the call time"
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        // FIX #20: After-midnight triple time
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: Math.round(regularOT * otRate) });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: Math.round(midnightOT * tripleBhr) });
        }
      }
    } else if (callType === 'late') {
      // Section 2.2.4: Late call continuous - day starts at 11am, BDR 9hrs
      lineItems.push({ description: 'Late Call Continuous Working Day (from 11:00)', hours: 9, rate: bdr, total: bdr });
      const effectiveLength = calculateDayLengthHours('11:00', wrapTime);
      const otHours = Math.max(0, effectiveLength - 9);
      if (otHours > 0) {
        // FIX #20: After-midnight triple time
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), '11:00', wrapTime, effectiveLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: Math.round(regularOT * otRate) });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: Math.round(midnightOT * tripleBhr) });
        }
      }
    } else {
      // Section 2.2.1: Standard continuous
      lineItems.push({ description: 'Continuous Working Day (BDR)', hours: 9, rate: bdr, total: bdr });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        // FIX #20: After-midnight triple time
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: Math.round(regularOT * otRate) });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: Math.round(midnightOT * tripleBhr) });
        }
      }
    }

  } else {
    // BASIC WORKING DAY (Section 2.1)
    // Section 2.1.3: "Early call rule applies on all days throughout a week, Monday to Sunday"
    // So early call must be checked BEFORE weekend branches

    if (callType === 'night') {
      // Section 2.1.2/2.1.5: Night shoot - 2xBHR for all hours, min 10 working hrs
      // Section 2.4(iii)(iv): Night on Sat/Sun also 2xBHR (no double-double)
      const nightHours = Math.max(dayLength - 1, 10); // subtract 1hr lunch, min 10
      const nightRate = bhr * 2;

      if (isPMPARunner) {
        // Appendix 1(a)(iii): PM/PA/Runner night shoot - 2x BDR, OT at 2x BHR
        const pmNightBdr = bdr * 2;
        lineItems.push({ description: 'Night Shoot (2x BDR)', hours: 1, rate: pmNightBdr, total: pmNightBdr });
        const otHours = Math.max(0, nightHours - 10);
        if (otHours > 0) {
          const pmNightOtRate = bhr * 2;
          lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: pmNightOtRate, total: roundOTHours(otHours) * pmNightOtRate });
        }
      } else {
        lineItems.push({
          description: 'Night Shoot (2x BHR, all hours)',
          hours: nightHours,
          rate: nightRate,
          total: nightHours * nightRate,
        });
      }

    } else if (callType === 'early') {
      // Section 2.1.3: Early call (5am-7am) - applies Mon-Sun per T&Cs
      const callMins = timeToMinutes(callTime);
      const earlyHours = Math.max(0, (7 * 60 - callMins) / 60);

      if (isPMPARunner) {
        if (isSundayOrBH) {
          // Appendix 1(a)(iii): PM/PA/Runner Sunday/BH - 2x BDR, OT at 2x BHR
          const pmSunBdr = bdr * 2;
          const pmSunOtRate = bhr * 2;
          lineItems.push({ description: `Early Call Overtime (${callTime}-07:00, 2x BHR)`, hours: earlyHours, rate: pmSunOtRate, total: Math.round(earlyHours * pmSunOtRate) });
          lineItems.push({ description: 'Sunday/BH Basic Daily Rate (2x BDR)', hours: 11, rate: pmSunBdr, total: pmSunBdr });
          const otHours = Math.max(0, dayLength - 11);
          if (otHours > 0) {
            lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: pmSunOtRate, total: roundOTHours(otHours) * pmSunOtRate });
          }
        } else if (isSaturday) {
          // Appendix 1(a)(ii): PM/PA/Runner Saturday - 1.5x BDR, OT at 1.5x BHR
          const pmSatBdr = Math.round(bdr * 1.5);
          const pmSatOtRate = Math.round(bhr * 1.5);
          lineItems.push({ description: `Early Call Overtime (${callTime}-07:00, 1.5x BHR)`, hours: earlyHours, rate: pmSatOtRate, total: Math.round(earlyHours * pmSatOtRate) });
          lineItems.push({ description: 'Saturday Basic Daily Rate (1.5x BDR)', hours: 11, rate: pmSatBdr, total: pmSatBdr });
          const otHours = Math.max(0, dayLength - 11);
          if (otHours > 0) {
            lineItems.push({ description: 'Overtime (1.5x BHR)', hours: roundOTHours(otHours), rate: pmSatOtRate, total: roundOTHours(otHours) * pmSatOtRate });
          }
        } else {
          // Appendix 1(a)(i): PM/PA/Runner weekday - BDR, OT at BHR
          lineItems.push({ description: `Early Call Overtime (${callTime}-07:00)`, hours: earlyHours, rate: bhr, total: Math.round(earlyHours * bhr) });
          lineItems.push({ description: 'Basic Daily Rate (10+1 hrs)', hours: 11, rate: bdr, total: bdr });
          const otHours = Math.max(0, dayLength - 11);
          if (otHours > 0) {
            lineItems.push({ description: 'Overtime (BHR)', hours: roundOTHours(otHours), rate: bhr, total: roundOTHours(otHours) * bhr });
          }
        }
      } else if (isSundayOrBH) {
        // Early call on Sunday/BH: early hours at 2xBHR (weekend rate), rest at 2xBHR
        const sunRate = bhr * 2;
        lineItems.push({ description: `Early Call Overtime (${callTime}-07:00, 2x BHR)`, hours: earlyHours, rate: sunRate, total: Math.round(earlyHours * sunRate) });
        const workedHours = Math.max(dayLength - earlyHours - 1, 10); // remaining worked hours
        const { regularOT: regularHrs, midnightOT: midnightHrs } = splitAfterMidnightOT(workedHours, '07:00', wrapTime, dayLength - earlyHours);
        if (regularHrs > 0) {
          lineItems.push({ description: 'Sunday/Bank Holiday (2x BHR)', hours: regularHrs, rate: sunRate, total: Math.round(regularHrs * sunRate) });
        }
        if (midnightHrs > 0) {
          lineItems.push({ description: 'Sunday/BH After Midnight (3x BHR)', hours: midnightHrs, rate: tripleBhr, total: Math.round(midnightHrs * tripleBhr) });
        }
      } else if (isSaturday) {
        // Early call on Saturday: early hours at 1.5xBHR (weekend rate), rest at 1.5xBHR
        const satRate = Math.round(bhr * 1.5);
        lineItems.push({ description: `Early Call Overtime (${callTime}-07:00, 1.5x BHR)`, hours: earlyHours, rate: satRate, total: Math.round(earlyHours * satRate) });
        const workedHours = Math.max(dayLength - earlyHours - 1, 10); // remaining worked hours
        const { regularOT: regularHrs, midnightOT: midnightHrs } = splitAfterMidnightOT(workedHours, '07:00', wrapTime, dayLength - earlyHours);
        if (regularHrs > 0) {
          lineItems.push({ description: 'Saturday (1.5x BHR)', hours: regularHrs, rate: satRate, total: Math.round(regularHrs * satRate) });
        }
        if (midnightHrs > 0) {
          lineItems.push({ description: 'Saturday After Midnight (3x BHR)', hours: midnightHrs, rate: tripleBhr, total: Math.round(midnightHrs * tripleBhr) });
        }
      } else {
        // Weekday early call
        lineItems.push({ description: `Early Call Overtime (${callTime}-07:00)`, hours: earlyHours, rate: otRate, total: Math.round(earlyHours * otRate) });
        lineItems.push({ description: 'Basic Daily Rate (10+1 hrs)', hours: 11, rate: bdr, total: bdr });
        const otHours = Math.max(0, dayLength - otStartHours);
        if (otHours > 0) {
          const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
          if (regularOT > 0) {
            lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: Math.round(regularOT * otRate) });
          }
          if (midnightOT > 0) {
            lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: Math.round(midnightOT * tripleBhr) });
          }
        }
      }

    } else if (isSaturday) {
      // Section 2.4(i)/4.6: Saturday - 1.5xBHR for all hours, min 10 working hrs
      const workedHours = Math.max(dayLength - 1, 10); // subtract 1hr lunch

      if (isPMPARunner) {
        // Appendix 1(a)(ii): PM/PA/Runner Saturday - 1.5x BDR, OT at 1.5x BHR
        const pmSatBdr = Math.round(bdr * 1.5);
        const pmSatOtRate = Math.round(bhr * 1.5);
        lineItems.push({ description: 'Saturday Basic Daily Rate (1.5x BDR)', hours: 1, rate: pmSatBdr, total: pmSatBdr });
        const otHours = Math.max(0, workedHours - 10);
        if (otHours > 0) {
          lineItems.push({ description: 'Overtime (1.5x BHR)', hours: roundOTHours(otHours), rate: pmSatOtRate, total: roundOTHours(otHours) * pmSatOtRate });
        }
      } else {
        const satRate = Math.round(bhr * 1.5);
        const { regularOT: regularHrs, midnightOT: midnightHrs } = splitAfterMidnightOT(workedHours, callTime, wrapTime, dayLength);
        if (regularHrs > 0) {
          lineItems.push({ description: 'Saturday (1.5x BHR)', hours: regularHrs, rate: satRate, total: Math.round(regularHrs * satRate) });
        }
        if (midnightHrs > 0) {
          lineItems.push({ description: 'Saturday After Midnight (3x BHR)', hours: midnightHrs, rate: tripleBhr, total: Math.round(midnightHrs * tripleBhr) });
        }
      }

    } else if (isSundayOrBH) {
      // Section 2.4(ii)/4.7: Sunday/BH - 2xBHR for all hours, min 10 working hrs
      const workedHours = Math.max(dayLength - 1, 10); // subtract 1hr lunch

      if (isPMPARunner) {
        // Appendix 1(a)(iii): PM/PA/Runner Sunday/BH - 2x BDR, OT at 2x BHR
        const pmSunBdr = bdr * 2;
        const pmSunOtRate = bhr * 2;
        lineItems.push({ description: 'Sunday/BH Basic Daily Rate (2x BDR)', hours: 1, rate: pmSunBdr, total: pmSunBdr });
        const otHours = Math.max(0, workedHours - 10);
        if (otHours > 0) {
          lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: pmSunOtRate, total: roundOTHours(otHours) * pmSunOtRate });
        }
      } else {
        const sunRate = bhr * 2;
        const { regularOT: regularHrs, midnightOT: midnightHrs } = splitAfterMidnightOT(workedHours, callTime, wrapTime, dayLength);
        if (regularHrs > 0) {
          lineItems.push({ description: 'Sunday/Bank Holiday (2x BHR)', hours: regularHrs, rate: sunRate, total: Math.round(regularHrs * sunRate) });
        }
        if (midnightHrs > 0) {
          lineItems.push({ description: 'Sunday/BH After Midnight (3x BHR)', hours: midnightHrs, rate: tripleBhr, total: Math.round(midnightHrs * tripleBhr) });
        }
      }

    } else if (callType === 'late') {
      // Section 2.1.4: Late call (Mon-Fri only) - day starts at 11am, BDR 11hrs
      lineItems.push({ description: 'Late Call Basic Daily Rate (from 11:00)', hours: 11, rate: bdr, total: bdr });
      const effectiveLength = calculateDayLengthHours('11:00', wrapTime);
      const otHours = Math.max(0, effectiveLength - 11);

      if (otHours > 0 && !isPMPARunner) {
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), '11:00', wrapTime, effectiveLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: Math.round(regularOT * otRate) });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: Math.round(midnightOT * tripleBhr) });
        }
      } else if (otHours > 0 && isPMPARunner) {
        lineItems.push({ description: 'Overtime (BHR)', hours: roundOTHours(otHours), rate: bhr, total: roundOTHours(otHours) * bhr });
      }

    } else {
      // Section 2.1.1: Standard call (7am-11am), Mon-Fri
      lineItems.push({ description: 'Basic Daily Rate (10+1 hrs)', hours: 11, rate: bdr, total: bdr });
      const otHours = Math.max(0, dayLength - otStartHours);

      if (otHours > 0 && !isPMPARunner) {
        const { regularOT, midnightOT } = splitAfterMidnightOT(roundOTHours(otHours), callTime, wrapTime, dayLength);
        if (regularOT > 0) {
          lineItems.push({ description: 'Overtime', hours: regularOT, rate: otRate, total: Math.round(regularOT * otRate) });
        }
        if (midnightOT > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: midnightOT, rate: tripleBhr, total: Math.round(midnightOT * tripleBhr) });
        }
      } else if (otHours > 0 && isPMPARunner) {
        // Appendix 1(a)(i): PM/PA/Runner weekday OT at BHR
        lineItems.push({ description: 'Overtime (BHR)', hours: roundOTHours(otHours), rate: bhr, total: roundOTHours(otHours) * bhr });
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
        const curtailedPay = Math.round((curtailedMins / 60) * bhr);
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
            const curtailedPay = Math.round((curtailedMins / 60) * bhr);
            penalties.push({ description: `Second break curtailed (${curtailedMins} mins short)`, hours: curtailedMins / 60, rate: bhr, total: curtailedPay });
          }
          // Check if late (can't be delayed — late = missed)
          const secondBreakMins = timeToMinutes(input.secondBreakTime);
          let gapFromFirstEnd = secondBreakMins - firstBreakEndMins;
          if (gapFromFirstEnd < 0) gapFromFirstEnd += 24 * 60;
          if (gapFromFirstEnd / 60 > 5.5) {
            penalties.push({ description: 'Second break late (missed penalty)', hours: 0.5, rate: bhr, total: Math.round(bhr * 0.5) });
          }
        } else if (!input.secondBreakGiven) {
          if (callType === 'night') {
            penalties.push({ description: 'Second break missed (night shoot) - at BHR', hours: 0.5, rate: bhr, total: Math.round(bhr * 0.5) });
          } else {
            penalties.push({ description: 'Second break missed (30 min at BHR)', hours: 0.5, rate: bhr, total: Math.round(bhr * 0.5) });
          }
        }
      }
    }
  }

  // Continuous working day break penalties (Section 6.4)
  if (!isPMPARunner && dayType === 'continuous_working') {
    // FIX #24: Only check 9hr break if day exceeds 9hrs
    if (dayLength > 9) {
      if (convertedToContinuous ? !input.secondBreakGiven : !input.continuousFirstBreakGiven) {
        penalties.push({ description: '30-min break missed after 9hrs (at BHR)', hours: 0.5, rate: bhr, total: Math.round(bhr * 0.5) });
      }
    }
    // Additional 30-min break after 12.5 hours
    if (dayLength > 12.5) {
      if (convertedToContinuous ? true : !input.continuousAdditionalBreakGiven) {
        penalties.push({ description: 'Additional 30-min break missed after 12.5hrs (at BHR)', hours: 0.5, rate: bhr, total: Math.round(bhr * 0.5) });
      }
    }
  }

  // ============= TIME OFF THE CLOCK (Section 5) =============
  // FIX #21: Any gap < 11hrs = 1 hour TOC penalty (capped at 1hr max)
  // "Crew shall not be engaged to work without at least a 10 hour break...
  // they may only be engaged to work one hour of TOC"
  if (input.previousWrapTime && !isPMPARunner) {
    const prevWrapMins = timeToMinutes(input.previousWrapTime);
    const callMins = timeToMinutes(callTime);
    let gap = callMins - prevWrapMins;
    if (gap < 0) gap += 24 * 60;
    const gapHours = gap / 60;
    if (gapHours < 11) {
      // Capped at 1 hour penalty per T&Cs
      penalties.push({ description: 'Time Off Clock penalty (1hr)', hours: 1, rate: otRate, total: otRate });
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

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const penaltiesTotal = penalties.reduce((sum, item) => sum + item.total, 0);

  const grandTotal = subtotal + penaltiesTotal + travelPay + mileage;

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
    grandTotal,
    callType,
    dayDescription: `${convertedToContinuous ? 'Converted to Continuous (break missed)' : dayDescriptions[dayType]} - ${callType.charAt(0).toUpperCase() + callType.slice(1)} Call`,
  };
}

function roundOTHours(hours: number): number {
  // Section 4.5: OT charged per minute, rounded up to 30 mins
  if (hours <= 0) return 0;
  return Math.ceil(hours * 2) / 2;
}
