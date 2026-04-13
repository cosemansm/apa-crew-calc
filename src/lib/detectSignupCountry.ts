import { getAllEngines } from '@/engines/index'

/**
 * Detects the user's country at signup time.
 * Priority: ?ref= param → document.referrer → ipapi.co → fallback 'GB'
 * Non-blocking — any failure returns 'GB'.
 */
export async function detectSignupCountry(): Promise<string> {
  try {
    // 1. Check ?ref= query param for known engine domains
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) {
      const countryFromRef = countryForDomain(ref)
      if (countryFromRef) return countryFromRef
    }

    // 2. Check document.referrer for known engine domains
    if (document.referrer) {
      const referrerHost = new URL(document.referrer).hostname
      const countryFromReferrer = countryForDomain(referrerHost)
      if (countryFromReferrer) return countryFromReferrer
    }

    // 3. IP geolocation via ipapi.co
    const response = await fetch('https://ipapi.co/country/')
    if (!response.ok) return 'GB'
    const country = (await response.text()).trim()
    return country || 'GB'
  } catch {
    return 'GB'
  }
}

function countryForDomain(domain: string): string | null {
  for (const engine of getAllEngines()) {
    if (engine.meta.domain && domain.includes(engine.meta.domain)) {
      return engine.meta.country
    }
  }
  return null
}
