import { useState, useEffect, useMemo } from 'react'
import { getExchangeRate, getEngineCurrency } from '@/lib/exchangeRate'
import { getCurrencySymbol } from '@/lib/currency'

interface DayWithTotal {
  calc_engine: string | null
  total: number
}

interface ConvertedTotals {
  /** Whether conversion is active (multiple currencies detected) */
  isConverting: boolean
  /** Whether rates are still loading */
  loading: boolean
  /** Whether conversion failed (fallback to multi-currency display) */
  failed: boolean
  /** The target currency symbol (from global engine) */
  targetSymbol: string
  /** Converted total, or null if not ready / failed */
  total: number | null
  /** Loaded exchange rates keyed by source currency code -> multiplier */
  rates: Record<string, number>
}

/**
 * Converts an array of day totals (potentially in different currencies) into a
 * single total denominated in the global engine's currency.
 *
 * If all days already share a single currency, no conversion is performed.
 * If the exchange rate API fails, `failed` is true and callers should fall back
 * to the existing multi-currency display.
 */
export function useConvertedTotals(
  days: DayWithTotal[],
  globalEngineId: string,
): ConvertedTotals {
  const targetCurrency = getEngineCurrency(globalEngineId)
  const targetSymbol = getCurrencySymbol(globalEngineId)

  // Stable string key for distinct currencies (avoids Set referential instability)
  const currencyKey = useMemo(() => {
    const set = new Set<string>()
    for (const d of days) set.add(getEngineCurrency(d.calc_engine))
    return [...set].sort().join(',')
  }, [days])

  const foreignCurrencies = useMemo(() =>
    currencyKey.split(',').filter(c => c && c !== targetCurrency),
    [currencyKey, targetCurrency],
  )

  const needsConversion = foreignCurrencies.length > 0

  const [rates, setRates] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  // Fetch rates for all foreign currencies in parallel
  useEffect(() => {
    if (!needsConversion) {
      setRates({})
      setFailed(false)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setFailed(false)

    Promise.all(
      foreignCurrencies.map(cur =>
        getExchangeRate(cur, targetCurrency).then(rate => [cur, rate] as const)
      )
    ).then(results => {
      if (cancelled) return
      const newRates: Record<string, number> = { [targetCurrency]: 1 }
      for (const [cur, rate] of results) {
        if (rate == null) {
          setFailed(true)
          setLoading(false)
          return
        }
        newRates[cur] = rate
      }
      setRates(newRates)
      setLoading(false)
    }).catch(() => {
      if (!cancelled) {
        setFailed(true)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [needsConversion, targetCurrency, currencyKey])

  // Compute converted total
  const total = useMemo(() => {
    if (!needsConversion) {
      return days.reduce((sum, d) => sum + d.total, 0)
    }
    if (failed || Object.keys(rates).length === 0) return null
    let sum = 0
    for (const d of days) {
      const cur = getEngineCurrency(d.calc_engine)
      const rate = rates[cur]
      if (rate == null) return null
      sum += d.total * rate
    }
    return sum
  }, [days, needsConversion, failed, rates])

  return {
    isConverting: needsConversion,
    loading,
    failed,
    targetSymbol,
    total,
    rates,
  }
}
