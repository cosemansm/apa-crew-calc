import { describe, it, expect } from 'vitest'
import { shouldShowBookkeepingPopup, getPopupVariant } from '@/lib/bookkeepingPopup'

describe('shouldShowBookkeepingPopup', () => {
  const base = {
    bookkeepingSoftware: 'Xero',
    hasBookkeepingConnection: false,
    subscriptionStatus: 'trialing',
    trialEndsAt: '2026-05-01T00:00:00Z',
    dismissedAt: null,
    now: new Date('2026-04-22T12:00:00Z'),
  }

  it('shows for trial user with bookkeeping selected', () => {
    expect(shouldShowBookkeepingPopup(base)).toBe(true)
  })

  it('hides when no bookkeeping selected', () => {
    expect(shouldShowBookkeepingPopup({ ...base, bookkeepingSoftware: null })).toBe(false)
  })

  it('hides when "I don\'t use one" selected', () => {
    expect(shouldShowBookkeepingPopup({ ...base, bookkeepingSoftware: "I don't use one" })).toBe(false)
  })

  it('hides when bookkeeping is already connected', () => {
    expect(shouldShowBookkeepingPopup({ ...base, hasBookkeepingConnection: true })).toBe(false)
  })

  it('hides for active (Pro) users', () => {
    expect(shouldShowBookkeepingPopup({ ...base, subscriptionStatus: 'active' })).toBe(false)
  })

  it('hides for lifetime users', () => {
    expect(shouldShowBookkeepingPopup({ ...base, subscriptionStatus: 'lifetime' })).toBe(false)
  })

  it('hides when dismissed less than 7 days ago', () => {
    expect(shouldShowBookkeepingPopup({
      ...base,
      dismissedAt: '2026-04-20T12:00:00Z',
    })).toBe(false)
  })

  it('shows when dismissed more than 7 days ago', () => {
    expect(shouldShowBookkeepingPopup({
      ...base,
      dismissedAt: '2026-04-10T12:00:00Z',
    })).toBe(true)
  })

  it('shows for expired trial (free) users', () => {
    expect(shouldShowBookkeepingPopup({
      ...base,
      subscriptionStatus: 'trialing',
      trialEndsAt: '2026-04-01T00:00:00Z',
    })).toBe(true)
  })
})

describe('getPopupVariant', () => {
  it('returns trial for active trial', () => {
    expect(getPopupVariant({
      subscriptionStatus: 'trialing',
      trialEndsAt: '2026-05-01T00:00:00Z',
      now: new Date('2026-04-22T12:00:00Z'),
    })).toBe('trial')
  })

  it('returns upgrade for expired trial', () => {
    expect(getPopupVariant({
      subscriptionStatus: 'trialing',
      trialEndsAt: '2026-04-01T00:00:00Z',
      now: new Date('2026-04-22T12:00:00Z'),
    })).toBe('upgrade')
  })

  it('returns upgrade for canceled', () => {
    expect(getPopupVariant({
      subscriptionStatus: 'canceled',
      trialEndsAt: null,
      now: new Date('2026-04-22T12:00:00Z'),
    })).toBe('upgrade')
  })
})
