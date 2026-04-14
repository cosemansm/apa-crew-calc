import { getEngine, DEFAULT_ENGINE_ID } from '@/engines/index'

interface CachedRates {
  rates: Record<string, number>
  fetchedAt: number
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const cache = new Map<string, CachedRates>()

/**
 * Fetch latest exchange rates from frankfurter.app (ECB data, updated daily).
 * Caches per base currency in memory for 24 hours.
 */
async function fetchRates(base: string): Promise<Record<string, number> | null> {
  const cached = cache.get(base)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rates
  }

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}`)
    if (!res.ok) return null
    const data = await res.json()
    cache.set(base, { rates: data.rates, fetchedAt: Date.now() })
    return data.rates
  } catch {
    return null
  }
}

/**
 * Get the exchange rate from one currency to another.
 * Returns null if the rate cannot be fetched.
 */
export async function getExchangeRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1
  const rates = await fetchRates(from)
  if (!rates || rates[to] == null) return null
  return rates[to]
}

/**
 * Convert an amount from one currency to another.
 * Returns null if the rate cannot be fetched (caller should fall back to unconverted display).
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  if (fromCurrency === toCurrency) return amount
  const rate = await getExchangeRate(fromCurrency, toCurrency)
  if (rate == null) return null
  return amount * rate
}

/**
 * Resolve the ISO 4217 currency code for a given engine ID.
 */
export function getEngineCurrency(engineId: string | null | undefined): string {
  try {
    return getEngine(engineId ?? DEFAULT_ENGINE_ID).meta.currency
  } catch {
    return 'GBP'
  }
}
