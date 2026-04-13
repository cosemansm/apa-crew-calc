import type { EngineRole } from '../types'

export interface SdymRoleData {
  dayRate: number
  hourlyBase: number
  otRate: number
  nightSurcharge: number
}

export const SDYM_ROLES: EngineRole[] = [
  {
    role: 'Gaffer',
    department: 'Lighting',
    minRate: null,
    maxRate: null,
    engineData: {
      dayRate: 594,
      hourlyBase: 54,
      otRate: 108,
      nightSurcharge: 54,
    } satisfies SdymRoleData,
  },
  {
    role: 'Lighting Assistant',
    department: 'Lighting',
    minRate: null,
    maxRate: null,
    engineData: {
      dayRate: 539,
      hourlyBase: 49,
      otRate: 98,
      nightSurcharge: 49,
    } satisfies SdymRoleData,
  },
]

export const SDYM_DEPARTMENTS: string[] = [
  ...new Set(SDYM_ROLES.map(r => r.department)),
]

export function getRolesByDepartment(department: string): EngineRole[] {
  return SDYM_ROLES.filter(r => r.department === department)
}

export function getRole(roleName: string): EngineRole | undefined {
  return SDYM_ROLES.find(r => r.role === roleName)
}

// Flat rates derived from base day rates
export const FLAT_RATES = {
  saturday: { Gaffer: 891, 'Lighting Assistant': 808.5 },
  sunday_ph: { Gaffer: 1188, 'Lighting Assistant': 1078 },
  recce: { Gaffer: 500 },
  travel: { Gaffer: 450, 'Lighting Assistant': 410 },
} as const
