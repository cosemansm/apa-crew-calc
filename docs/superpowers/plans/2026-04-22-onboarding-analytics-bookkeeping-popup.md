# Onboarding Analytics & Bookkeeping Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add onboarding analytics to the admin dashboard (calculator tool + bookkeeping software breakdowns) and a weekly bookkeeping connection popup on the user dashboard for trial/free users.

**Architecture:** Extend the `admin-stats` edge function with onboarding aggregation, render it in the existing admin dashboard tab. Add a `BookkeepingPopup` component to the dashboard that reads `bookkeeping_software` from `user_settings` and shows a contextual nudge (connect vs upgrade) based on subscription status, with 7-day dismiss tracked via a new `bookkeeping_popup_dismissed_at` column.

**Tech Stack:** React 19, TypeScript, Supabase (edge functions + DB), Recharts (admin charts), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-22-onboarding-analytics-bookkeeping-popup-design.md`

---

## File Structure

### New files
- `src/components/BookkeepingPopup.tsx` -- Dashboard popup component (trial: connect CTA, expired: upgrade CTA)
- `supabase/migrations/20260422120000_bookkeeping_popup_dismissed_at.sql` -- Add dismiss timestamp column
- `src/lib/__tests__/bookkeepingPopup.test.ts` -- Popup trigger condition tests

### Modified files
- `supabase/functions/admin-stats/index.ts` -- Add onboarding aggregation to response
- `src/pages/AdminPage.tsx` -- Add "Onboarding Insights" section to dashboard tab, extend AdminStats interface
- `src/pages/DashboardPage.tsx` -- Render BookkeepingPopup, load bookkeeping_software + dismissed_at from user_settings

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260422120000_bookkeeping_popup_dismissed_at.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add bookkeeping popup dismiss tracking
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS bookkeeping_popup_dismissed_at timestamptz;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260422120000_bookkeeping_popup_dismissed_at.sql
git commit -m "feat(db): add bookkeeping_popup_dismissed_at column to user_settings"
```

---

## Task 2: Extend admin-stats Edge Function

**Files:**
- Modify: `supabase/functions/admin-stats/index.ts`

- [ ] **Step 1: Update the user_settings select to include onboarding columns**

In the `Promise.allSettled` array (line 61), change the `user_settings` select from:

```typescript
db.from('user_settings').select('user_id, department'),
```

to:

```typescript
db.from('user_settings').select('user_id, department, calculator_tool, bookkeeping_software, onboarding_completed'),
```

- [ ] **Step 2: Add onboarding aggregation logic**

After the Feature Adoption section (after line 264, before the `// ── Build response` comment), add:

```typescript
    // ── Onboarding Insights ────────────────────────────────────────────
    const calculatorToolCounts: Record<string, number> = {}
    const bookkeepingSoftwareCounts: Record<string, number> = {}
    let totalOnboarded = 0
    let totalSkipped = 0

    userSettings.forEach(s => {
      if (s.onboarding_completed) {
        totalOnboarded++
        if (!s.calculator_tool && !s.bookkeeping_software) {
          totalSkipped++
        }
      }
      if (s.calculator_tool) {
        calculatorToolCounts[s.calculator_tool] = (calculatorToolCounts[s.calculator_tool] ?? 0) + 1
      }
      if (s.bookkeeping_software) {
        bookkeepingSoftwareCounts[s.bookkeeping_software] = (bookkeepingSoftwareCounts[s.bookkeeping_software] ?? 0) + 1
      }
    })

    const onboardingCalcTools = Object.entries(calculatorToolCounts)
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)

    const onboardingBookkeeping = Object.entries(bookkeepingSoftwareCounts)
      .map(([software, count]) => ({ software, count }))
      .sort((a, b) => b.count - a.count)

    const totalAnswered = totalOnboarded - totalSkipped
    const completionRate = totalOnboarded > 0 ? Math.round((totalAnswered / totalOnboarded) * 100) : 0
```

- [ ] **Step 3: Add onboarding key to the response object**

In the `stats` object (inside `// ── Build response`), add after the `features` key:

```typescript
      onboarding: {
        calculatorTools: onboardingCalcTools,
        bookkeepingSoftware: onboardingBookkeeping,
        totalOnboarded,
        totalSkipped,
        completionRate,
      },
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-stats/index.ts
git commit -m "feat(admin): add onboarding insights to admin-stats edge function"
```

---

## Task 3: Admin Dashboard UI -- Onboarding Insights

**Files:**
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: Extend AdminStats interface**

Add the `onboarding` key to the `AdminStats` interface (after the `features` block, around line 149):

```typescript
  onboarding: {
    calculatorTools: { tool: string; count: number }[];
    bookkeepingSoftware: { software: string; count: number }[];
    totalOnboarded: number;
    totalSkipped: number;
    completionRate: number;
  };
```

- [ ] **Step 2: Add the Onboarding Insights section**

After the "Feature Requests by Category" closing `)}` (line 1660), before the closing `</>` (line 1662), add:

```tsx
          {/* ── Onboarding Insights ─────────────────────────────────────── */}
          {stats.onboarding && (
            <>
              <SectionTitle>Onboarding Insights</SectionTitle>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
                  <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider block mb-1">Onboarded</span>
                  <span className="text-2xl font-bold font-mono text-[#FFD528]">{stats.onboarding.totalOnboarded}</span>
                  <span className="text-[11px] text-white/30 block mt-1">completed wizard</span>
                </div>
                <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
                  <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider block mb-1">Skipped</span>
                  <span className="text-2xl font-bold font-mono text-white">{stats.onboarding.totalSkipped}</span>
                  <span className="text-[11px] text-white/30 block mt-1">skipped all steps</span>
                </div>
                <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
                  <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider block mb-1">Completion Rate</span>
                  <span className="text-2xl font-bold font-mono text-[#4ade80]">{stats.onboarding.completionRate}%</span>
                  <span className="text-[11px] text-white/30 block mt-1">answered at least 1 step</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Calculator Tool breakdown */}
                {stats.onboarding.calculatorTools.length > 0 && (
                  <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5 space-y-2">
                    <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider block mb-2">Previous Calculator Method</span>
                    {stats.onboarding.calculatorTools.map(({ tool, count }) => {
                      const max = stats.onboarding.calculatorTools[0].count
                      return (
                        <div key={tool} className="flex items-center gap-3">
                          <span className="text-sm font-mono text-white/60 w-36 shrink-0 truncate">{tool}</span>
                          <div className="flex-1 bg-white/5 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-[#FFD528]" style={{ width: `${Math.min(100, (count / max) * 100)}%` }} />
                          </div>
                          <span className="text-sm font-mono text-white/40 w-6 text-right">{count}</span>
                        </div>
                      )
                    })}
                    <div className="flex justify-between pt-2 border-t border-white/5">
                      <span className="text-[11px] text-white/30 font-mono">Total responses</span>
                      <span className="text-[11px] text-white/50 font-mono">{stats.onboarding.calculatorTools.reduce((s, t) => s + t.count, 0)}</span>
                    </div>
                  </div>
                )}
                {/* Bookkeeping Software breakdown */}
                {stats.onboarding.bookkeepingSoftware.length > 0 && (
                  <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5 space-y-2">
                    <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider block mb-2">Bookkeeping Software</span>
                    {stats.onboarding.bookkeepingSoftware.map(({ software, count }) => {
                      const max = stats.onboarding.bookkeepingSoftware[0].count
                      const isNone = software === "I don't use one"
                      return (
                        <div key={software} className="flex items-center gap-3">
                          <span className="text-sm font-mono text-white/60 w-36 shrink-0 truncate">{software}</span>
                          <div className="flex-1 bg-white/5 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${isNone ? 'bg-gray-500' : 'bg-[#4ade80]'}`} style={{ width: `${Math.min(100, (count / max) * 100)}%` }} />
                          </div>
                          <span className="text-sm font-mono text-white/40 w-6 text-right">{count}</span>
                        </div>
                      )
                    })}
                    <div className="flex justify-between pt-2 border-t border-white/5">
                      <span className="text-[11px] text-white/30 font-mono">Total responses</span>
                      <span className="text-[11px] text-white/50 font-mono">{stats.onboarding.bookkeepingSoftware.reduce((s, t) => s + t.count, 0)}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "feat(admin): add Onboarding Insights section to admin dashboard"
```

---

## Task 4: Bookkeeping Popup Trigger Tests

**Files:**
- Create: `src/lib/__tests__/bookkeepingPopup.test.ts`

- [ ] **Step 1: Write tests for popup trigger conditions**

```typescript
// src/lib/__tests__/bookkeepingPopup.test.ts
import { describe, it, expect } from 'vitest'

/**
 * Pure logic: should the bookkeeping popup show?
 * Extracted here so the component can import it and tests stay unit-level.
 */
export function shouldShowBookkeepingPopup(params: {
  bookkeepingSoftware: string | null
  hasBookkeepingConnection: boolean
  subscriptionStatus: string
  trialEndsAt: string | null
  dismissedAt: string | null
  now?: Date
}): boolean {
  const { bookkeepingSoftware, hasBookkeepingConnection, subscriptionStatus, trialEndsAt, dismissedAt, now = new Date() } = params

  // No bookkeeping selected or "I don't use one"
  if (!bookkeepingSoftware || bookkeepingSoftware === "I don't use one") return false

  // Already connected
  if (hasBookkeepingConnection) return false

  // Pro or lifetime users don't see the popup
  if (subscriptionStatus === 'active' || subscriptionStatus === 'lifetime') return false

  // Dismissed less than 7 days ago
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
      dismissedAt: '2026-04-20T12:00:00Z', // 2 days ago
    })).toBe(false)
  })

  it('shows when dismissed more than 7 days ago', () => {
    expect(shouldShowBookkeepingPopup({
      ...base,
      dismissedAt: '2026-04-10T12:00:00Z', // 12 days ago
    })).toBe(true)
  })

  it('shows for expired trial (free) users', () => {
    expect(shouldShowBookkeepingPopup({
      ...base,
      subscriptionStatus: 'trialing',
      trialEndsAt: '2026-04-01T00:00:00Z', // expired
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
```

- [ ] **Step 2: Run tests to verify they fail** (functions not yet exported from a module)

```bash
npx vitest run src/lib/__tests__/bookkeepingPopup.test.ts
```

Expected: PASS (functions are defined inline in the test file for now)

- [ ] **Step 3: Extract logic to a shared module**

Create `src/lib/bookkeepingPopup.ts`:

```typescript
// src/lib/bookkeepingPopup.ts

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
```

- [ ] **Step 4: Update tests to import from shared module**

Replace the inline function definitions in the test file with imports:

```typescript
// src/lib/__tests__/bookkeepingPopup.test.ts
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
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/lib/__tests__/bookkeepingPopup.test.ts
```

Expected: all 12 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/bookkeepingPopup.ts src/lib/__tests__/bookkeepingPopup.test.ts
git commit -m "feat: add bookkeeping popup trigger logic with tests"
```

---

## Task 5: BookkeepingPopup Component

**Files:**
- Create: `src/components/BookkeepingPopup.tsx`

- [ ] **Step 1: Create the popup component**

```typescript
// src/components/BookkeepingPopup.tsx
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { BOOKKEEPING_BRAND_COLORS } from '@/lib/bookkeepingPopup'

interface BookkeepingPopupProps {
  variant: 'trial' | 'upgrade'
  software: string
  onDismiss: () => void
}

export function BookkeepingPopup({ variant, software, onDismiss }: BookkeepingPopupProps) {
  const navigate = useNavigate()
  const brandColor = BOOKKEEPING_BRAND_COLORS[software] ?? BOOKKEEPING_BRAND_COLORS.Other
  const initial = software.charAt(0).toUpperCase()

  const handleCta = () => {
    if (variant === 'trial') {
      navigate('/settings/bookkeeping')
    } else {
      navigate('/settings/subscription')
    }
    onDismiss()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onDismiss}
    >
      <div
        style={{
          background: '#fff', borderRadius: 20, padding: 24,
          width: '100%', maxWidth: 360,
          border: '1px solid #E5E2DC',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: '#F0EDE8', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X style={{ width: 14, height: 14, color: '#8A8A8A' }} />
          </button>
        </div>

        {/* Icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: variant === 'trial' ? brandColor : '#1F1F21',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          {variant === 'trial' ? (
            <span style={{ color: '#fff', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 18 }}>{initial}</span>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD528" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          )}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 16,
            color: '#1F1F21', letterSpacing: '-0.02em', marginBottom: 6,
          }}>
            {variant === 'trial' ? `Try linking your ${software} account` : 'Upgrade to Pro'}
          </div>
          <div style={{ fontSize: 13, color: '#8A8A8A', lineHeight: 1.5, marginBottom: variant === 'upgrade' ? 6 : 20 }}>
            {variant === 'trial'
              ? 'Auto-sync your invoices and expenses. Takes about 2 minutes to set up.'
              : `Unlock ${software} integration, unlimited projects, and more.`
            }
          </div>

          {variant === 'upgrade' && (
            <div style={{
              textAlign: 'left', margin: '12px 0 20px', padding: '12px 14px',
              background: '#F0EDE8', borderRadius: 12,
            }}>
              {[
                `Auto-sync ${software} invoices`,
                'Unlimited projects',
                'PDF timesheets & exports',
              ].map(feature => (
                <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontSize: 12, color: '#1F1F21' }}>{feature}</span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleCta}
            style={{
              width: '100%', height: 40, borderRadius: 12,
              background: '#FFD528', border: 'none',
              fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, fontSize: 13,
              color: '#1F1F21', cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(255,213,40,0.30)',
              marginBottom: 8,
            }}
          >
            {variant === 'trial' ? `Connect ${software}` : 'Upgrade to Pro'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              width: '100%', height: 36, borderRadius: 12,
              background: 'transparent', border: 'none',
              fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 12,
              color: '#8A8A8A', cursor: 'pointer',
            }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/BookkeepingPopup.tsx
git commit -m "feat(ui): add BookkeepingPopup component with trial and upgrade variants"
```

---

## Task 6: Wire Popup Into Dashboard

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add imports**

Add these imports at the top of `DashboardPage.tsx`:

```typescript
import { BookkeepingPopup } from '@/components/BookkeepingPopup'
import { shouldShowBookkeepingPopup, getPopupVariant } from '@/lib/bookkeepingPopup'
```

- [ ] **Step 2: Expand the user_settings query**

Find the existing `user_settings` select query (around line 121-129):

```typescript
    supabase
      .from('user_settings')
      .select('display_name, department')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
        if (data?.department) setUserDepartment(data.department);
      }, () => {});
```

Replace with:

```typescript
    supabase
      .from('user_settings')
      .select('display_name, department, bookkeeping_software, bookkeeping_popup_dismissed_at')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
        if (data?.department) setUserDepartment(data.department);
        if (data?.bookkeeping_software) setBookkeepingSoftware(data.bookkeeping_software);
        if (data?.bookkeeping_popup_dismissed_at) setBookkeepingDismissedAt(data.bookkeeping_popup_dismissed_at);
      }, () => {});
```

- [ ] **Step 3: Add state variables**

Add these state variables alongside the existing ones (near the other `useState` declarations):

```typescript
  const [bookkeepingSoftware, setBookkeepingSoftware] = useState<string | null>(null);
  const [bookkeepingDismissedAt, setBookkeepingDismissedAt] = useState<string | null>(null);
  const [hasBookkeepingConnection, setHasBookkeepingConnection] = useState(true); // default true = don't show until checked
  const [bookkeepingPopupVisible, setBookkeepingPopupVisible] = useState(false);
```

- [ ] **Step 4: Add bookkeeping connection check effect**

Add a new `useEffect` after the existing user_settings load (after the `useEffect` that calls `loadProjects`):

```typescript
  useEffect(() => {
    if (!user || isImpersonating) return;
    supabase
      .from('bookkeeping_connections')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setHasBookkeepingConnection(!!data);
      });
  }, [user, isImpersonating]);
```

- [ ] **Step 5: Add popup visibility effect**

Add another `useEffect` that computes whether to show the popup:

```typescript
  useEffect(() => {
    if (!subscription || isImpersonating) return;
    const show = shouldShowBookkeepingPopup({
      bookkeepingSoftware,
      hasBookkeepingConnection,
      subscriptionStatus: subscription.status,
      trialEndsAt: subscription.trial_ends_at,
      dismissedAt: bookkeepingDismissedAt,
    });
    setBookkeepingPopupVisible(show);
  }, [bookkeepingSoftware, hasBookkeepingConnection, subscription, bookkeepingDismissedAt, isImpersonating]);
```

- [ ] **Step 6: Add dismiss handler**

Add a dismiss handler function:

```typescript
  const handleBookkeepingDismiss = async () => {
    setBookkeepingPopupVisible(false);
    if (!user) return;
    const now = new Date().toISOString();
    setBookkeepingDismissedAt(now);
    await supabase.from('user_settings').update({
      bookkeeping_popup_dismissed_at: now,
    }).eq('user_id', user.id);
  };
```

- [ ] **Step 7: Render the popup**

In the return JSX, just before the closing `</div>` of the main container (end of the component), add:

```tsx
      {bookkeepingPopupVisible && bookkeepingSoftware && subscription && (
        <BookkeepingPopup
          variant={getPopupVariant({
            subscriptionStatus: subscription.status,
            trialEndsAt: subscription.trial_ends_at,
          })}
          software={bookkeepingSoftware}
          onDismiss={handleBookkeepingDismiss}
        />
      )}
```

- [ ] **Step 8: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 9: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): wire BookkeepingPopup with 7-day dismiss and trial/upgrade variants"
```

---

## Task 7: Build Verification & Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass (existing + new bookkeepingPopup tests)

- [ ] **Step 2: Full production build**

```bash
npm run build 2>&1 | tail -10
```

Expected: build succeeds

- [ ] **Step 3: Deploy the edge function**

```bash
supabase functions deploy admin-stats
```

If Supabase CLI is not set up locally, manually update the edge function via Supabase Dashboard > Edge Functions > admin-stats.

- [ ] **Step 4: Run the migration**

Run in Supabase SQL Editor:

```sql
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS bookkeeping_popup_dismissed_at timestamptz;
```

- [ ] **Step 5: Smoke test admin panel**

1. Open `/admin` > dashboard tab
2. Scroll to bottom -- "Onboarding Insights" section should appear
3. Verify bar charts show data (or empty state if no onboarding data yet)
4. Verify stat cards show numbers

- [ ] **Step 6: Smoke test bookkeeping popup**

1. Sign in as a trial user who selected a bookkeeping tool during onboarding
2. Navigate to `/dashboard`
3. Popup should appear with "Try linking your {software} account"
4. Click "Not now" -- popup dismisses
5. Refresh page -- popup should not reappear (dismissed < 7 days)
6. Verify Pro/lifetime users never see the popup

- [ ] **Step 7: Push**

```bash
git push origin main
```
