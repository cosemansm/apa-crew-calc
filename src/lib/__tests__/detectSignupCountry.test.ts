import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'

describe('detectSignupCountry', () => {
  beforeEach(async () => {
    await import('@/engines/apa-uk')
    await import('@/engines/sdym-be')
    vi.stubGlobal('fetch', vi.fn())
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    })
    Object.defineProperty(Object.getPrototypeOf(document), 'referrer', {
      get: () => '',
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('detects BE from ?ref=crewdock.be query param', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?ref=crewdock.be' },
      writable: true,
    })
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('BE')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('detects BE from document.referrer containing crewdock.be', async () => {
    Object.defineProperty(Object.getPrototypeOf(document), 'referrer', {
      get: () => 'https://crewdock.be/signup',
      configurable: true,
    })
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('BE')
    expect(fetch).not.toHaveBeenCalled()
    // Restore referrer to empty string after test
    Object.defineProperty(Object.getPrototypeOf(document), 'referrer', {
      get: () => '',
      configurable: true,
    })
  })

  it('calls ipapi.co when no domain match and returns country', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('DE', { status: 200 })
    )
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('DE')
    expect(fetch).toHaveBeenCalledWith('https://ipapi.co/country/')
  })

  it('returns GB as fallback when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('GB')
  })

  it('returns GB as fallback when ipapi response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('error', { status: 500 })
    )
    const { detectSignupCountry } = await import('../detectSignupCountry')
    const result = await detectSignupCountry()
    expect(result).toBe('GB')
  })
})
