export const ONBOARDING_COUNTRIES = [
  { code: 'GB', label: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'IE', label: 'Ireland', flag: '\u{1F1EE}\u{1F1EA}' },
  { code: 'BE', label: 'Belgium', flag: '\u{1F1E7}\u{1F1EA}' },
  { code: 'NL', label: 'Netherlands', flag: '\u{1F1F3}\u{1F1F1}' },
  { code: 'FR', label: 'France', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'OTHER', label: 'Other', flag: '\u{1F30D}' },
] as const

export const CALCULATOR_TOOLS = [
  'Other apps',
  'Google Sheets',
  'My own brain',
  'Pen & paper',
  'Relying on others',
] as const

export const BOOKKEEPING_OPTIONS = [
  'FreeAgent',
  'Xero',
  'QuickBooks',
  'Sage',
  'Wave',
  'Other',
] as const

export type OnboardingCountry = (typeof ONBOARDING_COUNTRIES)[number]['code']
export type CalculatorTool = (typeof CALCULATOR_TOOLS)[number]
export type BookkeepingOption = (typeof BOOKKEEPING_OPTIONS)[number] | "I don't use one"
