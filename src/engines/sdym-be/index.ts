import { registerEngine } from '../index'
import type { CalculatorEngine } from '../types'
import { meta } from './meta'
import { dayTypes } from './day-types'
import { SDYM_ROLES, SDYM_DEPARTMENTS, getRolesByDepartment, getRole } from './rates'
import { calculateSdym } from './calculator'

const engine: CalculatorEngine = {
  meta,
  roles: SDYM_ROLES,
  departments: SDYM_DEPARTMENTS,
  dayTypes,
  getRolesByDepartment,
  getRole,
  calculate: calculateSdym,
}

registerEngine(engine)

export { engine as sdymBeEngine }
