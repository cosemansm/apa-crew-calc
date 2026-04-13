import { describe, it, expect, beforeEach } from 'vitest'

// We import after each reset to work around module-level Map state
// Instead, test the exported functions directly

describe('engine registry', () => {
  it('throws when getting an unregistered engine', async () => {
    const { getEngine } = await import('../index')
    expect(() => getEngine('nonexistent')).toThrow('Engine not found: nonexistent')
  })

  it('maps BE country to sdym-be', async () => {
    const { getEngineForCountry } = await import('../index')
    expect(getEngineForCountry('BE')).toBe('sdym-be')
  })

  it('falls back to apa-uk for unknown countries', async () => {
    const { getEngineForCountry } = await import('../index')
    expect(getEngineForCountry('US')).toBe('apa-uk')
    expect(getEngineForCountry('GB')).toBe('apa-uk')
    expect(getEngineForCountry('')).toBe('apa-uk')
  })

  it('DEFAULT_ENGINE_ID is apa-uk', async () => {
    const { DEFAULT_ENGINE_ID } = await import('../index')
    expect(DEFAULT_ENGINE_ID).toBe('apa-uk')
  })
})
