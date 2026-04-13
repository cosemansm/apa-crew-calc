import type { EngineCalculationInput, EngineResult, EngineLineItem } from '../types'
import { FLAT_RATES, type SdymRoleData } from './rates'

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function buildFlatResult(
  total: number,
  description: string,
  input: EngineCalculationInput,
): EngineResult {
  const kmRate = (input.extra?.kmRate as number | undefined) ?? 0
  const mileage = input.mileageDistance > 0 ? Math.round(input.mileageDistance * kmRate * 100) / 100 : 0
  const grandTotal = Math.round((total + mileage) * 100) / 100

  const lineItems: EngineLineItem[] = [{
    description,
    hours: 1,
    rate: total,
    total,
    timeFrom: input.callTime,
    timeTo: input.wrapTime,
    isDayRate: true,
  }]

  return {
    lineItems,
    subtotal: total,
    travelPay: 0,
    mileage,
    mileageDistance: input.mileageDistance,
    penalties: [],
    equipmentValue: 0,
    equipmentDiscount: 0,
    equipmentTotal: 0,
    grandTotal,
    dayDescription: description,
  }
}

function calcNightWorkingMins(
  callMins: number,
  adjustedWrapMins: number,
  breakMins: number,
  breakStartMins: number,
): number {
  // Night window: 22:00 (1320 mins) to 06:00 next day (1800 mins in adjusted timeline)
  const NIGHT_START = 22 * 60  // 1320
  const NIGHT_END = 30 * 60    // 1800 (06:00 next day)

  const overlapStart = Math.max(callMins, NIGHT_START)
  const overlapEnd = Math.min(adjustedWrapMins, NIGHT_END)

  if (overlapEnd <= overlapStart) return 0

  let nightMins = overlapEnd - overlapStart

  // Subtract break time if break falls within night window
  if (breakMins > 0) {
    const breakEnd = breakStartMins + breakMins
    const breakNightStart = Math.max(breakStartMins, NIGHT_START)
    const breakNightEnd = Math.min(breakEnd, NIGHT_END)
    if (breakNightEnd > breakNightStart) {
      nightMins -= breakNightEnd - breakNightStart
    }
  }

  return Math.max(0, nightMins)
}

export function calculateSdym(input: EngineCalculationInput): EngineResult {
  const rates = input.role.engineData as unknown as SdymRoleData
  const roleName = input.role.role

  // --- Flat day types ---
  if (input.dayType === 'saturday') {
    const flatRates = FLAT_RATES.saturday as Record<string, number>
    const total = flatRates[roleName]
    if (total === undefined) throw new Error(`No Saturday rate for role: ${roleName}`)
    return buildFlatResult(total, 'Saturday / 6th Consecutive Day', input)
  }

  if (input.dayType === 'sunday_ph') {
    const flatRates = FLAT_RATES.sunday_ph as Record<string, number>
    const total = flatRates[roleName]
    if (total === undefined) throw new Error(`No Sunday/PH rate for role: ${roleName}`)
    return buildFlatResult(total, 'Sunday / Public Holiday', input)
  }

  if (input.dayType === 'recce') {
    if (roleName !== 'Gaffer') {
      throw new Error(`Recce day type is only available for the Gaffer role, not ${roleName}`)
    }
    return buildFlatResult(FLAT_RATES.recce.Gaffer, 'Recce / Preparation Day', input)
  }

  if (input.dayType === 'travel') {
    const flatRates = FLAT_RATES.travel as Record<string, number>
    const total = flatRates[roleName]
    if (total === undefined) throw new Error(`No Travel rate for role: ${roleName}`)
    return buildFlatResult(total, 'Travel Day', input)
  }

  // --- Standard / Journée Continue ---
  const callMins = timeToMinutes(input.callTime)
  let wrapMins = timeToMinutes(input.wrapTime)
  if (wrapMins <= callMins) wrapMins += 24 * 60

  const breakMins = (input.firstBreakGiven ? input.firstBreakDurationMins : 0) +
                    (input.secondBreakGiven ? input.secondBreakDurationMins : 0)
  const breakStartMins = input.firstBreakGiven && input.firstBreakTime
    ? timeToMinutes(input.firstBreakTime)
    : callMins

  const workingMins = (wrapMins - callMins) - breakMins
  const workingHours = workingMins / 60

  // OT threshold: standard = 10 working hours, journée_continue = 9
  const otThreshold = input.dayType === 'journee_continue' ? 9 : 10
  const otHours = Math.max(0, workingHours - otThreshold)

  const lineItems: EngineLineItem[] = []

  // Day rate line item
  lineItems.push({
    description: 'Day Rate',
    hours: 1,
    rate: rates.dayRate,
    total: rates.dayRate,
    timeFrom: input.callTime,
    timeTo: input.wrapTime,
    isDayRate: true,
  })

  // OT line items
  const otTotal = otHours > 0 ? Math.round(otHours * rates.otRate * 100) / 100 : 0
  if (otHours > 0) {
    lineItems.push({
      description: 'Overtime',
      hours: otHours,
      rate: rates.otRate,
      total: otTotal,
    })
  }

  // Night surcharge
  const nightWorkingMins = calcNightWorkingMins(callMins, wrapMins, breakMins, breakStartMins)
  const nightHours = nightWorkingMins / 60
  let nightSurchargeTotal = 0

  if (nightHours > 0) {
    nightSurchargeTotal = Math.round(nightHours * rates.nightSurcharge * 100) / 100
    lineItems.push({
      description: 'Night Surcharge (22:00–06:00)',
      hours: nightHours,
      rate: rates.nightSurcharge,
      total: nightSurchargeTotal,
    })
  }

  // Mileage
  const kmRate = (input.extra?.kmRate as number | undefined) ?? 0
  const mileage = input.mileageDistance > 0
    ? Math.round(input.mileageDistance * kmRate * 100) / 100
    : 0

  const subtotal = Math.round((rates.dayRate + otTotal + nightSurchargeTotal) * 100) / 100
  const grandTotal = Math.round((subtotal + mileage) * 100) / 100

  const dayLabel = input.dayType === 'journee_continue' ? 'Journée Continue' : 'Standard Day'

  return {
    lineItems,
    subtotal,
    travelPay: 0,
    mileage,
    mileageDistance: input.mileageDistance,
    penalties: [],
    equipmentValue: 0,
    equipmentDiscount: 0,
    equipmentTotal: 0,
    grandTotal,
    dayDescription: dayLabel,
  }
}
