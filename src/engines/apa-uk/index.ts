import { registerEngine } from '../index'
import type { CalculatorEngine } from '../types'
import { meta } from './meta'
import { dayTypes } from './day-types'
import { ENGINE_ROLES, ENGINE_DEPARTMENTS, getRolesByDepartment as apaGetRolesByDepartment, getRole as apaGetRole, crewRoleToEngineRole } from './rates'
import { calculateEngineWrapper } from './calculator'

const engine: CalculatorEngine = {
  meta,
  roles: ENGINE_ROLES,
  departments: ENGINE_DEPARTMENTS,
  dayTypes,
  getRolesByDepartment(department: string) {
    return apaGetRolesByDepartment(department).map(crewRoleToEngineRole)
  },
  getRole(roleName: string) {
    const r = apaGetRole(roleName)
    return r ? crewRoleToEngineRole(r) : undefined
  },
  calculate: calculateEngineWrapper,
}

registerEngine(engine)

export { engine as apaUkEngine }
