import { getEngine, DEFAULT_ENGINE_ID } from '@/engines/index'

export function getCurrencySymbol(calcEngine: string | null | undefined): string {
  try {
    return getEngine(calcEngine ?? DEFAULT_ENGINE_ID).meta.currencySymbol
  } catch {
    return '£'
  }
}

export function groupByCurrency(rows: Array<{ calc_engine?: string | null; total: number }>): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const row of rows) {
    const symbol = getCurrencySymbol(row.calc_engine)
    totals[symbol] = (totals[symbol] ?? 0) + row.total
  }
  return totals
}

export function formatMultiCurrencyTotal(totals: Record<string, number>): string {
  return Object.entries(totals)
    .map(([symbol, total]) => `${symbol}${total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' · ')
}
