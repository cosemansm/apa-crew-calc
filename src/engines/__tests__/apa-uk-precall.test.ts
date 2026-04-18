import { describe, it, expect } from 'vitest'
import { calculateCrewCost } from '../apa-uk/calculator'
import { APA_CREW_ROLES } from '../apa-uk/rates'
import type { CalculationInput } from '../apa-uk/calculator'

function makeInput(overrides: Partial<CalculationInput> = {}): CalculationInput {
  const role = APA_CREW_ROLES.find(r => r.role === '1st Assistant Director')!
  return {
    role,
    agreedDailyRate: 532,
    dayType: 'basic_working',
    dayOfWeek: 'monday',
    callTime: '08:00',
    wrapTime: '19:30',
    firstBreakGiven: true,
    firstBreakTime: '13:00',
    firstBreakDurationMins: 60,
    secondBreakGiven: false,
    secondBreakTime: undefined,
    secondBreakDurationMins: 30,
    continuousFirstBreakGiven: false,
    continuousAdditionalBreakGiven: false,
    travelHours: 0,
    mileageOutsideM25: 0,
    ...overrides,
  }
}

describe('APA UK pre-call individual start', () => {
  it('weekday pre-call: 05:30-08:00 adds 2.5h OT at grade rate', () => {
    const result = calculateCrewCost(makeInput({ preCallStartTime: '05:30' }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    expect(preCallItem!.hours).toBe(2.5)
    // 1st AD: BHR=round(532/10)=53, OT coeff=1.0, OT rate=round(53*1.0)=53
    const bhr = Math.round(532 / 10)
    const otRate = Math.round(bhr * 1.0)
    expect(preCallItem!.rate).toBe(otRate)
    expect(preCallItem!.total).toBe(2.5 * otRate)
    expect(preCallItem!.timeFrom).toBe('05:30')
    expect(preCallItem!.timeTo).toBe('08:00')
  })

  it('pre-call before 5am splits into triple + OT', () => {
    const result = calculateCrewCost(makeInput({ preCallStartTime: '04:00' }))
    const tripleItem = result.lineItems.find(li => li.description.includes('Pre-call') && li.description.includes('Triple'))
    const otItem = result.lineItems.find(li => li.description.includes('Pre-call') && li.description.includes('Overtime'))
    expect(tripleItem).toBeDefined()
    expect(tripleItem!.hours).toBe(1) // 04:00-05:00
    expect(tripleItem!.rate).toBe(53 * 3) // 3x BHR
    expect(tripleItem!.timeFrom).toBe('04:00')
    expect(tripleItem!.timeTo).toBe('05:00')
    expect(otItem).toBeDefined()
    expect(otItem!.hours).toBe(3) // 05:00-08:00
    expect(otItem!.rate).toBe(Math.round(53 * 1.0)) // OT rate = BHR * otCoefficient
    expect(otItem!.timeFrom).toBe('05:00')
    expect(otItem!.timeTo).toBe('08:00')
  })

  it('pre-call does NOT affect day length or CWD conversion', () => {
    const withoutPreCall = calculateCrewCost(makeInput())
    const withPreCall = calculateCrewCost(makeInput({ preCallStartTime: '05:30' }))
    // Day description should be the same (not converted to CWD)
    expect(withPreCall.dayDescription).toBe(withoutPreCall.dayDescription)
    // The non-pre-call line items should be identical
    const withoutPreCallItems = withoutPreCall.lineItems
    const withPreCallItems = withPreCall.lineItems.filter(li => !li.description.includes('Pre-call'))
    expect(withPreCallItems.map(i => i.total)).toEqual(withoutPreCallItems.map(i => i.total))
  })

  it('pre-call total is added to grandTotal', () => {
    const without = calculateCrewCost(makeInput())
    const with_ = calculateCrewCost(makeInput({ preCallStartTime: '05:30' }))
    // 1st AD BHR=53, OT coeff=1.0, OT rate=53, 2.5h * 53 = 132.5
    const preCallTotal = 2.5 * Math.round(Math.round(532 / 10) * 1.0)
    expect(with_.grandTotal).toBe(without.grandTotal + preCallTotal)
    expect(with_.subtotal).toBe(without.subtotal + preCallTotal)
  })

  it('no pre-call when preCallStartTime is undefined', () => {
    const result = calculateCrewCost(makeInput())
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })

  it('no pre-call when preCallStartTime equals callTime', () => {
    const result = calculateCrewCost(makeInput({ preCallStartTime: '08:00' }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })

  it('no pre-call when preCallStartTime is after callTime', () => {
    const result = calculateCrewCost(makeInput({ preCallStartTime: '09:00' }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })

  it('saturday pre-call uses 1.5x BHR', () => {
    const result = calculateCrewCost(makeInput({
      preCallStartTime: '06:00',
      dayOfWeek: 'saturday',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    // Saturday OT rate for 1st AD: round(532 * 1.5 / 10) = 80
    expect(preCallItem!.rate).toBe(Math.round(532 * 1.5 / 10))
    expect(preCallItem!.hours).toBe(2) // 06:00-08:00
  })

  it('sunday pre-call uses 2x BHR', () => {
    const result = calculateCrewCost(makeInput({
      preCallStartTime: '06:00',
      dayOfWeek: 'sunday',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    expect(preCallItem!.rate).toBe(53 * 2) // 2x BHR
    expect(preCallItem!.hours).toBe(2) // 06:00-08:00
  })

  it('PM/PA/Runner weekday pre-call uses BHR (not OT grade rate)', () => {
    const pmRole = APA_CREW_ROLES.find(r => r.role === 'Production Manager')!
    const result = calculateCrewCost(makeInput({
      role: pmRole,
      agreedDailyRate: 480,
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    // PM BHR = 480/10 = 48, PM uses BHR for OT (no coefficient)
    expect(preCallItem!.rate).toBe(48)
  })

  it('pre-call on continuous working day still prepends correctly', () => {
    const result = calculateCrewCost(makeInput({
      dayType: 'continuous_working',
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    expect(preCallItem!.hours).toBe(2) // 06:00-08:00
    // First line item should be the pre-call
    expect(result.lineItems[0].description).toContain('Pre-call')
  })

  it('pre-call on prep day works', () => {
    const result = calculateCrewCost(makeInput({
      dayType: 'prep',
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeDefined()
    expect(preCallItem!.hours).toBe(2)
  })

  it('pre-call is NOT added for rest days', () => {
    const result = calculateCrewCost(makeInput({
      dayType: 'rest',
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })

  it('pre-call is NOT added for travel days', () => {
    const result = calculateCrewCost(makeInput({
      dayType: 'travel',
      preCallStartTime: '06:00',
    }))
    const preCallItem = result.lineItems.find(li => li.description.includes('Pre-call'))
    expect(preCallItem).toBeUndefined()
  })
})
