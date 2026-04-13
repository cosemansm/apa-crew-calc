import type { EngineDayType } from '../types'

export const dayTypes: EngineDayType[] = [
  { value: 'basic_working',      label: 'Basic Working Day',      defaultWrapHours: 10 },
  { value: 'continuous_working', label: 'Continuous Working Day', defaultWrapHours: 10 },
  { value: 'prep',               label: 'Prep Day' },
  { value: 'recce',              label: 'Recce Day' },
  { value: 'build_strike',       label: 'Build / Strike Day' },
  { value: 'pre_light',          label: 'Pre-Light Day' },
  { value: 'rest',               label: 'Rest Day' },
  { value: 'travel',             label: 'Travel Day' },
]
