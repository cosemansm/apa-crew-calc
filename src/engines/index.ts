import type { CalculatorEngine } from './types'

const engines = new Map<string, CalculatorEngine>()

export const DEFAULT_ENGINE_ID = 'apa-uk'

// Country → engine mapping. One line per country-specific engine.
const countryEngineMap: Record<string, string> = {
  'BE': 'sdym-be',
}

export function registerEngine(engine: CalculatorEngine): void {
  engines.set(engine.meta.id, engine)
}

export function getEngine(id: string): CalculatorEngine {
  const engine = engines.get(id)
  if (!engine) throw new Error(`Engine not found: ${id}`)
  return engine
}

export function getAllEngines(): CalculatorEngine[] {
  return Array.from(engines.values())
}

export function getEngineIds(): string[] {
  return Array.from(engines.keys())
}

export function getEngineForCountry(country: string): string {
  return countryEngineMap[country] ?? DEFAULT_ENGINE_ID
}
