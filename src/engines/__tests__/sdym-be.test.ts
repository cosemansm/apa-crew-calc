import { describe, it, expect, beforeAll } from 'vitest'
import type { EngineCalculationInput } from '../types'

describe('Sodyum Deal Memo 2026 engine', () => {
  beforeAll(async () => {
    await import('../sdym-be/index')
  })

  async function calc(overrides: Partial<EngineCalculationInput>) {
    const { getEngine } = await import('../index')
    const { SDYM_ROLES } = await import('../sdym-be/rates')
    const engine = getEngine('sdym-be')
    const gaffer = SDYM_ROLES.find(r => r.role === 'Gaffer')!
    const base: EngineCalculationInput = {
      role: gaffer,
      agreedDailyRate: 0,
      dayType: 'standard',
      dayOfWeek: 'monday',
      callTime: '08:00',
      wrapTime: '19:00',
      firstBreakGiven: true,
      firstBreakTime: '12:00',
      firstBreakDurationMins: 60,
      secondBreakGiven: false,
      secondBreakDurationMins: 0,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageDistance: 0,
    }
    return engine.calculate({ ...base, ...overrides })
  }

  async function calcLA(overrides: Partial<EngineCalculationInput>) {
    const { getEngine } = await import('../index')
    const { SDYM_ROLES } = await import('../sdym-be/rates')
    const engine = getEngine('sdym-be')
    const la = SDYM_ROLES.find(r => r.role === 'Lighting Assistant')!
    const base: EngineCalculationInput = {
      role: la,
      agreedDailyRate: 0,
      dayType: 'standard',
      dayOfWeek: 'monday',
      callTime: '08:00',
      wrapTime: '19:00',
      firstBreakGiven: true,
      firstBreakTime: '12:00',
      firstBreakDurationMins: 60,
      secondBreakGiven: false,
      secondBreakDurationMins: 0,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageDistance: 0,
    }
    return engine.calculate({ ...base, ...overrides })
  }

  it('Test 1: Gaffer standard Mon 08:00–20:00 → €702 (€594 + 1h OT €108)', async () => {
    const result = await calc({ wrapTime: '20:00' })
    expect(result.grandTotal).toBe(702)
  })

  it('Test 2: Gaffer standard Mon 08:00–19:00 → €594 flat', async () => {
    const result = await calc({ wrapTime: '19:00' })
    expect(result.grandTotal).toBe(594)
  })

  it('Test 3: Gaffer Saturday 08:00–19:00 → €891 flat', async () => {
    const result = await calc({ dayType: 'saturday', wrapTime: '19:00' })
    expect(result.grandTotal).toBe(891)
  })

  it('Test 4: Gaffer Sunday/PH 08:00–19:00 → €1188 flat', async () => {
    const result = await calc({ dayType: 'sunday_ph', wrapTime: '19:00' })
    expect(result.grandTotal).toBe(1188)
  })

  it('Test 5: Gaffer standard 18:00–01:00 → €594 + €162 night surcharge = €756', async () => {
    // 18:00–01:00 = 7h total, minus 1h break = 6h working (< 10h threshold, no OT)
    // Night hours: 22:00–01:00 = 3h × €54 = €162
    const result = await calc({
      callTime: '18:00',
      wrapTime: '01:00',
      firstBreakTime: '21:00',
    })
    expect(result.grandTotal).toBe(756)
  })

  it('Test 6: LA standard Mon 08:00–20:00 → €637 (€539 + 1h OT €98)', async () => {
    const result = await calcLA({ wrapTime: '20:00' })
    expect(result.grandTotal).toBe(637)
  })

  it('Test 7a: Mileage 50km no equipment → €22.50', async () => {
    const result = await calc({
      mileageDistance: 50,
      extra: { hasEquipment: false, kmRate: 0.45 },
    })
    expect(result.mileage).toBeCloseTo(22.5, 2)
    expect(result.grandTotal).toBe(616.5) // 594 + 22.50
  })

  it('Test 7b: Mileage 50km with equipment → €42.50', async () => {
    const result = await calc({
      mileageDistance: 50,
      extra: { hasEquipment: true, kmRate: 0.85 },
    })
    expect(result.mileage).toBeCloseTo(42.5, 2)
    expect(result.grandTotal).toBe(636.5) // 594 + 42.50
  })

  it('Test 8: LA assigned Recce → throws descriptive error', async () => {
    await expect(calcLA({ dayType: 'recce' })).rejects.toThrow('Recce day type is only available for the Gaffer')
  })
})
