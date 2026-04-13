import { registerEngine } from '../index'
import type { CalculatorEngine } from '../types'
import { meta } from './meta'
import { dayTypes } from './day-types'
import { SDYM_ROLES, SDYM_DEPARTMENTS, getRolesByDepartment, getRole } from './rates'
import { calculateBelgian } from './calculator'

const engine: CalculatorEngine = {
  meta,
  roles: SDYM_ROLES,
  departments: SDYM_DEPARTMENTS,
  dayTypes,
  getRolesByDepartment,
  getRole,
  calculate: calculateBelgian,
}

registerEngine(engine)

export { engine as sdymBeEngine }
