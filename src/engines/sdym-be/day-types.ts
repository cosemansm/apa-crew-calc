import type { EngineDayType } from '../types'

export const dayTypes: EngineDayType[] = [
  { value: 'standard',         label: 'Standard Day' },
  { value: 'journee_continue', label: 'Continuous Workday' },
  { value: 'saturday',         label: 'Saturday / 6th Consecutive Day' },
  { value: 'sunday_ph',        label: 'Sunday / Public Holiday' },
  { value: 'recce',            label: 'Recce / Preparation Day' },
  { value: 'travel',           label: 'Travel Day' },
]
