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
  firstBreakGiven: boolean;
  firstBreakDelayed: boolean;
  firstBreakCurtailedMins: number;
  secondBreakGiven: boolean;
  secondBreakCurtailedMins: number;
  isContinuousBreakGiven: boolean; // 30min break after 9hrs on continuous day
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
  holidayPay: number;
  travelPay: number;
  mileage: number;
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

export function calculateCrewCost(input: CalculationInput): CalculationResult {
  const { role, agreedDailyRate, dayType, dayOfWeek, callTime, wrapTime } = input;
  const bdr = agreedDailyRate;
  const bhr = Math.round(bdr / 10);
  const callType = getCallType(callTime, dayType);
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

  // PM/PA/Runner special handling
  const isPMPARunner = role.specialRules === 'pm_pa_runner';

  if (dayType === 'rest') {
    // Rest day: flat fee = BDR, no overtime
    lineItems.push({ description: 'Rest Day (flat fee)', hours: 1, rate: bdr, total: bdr });
  } else if (dayType === 'travel') {
    // Travel day: BHR per hour, min 5 hours
    const travelHrs = Math.max(dayLength, 5);
    lineItems.push({ description: 'Travel Day', hours: travelHrs, rate: bhr, total: travelHrs * bhr });
  } else if (dayType === 'prep' || dayType === 'recce' || dayType === 'build_strike') {
    // Non-shooting day: 8 hours at BHR, OT after 8 hrs
    const baseHours = 8;
    const rateMultiplier = isSundayOrBH ? 2 : isSaturday ? 1.5 : 1;
    const hourlyRate = Math.round(bhr * rateMultiplier);
    lineItems.push({
      description: `${dayType === 'build_strike' ? 'Build/Strike' : dayType.charAt(0).toUpperCase() + dayType.slice(1)} Day (${baseHours} hrs)`,
      hours: baseHours,
      rate: hourlyRate,
      total: baseHours * hourlyRate,
    });
    const otHours = Math.max(0, dayLength - baseHours);
    if (otHours > 0) {
      const otRateNSD = Math.round(bhr * rateMultiplier);
      lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: otRateNSD, total: roundOTHours(otHours) * otRateNSD });
    }
  } else if (dayType === 'pre_light') {
    // Pre-light: 8+1 hrs, OT after 9 hrs
    const baseHours = 8;
    const rateMultiplier = isSundayOrBH ? 2 : isSaturday ? 1.5 : 1;
    const hourlyRate = Math.round(bhr * rateMultiplier);
    const preLightRate = hourlyRate * baseHours;
    lineItems.push({
      description: `Pre-light Day (${baseHours} hrs + 1hr lunch)`,
      hours: baseHours,
      rate: hourlyRate,
      total: preLightRate,
    });
    const otHours = Math.max(0, dayLength - 9); // OT after 9hrs (8+1 lunch)
    if (otHours > 0) {
      const otRatePrelight = Math.round(bhr * (isWeekday ? otCoefficient : rateMultiplier));
      lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: otRatePrelight, total: roundOTHours(otHours) * otRatePrelight });
    }
  } else if (dayType === 'continuous_working') {
    // Continuous working day: 9 hrs, no lunch break
    if (callType === 'night') {
      // Night continuous: double BDR for 9 hrs, OT at 2xBHR
      const doubleBdr = bdr * 2;
      lineItems.push({ description: 'Night Continuous Working Day (2x BDR)', hours: 9, rate: doubleBdr, total: doubleBdr });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const nightOtRate = bhr * 2;
        lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: nightOtRate, total: roundOTHours(otHours) * nightOtRate });
      }
    } else if (isSaturday) {
      const satBdr = Math.round(bdr * 1.5);
      lineItems.push({ description: 'Saturday Continuous Working Day (1.5x BDR)', hours: 9, rate: satBdr, total: satBdr });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const satOtRate = Math.round(bhr * 1.5);
        lineItems.push({ description: 'Overtime (1.5x BHR)', hours: roundOTHours(otHours), rate: satOtRate, total: roundOTHours(otHours) * satOtRate });
      }
    } else if (isSundayOrBH) {
      const sunBdr = bdr * 2;
      lineItems.push({ description: 'Sunday/BH Continuous Working Day (2x BDR)', hours: 9, rate: sunBdr, total: sunBdr });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        const sunOtRate = bhr * 2;
        lineItems.push({ description: 'Overtime (2x BHR)', hours: roundOTHours(otHours), rate: sunOtRate, total: roundOTHours(otHours) * sunOtRate });
      }
    } else if (callType === 'early') {
      // Early call: OT rate for 5am-7am, then BDR for 9hrs from call, OT after 9hrs
      const callMins = timeToMinutes(callTime);
      const earlyHours = Math.max(0, (7 * 60 - callMins) / 60);
      lineItems.push({ description: `Early Call Overtime (${callTime}-07:00)`, hours: earlyHours, rate: otRate, total: Math.round(earlyHours * otRate) });
      lineItems.push({ description: 'Continuous Working Day (BDR)', hours: 9, rate: bdr, total: bdr });
      const otHours = Math.max(0, dayLength - 9 - earlyHours);
      if (otHours > 0) {
        lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: otRate, total: roundOTHours(otHours) * otRate });
      }
    } else if (callType === 'late') {
      // Late call: day starts at 11am, BDR 9hrs
      lineItems.push({ description: 'Late Call Continuous Working Day (from 11:00)', hours: 9, rate: bdr, total: bdr });
      const effectiveLength = calculateDayLengthHours('11:00', wrapTime);
      const otHours = Math.max(0, effectiveLength - 9);
      if (otHours > 0) {
        lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: otRate, total: roundOTHours(otHours) * otRate });
      }
    } else {
      // Standard continuous
      lineItems.push({ description: 'Continuous Working Day (BDR)', hours: 9, rate: bdr, total: bdr });
      const otHours = Math.max(0, dayLength - 9);
      if (otHours > 0) {
        lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: otRate, total: roundOTHours(otHours) * otRate });
      }
    }

    // Continuous day break penalties
    if (!input.isContinuousBreakGiven) {
      const breakPenalty = Math.round(bhr * 0.5);
      penalties.push({ description: '30-min break penalty (after 9 hrs)', hours: 0.5, rate: bhr, total: breakPenalty });
    }
  } else {
    // BASIC WORKING DAY
    if (callType === 'night') {
      // Night shoot: 2xBHR for all hours, min 10 hrs
      const nightHours = Math.max(dayLength - 1, 10); // subtract 1 hr lunch, min 10
      const nightRate = bhr * 2;
      lineItems.push({
        description: 'Night Shoot (2x BHR, all hours)',
        hours: nightHours,
        rate: nightRate,
        total: nightHours * nightRate,
      });
    } else if (isSaturday) {
      // Saturday: 1.5x BHR for all hours, min 10 hrs
      const satHours = Math.max(dayLength, 10);
      const satRate = Math.round(bhr * 1.5);
      lineItems.push({
        description: 'Saturday (1.5x BHR, all hours)',
        hours: satHours,
        rate: satRate,
        total: satHours * satRate,
      });
    } else if (isSundayOrBH) {
      // Sunday/BH: 2xBHR for all hours, min 10 hrs
      const sunHours = Math.max(dayLength, 10);
      const sunRate = bhr * 2;
      lineItems.push({
        description: 'Sunday/Bank Holiday (2x BHR, all hours)',
        hours: sunHours,
        rate: sunRate,
        total: sunHours * sunRate,
      });
    } else if (callType === 'early') {
      // Early call: OT rate for 5am-7am, BDR, OT after 11hrs from call
      const callMins = timeToMinutes(callTime);
      const earlyHours = Math.max(0, (7 * 60 - callMins) / 60);
      lineItems.push({ description: `Early Call Overtime (${callTime}-07:00)`, hours: earlyHours, rate: otRate, total: Math.round(earlyHours * otRate) });
      lineItems.push({ description: 'Basic Daily Rate (10+1 hrs)', hours: 11, rate: bdr, total: bdr });
      const otHours = Math.max(0, dayLength - 11);
      if (otHours > 0) {
        lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: otRate, total: roundOTHours(otHours) * otRate });
      }
    } else if (callType === 'late') {
      // Late call: day starts at 11am regardless
      lineItems.push({ description: 'Late Call Basic Daily Rate (from 11:00)', hours: 11, rate: bdr, total: bdr });
      const effectiveLength = calculateDayLengthHours('11:00', wrapTime);
      const otHours = Math.max(0, effectiveLength - 11);
      if (otHours > 0) {
        // Check for after-midnight OT
        const wrapMins = timeToMinutes(wrapTime);
        if (wrapMins < 5 * 60 && wrapMins >= 0) {
          // Some hours are after midnight = triple time
          const midnightOtHours = wrapMins / 60;
          const regularOtHours = otHours - midnightOtHours;
          if (regularOtHours > 0) {
            lineItems.push({ description: 'Overtime', hours: roundOTHours(regularOtHours), rate: otRate, total: roundOTHours(regularOtHours) * otRate });
          }
          if (midnightOtHours > 0) {
            lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: roundOTHours(midnightOtHours), rate: tripleBhr, total: roundOTHours(midnightOtHours) * tripleBhr });
          }
        } else {
          lineItems.push({ description: 'Overtime', hours: roundOTHours(otHours), rate: otRate, total: roundOTHours(otHours) * otRate });
        }
      }
    } else {
      // Standard call (7am-11am)
      lineItems.push({ description: 'Basic Daily Rate (10+1 hrs)', hours: 11, rate: bdr, total: bdr });
      const otHours = Math.max(0, dayLength - 11);
      if (otHours > 0 && !isPMPARunner) {
        // Check for after-midnight OT (if wrap goes past midnight)
        const callMins = timeToMinutes(callTime);
        const midnightFromCall = (24 * 60 - callMins) / 60;
        const afterMidnightHours = Math.max(0, dayLength - midnightFromCall);
        const regularOtHours = otHours - afterMidnightHours;

        if (regularOtHours > 0) {
          lineItems.push({ description: 'Overtime', hours: roundOTHours(regularOtHours), rate: otRate, total: roundOTHours(regularOtHours) * otRate });
        }
        if (afterMidnightHours > 0) {
          lineItems.push({ description: 'Overtime After Midnight (3x BHR)', hours: roundOTHours(afterMidnightHours), rate: tripleBhr, total: roundOTHours(afterMidnightHours) * tripleBhr });
        }
      } else if (otHours > 0 && isPMPARunner) {
        // PM/PA/Runner: OT at BHR on weekdays
        lineItems.push({ description: 'Overtime (BHR)', hours: roundOTHours(otHours), rate: bhr, total: roundOTHours(otHours) * bhr });
      }
    }
  }

  // BREAK PENALTIES (not for PM/PA/Runner, not for night shoots, not for non-shooting days)
  if (!isPMPARunner && callType !== 'night' && (dayType === 'basic_working' || dayType === 'continuous_working')) {
    if (input.firstBreakDelayed && input.firstBreakGiven) {
      penalties.push({ description: 'First break delayed penalty', hours: 0, rate: 10, total: 10 });
    }
    if (!input.firstBreakGiven) {
      // Day becomes continuous working day - handled separately
      penalties.push({ description: 'First break missed - meal allowance', hours: 0, rate: 7.50, total: 7.50 });
    }
    if (input.firstBreakCurtailedMins > 0) {
      const curtailedPay = Math.round((input.firstBreakCurtailedMins / 60) * bhr);
      penalties.push({ description: `First break curtailed (${input.firstBreakCurtailedMins} mins)`, hours: input.firstBreakCurtailedMins / 60, rate: bhr, total: curtailedPay });
    }
    if (!input.secondBreakGiven) {
      penalties.push({ description: 'Second break missed (30 min at BHR)', hours: 0.5, rate: bhr, total: Math.round(bhr * 0.5) });
    }
    if (input.secondBreakCurtailedMins > 0) {
      const curtailedPay = Math.round((input.secondBreakCurtailedMins / 60) * bhr);
      penalties.push({ description: `Second break curtailed (${input.secondBreakCurtailedMins} mins)`, hours: input.secondBreakCurtailedMins / 60, rate: bhr, total: curtailedPay });
    }
  }

  // TIME OFF THE CLOCK
  if (input.previousWrapTime) {
    const prevWrapMins = timeToMinutes(input.previousWrapTime);
    const callMins = timeToMinutes(callTime);
    let gap = callMins - prevWrapMins;
    if (gap < 0) gap += 24 * 60;
    const gapHours = gap / 60;
    if (gapHours < 11 && gapHours >= 10) {
      const tocHours = 11 - gapHours;
      penalties.push({ description: 'Time Off Clock penalty', hours: tocHours, rate: otRate, total: Math.round(tocHours * otRate) });
    }
  }

  // TRAVEL
  let travelPay = 0;
  if (input.travelHours > 0) {
    travelPay = input.travelHours * bhr;
  }

  // MILEAGE (50p per mile outside M25)
  const mileage = input.mileageOutsideM25 * 2 * 0.50; // return journey

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const penaltiesTotal = penalties.reduce((sum, item) => sum + item.total, 0);

  // HOLIDAY PAY (12.07%)
  const holidayPay = Math.round((subtotal + penaltiesTotal) * 0.1207);

  const grandTotal = subtotal + penaltiesTotal + holidayPay + travelPay + mileage;

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
    holidayPay,
    travelPay,
    mileage,
    penalties,
    grandTotal,
    callType,
    dayDescription: `${dayDescriptions[dayType]} - ${callType.charAt(0).toUpperCase() + callType.slice(1)} Call`,
  };
}

function roundOTHours(hours: number): number {
  // OT is charged per minute, rounded up to 30 mins
  if (hours <= 0) return 0;
  return Math.ceil(hours * 2) / 2; // round up to nearest 0.5
}
