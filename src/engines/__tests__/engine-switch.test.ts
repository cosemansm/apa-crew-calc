import { describe, it, expect, beforeAll } from 'vitest'

describe('cross-engine switch guards', () => {
  beforeAll(async () => {
    await import('../apa-uk/index')
    await import('../sdym-be/index')
  })

  it('sdym-be throws on APA-specific day type: prep', async () => {
    const { getEngine } = await import('../index')
    const { SDYM_ROLES } = await import('../sdym-be/rates')
    const engine = getEngine('sdym-be')
    const gaffer = SDYM_ROLES.find(r => r.role === 'Gaffer')!
    expect(() => engine.calculate({
      role: gaffer,
      agreedDailyRate: 0,
      dayType: 'prep',
      dayOfWeek: 'monday',
      callTime: '08:00',
      wrapTime: '19:00',
      firstBreakGiven: false,
      firstBreakDurationMins: 0,
      secondBreakGiven: false,
      secondBreakDurationMins: 0,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageDistance: 0,
    })).toThrow('Unknown day type for sdym-be engine: prep')
  })

  it('sdym-be throws on APA-specific day type: build_strike', async () => {
    const { getEngine } = await import('../index')
    const { SDYM_ROLES } = await import('../sdym-be/rates')
    const engine = getEngine('sdym-be')
    const gaffer = SDYM_ROLES.find(r => r.role === 'Gaffer')!
    expect(() => engine.calculate({
      role: gaffer,
      agreedDailyRate: 0,
      dayType: 'build_strike',
      dayOfWeek: 'monday',
      callTime: '08:00',
      wrapTime: '19:00',
      firstBreakGiven: false,
      firstBreakDurationMins: 0,
      secondBreakGiven: false,
      secondBreakDurationMins: 0,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageDistance: 0,
    })).toThrow('Unknown day type for sdym-be engine: build_strike')
  })

  it('sdym-be throws on APA-specific day type: pre_light', async () => {
    const { getEngine } = await import('../index')
    const { SDYM_ROLES } = await import('../sdym-be/rates')
    const engine = getEngine('sdym-be')
    const gaffer = SDYM_ROLES.find(r => r.role === 'Gaffer')!
    expect(() => engine.calculate({
      role: gaffer,
      agreedDailyRate: 0,
      dayType: 'pre_light',
      dayOfWeek: 'monday',
      callTime: '08:00',
      wrapTime: '19:00',
      firstBreakGiven: false,
      firstBreakDurationMins: 0,
      secondBreakGiven: false,
      secondBreakDurationMins: 0,
      continuousFirstBreakGiven: false,
      continuousAdditionalBreakGiven: false,
      travelHours: 0,
      mileageDistance: 0,
    })).toThrow('Unknown day type for sdym-be engine: pre_light')
  })

  it('sdym-be getRole returns undefined for APA-only roles', async () => {
    const { getEngine } = await import('../index')
    const engine = getEngine('sdym-be')
    expect(engine.getRole('Sound Mixer')).toBeUndefined()
    expect(engine.getRole('Camera Operator')).toBeUndefined()
    expect(engine.getRole('Art Director')).toBeUndefined()
  })

  it('APA-only day types are absent from sdym-be day list', async () => {
    const { getEngine } = await import('../index')
    const sdym = getEngine('sdym-be')
    const sdymValues = new Set(sdym.dayTypes.map(dt => dt.value))
    for (const apaOnly of ['prep', 'build_strike', 'pre_light', 'basic_working', 'continuous_working']) {
      expect(sdymValues.has(apaOnly)).toBe(false)
    }
  })
})
