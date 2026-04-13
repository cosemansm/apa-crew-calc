import { describe, it, expect, beforeAll } from 'vitest'

describe('APA UK engine parity', () => {
  beforeAll(async () => {
    // Force engine registration by importing the engine
    await import('../apa-uk/index')
  })

  it('Gaffer basic working day produces correct output via engine wrapper', async () => {
    const { getEngine } = await import('../index')
    const { calculateCrewCost } = await import('../apa-uk/calculator')
    const { APA_CREW_ROLES } = await import('../apa-uk/rates')

    const gaffer = APA_CREW_ROLES.find(r => r.role === 'Gaffer')!
    const apaInput = {
      role: gaffer,
      agreedDailyRate: 568,
      dayType: 'basic_working' as const,
      dayOfWeek: 'monday' as const,
      callTime: '08:00',
      wrapTime: '21:00',
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
      equipmentValue: 0,
      equipmentDiscount: 0,
    }
    const directResult = calculateCrewCost(apaInput)

    const engine = getEngine('apa-uk')
    const { crewRoleToEngineRole } = await import('../apa-uk/rates')
    const engineInput = {
      role: crewRoleToEngineRole(gaffer),
      agreedDailyRate: 568,
      dayType: 'basic_working',
      dayOfWeek: 'monday',
      callTime: '08:00',
      wrapTime: '21:00',
      firstBreakGiven: true,
      firstBreakTime: '13:00',
      firstBreakDurationMins: 60,
      secondBreakGiven: false,
      secondBreakDurationMins: 30,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageDistance: 0,
      equipmentValue: 0,
      equipmentDiscount: 0,
    }
    const wrappedResult = engine.calculate(engineInput)

    expect(wrappedResult.grandTotal).toBe(directResult.grandTotal)
    expect(wrappedResult.subtotal).toBe(directResult.subtotal)
    expect(wrappedResult.lineItems.length).toBe(directResult.lineItems.length)
    expect(wrappedResult.lineItems.map(i => i.total)).toEqual(directResult.lineItems.map(i => i.total))
    expect(wrappedResult.mileageDistance).toBe(directResult.mileageMiles)
    expect(wrappedResult.dayDescription).toBe(directResult.dayDescription)
  })
})
