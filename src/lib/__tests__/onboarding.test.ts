import { describe, it, expect } from 'vitest'
import { ONBOARDING_COUNTRIES, CALCULATOR_TOOLS, BOOKKEEPING_OPTIONS } from '@/lib/onboarding'
import { DEPARTMENTS } from '@/data/apa-rates'
import { getEngineForCountry } from '@/engines/index'

describe('Onboarding constants', () => {
  it('has 6 country options including Other', () => {
    expect(ONBOARDING_COUNTRIES).toHaveLength(6)
    expect(ONBOARDING_COUNTRIES.map(c => c.code)).toContain('OTHER')
    expect(ONBOARDING_COUNTRIES.map(c => c.code)).toContain('GB')
    expect(ONBOARDING_COUNTRIES.map(c => c.code)).toContain('BE')
  })

  it('has 5 calculator tool options', () => {
    expect(CALCULATOR_TOOLS).toHaveLength(5)
    expect(CALCULATOR_TOOLS).toContain('Google Sheets')
    expect(CALCULATOR_TOOLS).toContain('Pen & paper')
  })

  it('has 6 bookkeeping options (excluding "I don\'t use one")', () => {
    expect(BOOKKEEPING_OPTIONS).toHaveLength(6)
    expect(BOOKKEEPING_OPTIONS).toContain('Xero')
    expect(BOOKKEEPING_OPTIONS).toContain('FreeAgent')
  })

  it('DEPARTMENTS has at least 10 entries from engine', () => {
    expect(DEPARTMENTS.length).toBeGreaterThanOrEqual(10)
    expect(DEPARTMENTS).toContain('Camera')
    expect(DEPARTMENTS).toContain('Lighting')
    expect(DEPARTMENTS).toContain('Sound')
  })

  it('country codes map to valid engines', () => {
    expect(getEngineForCountry('BE')).toBe('sdym-be')
    expect(getEngineForCountry('GB')).toBe('apa-uk')
    expect(getEngineForCountry('FR')).toBe('apa-uk') // no FR engine yet, falls back
  })
})
