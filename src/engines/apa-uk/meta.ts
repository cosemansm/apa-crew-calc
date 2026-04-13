import type { EngineMeta } from '../types'

export const meta: EngineMeta = {
  id: 'apa-uk',
  name: 'UK APA T&Cs (2025)',
  shortName: 'APA UK',
  country: 'GB',
  currency: 'GBP',
  currencySymbol: '£',
  mileageUnit: 'miles',
  domain: undefined,
  features: {
    agreedRateInput: true,
    bhrOtInfo: true,
    breaksAndPenalties: true,
    mileage: true,
    equipmentTransport: false,
    favourites: true,
    tocWarning: true,
    callTypeBadges: true,
  },
}
