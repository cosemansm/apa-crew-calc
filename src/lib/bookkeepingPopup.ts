export function shouldShowBookkeepingPopup(params: {
  bookkeepingSoftware: string | null
  hasBookkeepingConnection: boolean
  subscriptionStatus: string
  trialEndsAt: string | null
  dismissedAt: string | null
  now?: Date
}): boolean {
  const { bookkeepingSoftware, hasBookkeepingConnection, subscriptionStatus, trialEndsAt, dismissedAt, now = new Date() } = params

  if (!bookkeepingSoftware || bookkeepingSoftware === "I don't use one") return false
  if (hasBookkeepingConnection) return false
  if (subscriptionStatus === 'active' || subscriptionStatus === 'lifetime') return false

  if (dismissedAt) {
    const dismissDate = new Date(dismissedAt)
    const daysSinceDismiss = (now.getTime() - dismissDate.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceDismiss < 7) return false
  }

  return true
}

export function getPopupVariant(params: {
  subscriptionStatus: string
  trialEndsAt: string | null
  now?: Date
}): 'trial' | 'upgrade' {
  const { subscriptionStatus, trialEndsAt, now = new Date() } = params
  if (subscriptionStatus === 'trialing' && trialEndsAt && new Date(trialEndsAt) > now) {
    return 'trial'
  }
  return 'upgrade'
}

export const BOOKKEEPING_BRAND_COLORS: Record<string, string> = {
  Xero: '#13B5EA',
  FreeAgent: '#3AA660',
  QuickBooks: '#2CA01C',
  Sage: '#00D639',
  Wave: '#003DA5',
  Other: '#8A8A8A',
}
