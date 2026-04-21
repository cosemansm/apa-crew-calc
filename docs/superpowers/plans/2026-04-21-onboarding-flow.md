# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-step onboarding wizard (country, department, workflow, bookkeeping) that appears after email confirmation, with separate `/signup` and `/login` routes.

**Architecture:** Split the current `LoginPage.tsx` (which has Sign up / Sign in tabs) into two separate pages: `SignUpPage` and `SignInPage`. Add a new `OnboardingPage` with 4-step wizard using local React state. Gate dashboard access via `onboarding_completed` flag on `user_settings`. The onboarding saves selections to existing + new DB columns, then forks to dashboard or new project creation.

**Tech Stack:** React 19, React Router 7, Supabase (auth + DB), Tailwind CSS, Radix UI components, Vitest

**Spec:** `docs/superpowers/specs/2026-04-20-onboarding-flow-design.md`

**Design reference:** `docs/onboarding-mockup.html` (standalone HTML), Claude Design export at `/tmp/crewdock-design/`

---

## File Structure

### New files
- `src/pages/SignUpPage.tsx` -- Sign up form (email + password + confirm), email confirmation screen
- `src/pages/OnboardingPage.tsx` -- 4-step wizard (country, department, workflow, bookkeeping) + welcome modal + fork
- `src/components/onboarding/StepCard.tsx` -- Shared step card wrapper with progress bar
- `src/components/onboarding/PillList.tsx` -- Vertical single-column pill selector
- `src/components/onboarding/PillGrid.tsx` -- Grid pill selector (2-col)
- `src/components/onboarding/DottedBg.tsx` -- Dotted gradient background wrapper
- `src/lib/onboarding.ts` -- Onboarding data constants (countries, calculator tools, bookkeeping options)
- `supabase/migrations/20260421120000_add_onboarding_columns.sql` -- DB migration
- `src/pages/__tests__/onboarding.test.ts` -- Onboarding logic tests

### Modified files
- `src/pages/LoginPage.tsx` -- Strip down to Sign In only (remove register tab, rename to sign-in behaviour)
- `src/App.tsx` -- Add `/signup` route, `/onboarding` route, update `ProtectedRoute` to check `onboarding_completed`
- `src/contexts/AuthContext.tsx` -- Remove department from signUp params, add `onboardingCompleted` state, change email redirect URL
- `src/lib/supabase.ts` -- No changes needed (already exports supabase client)

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260421120000_add_onboarding_columns.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add onboarding tracking columns to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS calculator_tool text,
  ADD COLUMN IF NOT EXISTS bookkeeping_software text;

-- Backfill existing users as onboarded (they skip the wizard)
UPDATE public.user_settings SET onboarding_completed = true WHERE onboarding_completed IS NULL OR onboarding_completed = false;

-- Grant service_role access to new columns (needed for trigger-created rows)
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO service_role;
```

- [ ] **Step 2: Verify migration is syntactically correct**

```bash
cat supabase/migrations/20260421120000_add_onboarding_columns.sql
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260421120000_add_onboarding_columns.sql
git commit -m "feat(db): add onboarding_completed, calculator_tool, bookkeeping_software columns"
```

---

## Task 2: Onboarding Data Constants

**Files:**
- Create: `src/lib/onboarding.ts`

- [ ] **Step 1: Create constants file**

```typescript
export const ONBOARDING_COUNTRIES = [
  { code: 'GB', label: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'IE', label: 'Ireland', flag: '\u{1F1EE}\u{1F1EA}' },
  { code: 'BE', label: 'Belgium', flag: '\u{1F1E7}\u{1F1EA}' },
  { code: 'NL', label: 'Netherlands', flag: '\u{1F1F3}\u{1F1F1}' },
  { code: 'FR', label: 'France', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'OTHER', label: 'Other', flag: '\u{1F30D}' },
] as const

export const CALCULATOR_TOOLS = [
  'Other apps',
  'Google Sheets',
  'My own brain',
  'Pen & paper',
  'Relying on others',
] as const

export const BOOKKEEPING_OPTIONS = [
  'FreeAgent',
  'Xero',
  'QuickBooks',
  'Sage',
  'Wave',
  'Other',
] as const

export type OnboardingCountry = (typeof ONBOARDING_COUNTRIES)[number]['code']
export type CalculatorTool = (typeof CALCULATOR_TOOLS)[number]
export type BookkeepingOption = (typeof BOOKKEEPING_OPTIONS)[number] | "I don't use one"
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/onboarding.ts
git commit -m "feat: add onboarding data constants"
```

---

## Task 3: Onboarding UI Components

**Files:**
- Create: `src/components/onboarding/DottedBg.tsx`
- Create: `src/components/onboarding/PillList.tsx`
- Create: `src/components/onboarding/PillGrid.tsx`
- Create: `src/components/onboarding/StepCard.tsx`

- [ ] **Step 1: Create DottedBg component**

```typescript
// src/components/onboarding/DottedBg.tsx
export function DottedBg({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-start justify-center py-10"
      style={{
        backgroundImage: `radial-gradient(circle, #C9C4B9 1px, transparent 1px), radial-gradient(ellipse at 30% 20%, #FFF9E6 0%, #F5F3EE 50%, #EDE9E0 100%)`,
        backgroundSize: '22px 22px, 100% 100%',
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create PillList component**

```typescript
// src/components/onboarding/PillList.tsx
interface PillListItem {
  value: string
  label: string
  icon?: string
}

interface PillListProps {
  items: PillListItem[]
  selected: string | null
  onSelect: (value: string) => void
}

export function PillList({ items, selected, onSelect }: PillListProps) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const isSel = selected === item.value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className="text-left transition-all"
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              background: isSel ? '#FFF8D6' : '#fff',
              border: isSel ? '2px solid #FFD528' : '1px solid #E5E2DC',
              fontSize: 14,
              fontWeight: isSel ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: isSel ? '0 2px 12px rgba(255,213,40,0.15)' : 'none',
            }}
          >
            {item.icon && <span style={{ fontSize: 20 }}>{item.icon}</span>}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create PillGrid component**

```typescript
// src/components/onboarding/PillGrid.tsx
interface PillGridProps {
  items: string[]
  selected: string | null
  onSelect: (value: string) => void
  columns?: number
}

export function PillGrid({ items, selected, onSelect, columns = 2 }: PillGridProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
      {items.map((item) => {
        const isSel = selected === item
        return (
          <button
            key={item}
            type="button"
            onClick={() => onSelect(item)}
            className="transition-all"
            style={{
              padding: '14px 10px',
              borderRadius: 12,
              background: isSel ? '#FFF8D6' : '#fff',
              border: isSel ? '2px solid #FFD528' : '1px solid #E5E2DC',
              fontSize: 13,
              fontWeight: isSel ? 600 : 400,
              textAlign: 'center',
              boxShadow: isSel ? '0 2px 12px rgba(255,213,40,0.15)' : 'none',
            }}
          >
            {item}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Create StepCard component**

```typescript
// src/components/onboarding/StepCard.tsx
import logoSrc from '@/assets/logo.png'

interface StepCardProps {
  title: string
  subtitle: string
  step: number
  totalSteps: number
  isFinal?: boolean
  onSkip: () => void
  onContinue: () => void
  continueLabel?: string
  children: React.ReactNode
  footer?: React.ReactNode // custom footer replaces default Skip/Continue
}

export function StepCard({
  title,
  subtitle,
  step,
  totalSteps,
  isFinal = false,
  onSkip,
  onContinue,
  continueLabel = 'Continue',
  children,
  footer,
}: StepCardProps) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        padding: 28,
        width: '100%',
        maxWidth: 420,
        border: '1px solid #E5E2DC',
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <img
          src={logoSrc}
          alt="Crew Dock"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            imageRendering: 'pixelated' as const,
            margin: '0 auto 12px',
            display: 'block',
          }}
        />
        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 700,
            fontSize: 18,
            color: '#1F1F21',
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12, color: '#8A8A8A', marginTop: 4 }}>{subtitle}</div>
      </div>

      {children}

      {footer ?? (
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onSkip}
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 12,
              color: '#8A8A8A',
              fontWeight: 500,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
            }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onContinue}
            style={{
              padding: '10px 22px',
              borderRadius: 12,
              background: isFinal ? '#FFD528' : '#1F1F21',
              color: isFinal ? '#1F1F21' : '#fff',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              boxShadow: isFinal ? '0 2px 12px rgba(255,213,40,0.30)' : 'none',
            }}
          >
            {continueLabel}
          </button>
        </div>
      )}

      <div style={{ marginTop: 14, height: 4, borderRadius: 2, background: '#E5E2DC', overflow: 'hidden' }}>
        <div
          style={{
            background: '#FFD528',
            height: '100%',
            width: `${(step / totalSteps) * 100}%`,
            borderRadius: 2,
            transition: 'width 0.2s',
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify build compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors from the new files (or only pre-existing ones)

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/
git commit -m "feat(ui): add onboarding components — DottedBg, PillList, PillGrid, StepCard"
```

---

## Task 4: OnboardingPage

**Files:**
- Create: `src/pages/OnboardingPage.tsx`

- [ ] **Step 1: Create OnboardingPage**

This is the main wizard. It manages local state for the current step and user selections, then persists to DB on completion.

```typescript
// src/pages/OnboardingPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/hooks/usePageTitle'
import { supabase } from '@/lib/supabase'
import { getEngineForCountry } from '@/engines/index'
import { DEPARTMENTS } from '@/data/apa-rates'
import { DottedBg } from '@/components/onboarding/DottedBg'
import { StepCard } from '@/components/onboarding/StepCard'
import { PillList } from '@/components/onboarding/PillList'
import { PillGrid } from '@/components/onboarding/PillGrid'
import { ONBOARDING_COUNTRIES, CALCULATOR_TOOLS, BOOKKEEPING_OPTIONS } from '@/lib/onboarding'
import logoSrc from '@/assets/logo.png'

type Step = 'welcome' | 'country' | 'department' | 'calculator' | 'bookkeeping' | 'fork'

export function OnboardingPage() {
  usePageTitle('Welcome')
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('welcome')
  const [country, setCountry] = useState<string | null>(null)
  const [department, setDepartment] = useState<string | null>(null)
  const [calculatorTool, setCalculatorTool] = useState<string | null>(null)
  const [bookkeeping, setBookkeeping] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const completeOnboarding = async (destination: 'dashboard' | 'new-project') => {
    if (!user) return
    setSaving(true)

    // Save onboarding selections to user_settings
    await supabase.from('user_settings').update({
      department: department || undefined,
      calculator_tool: calculatorTool || undefined,
      bookkeeping_software: bookkeeping || undefined,
      onboarding_completed: true,
    }).eq('user_id', user.id)

    // If country was selected, update engine assignment as verification/override
    if (country && country !== 'OTHER') {
      const engineId = getEngineForCountry(country)
      await supabase.from('profiles').update({
        signup_country: country,
        default_engine: engineId,
        multi_engine_enabled: country !== 'GB',
        authorized_engines: country !== 'GB' ? ['apa-uk', engineId] : ['apa-uk'],
      }).eq('id', user.id)
    }

    setSaving(false)
    navigate(destination === 'dashboard' ? '/dashboard' : '/projects?new=true', { replace: true })
  }

  const advance = (next: Step) => setStep(next)

  if (step === 'welcome') {
    return (
      <DottedBg>
        <div style={{
          background: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: 480,
          border: '1px solid #E5E2DC', boxShadow: '0 2px 16px rgba(0,0,0,0.04)', textAlign: 'center',
        }}>
          <img src={logoSrc} alt="Crew Dock" style={{ width: 64, height: 64, borderRadius: 16, imageRendering: 'pixelated' as const, margin: '0 auto 16px', display: 'block' }} />
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 20, color: '#1F1F21', letterSpacing: '-0.02em', marginBottom: 8 }}>
            Welcome to Crew Dock
          </div>
          <div style={{ fontSize: 14, color: '#8A8A8A', lineHeight: 1.5, marginBottom: 24 }}>
            Let's get you set up. Four quick questions so we can tailor the calculator to you.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
            {['Country', 'Dept', 'Workflow', 'Books'].map((label, i) => (
              <div key={label} style={{ padding: '10px 8px', borderRadius: 12, background: '#F0EDE8', border: '1px solid #E5E2DC' }}>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, fontWeight: 600, color: '#8A8A8A' }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, color: '#1F1F21' }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#8A8A8A', marginBottom: 20 }}>Takes about 60 seconds.</div>
          <button
            type="button"
            onClick={() => advance('country')}
            style={{
              width: '100%', height: 40, borderRadius: 16, background: '#FFD528', border: 'none',
              fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, fontSize: 14, color: '#1F1F21',
              boxShadow: '0 2px 12px rgba(255,213,40,0.30)', cursor: 'pointer',
            }}
          >
            Let's go
          </button>
        </div>
      </DottedBg>
    )
  }

  if (step === 'country') {
    const items = ONBOARDING_COUNTRIES.map(c => ({ value: c.code, label: c.label, icon: c.flag }))
    return (
      <DottedBg>
        <StepCard title="Where are you based?" subtitle="This sets the right rate calculator and currency for you." step={1} totalSteps={4} onSkip={() => advance('department')} onContinue={() => advance('department')}>
          <PillList items={items} selected={country} onSelect={setCountry} />
        </StepCard>
      </DottedBg>
    )
  }

  if (step === 'department') {
    return (
      <DottedBg>
        <StepCard title="What department are you in?" subtitle="You can always change this later." step={2} totalSteps={4} onSkip={() => advance('calculator')} onContinue={() => advance('calculator')}>
          <PillGrid items={[...DEPARTMENTS]} selected={department} onSelect={setDepartment} />
        </StepCard>
      </DottedBg>
    )
  }

  if (step === 'calculator') {
    const items = CALCULATOR_TOOLS.map(t => ({ value: t, label: t }))
    return (
      <DottedBg>
        <StepCard title="How do you calculate rates now?" subtitle="No wrong answers here." step={3} totalSteps={4} onSkip={() => advance('bookkeeping')} onContinue={() => advance('bookkeeping')}>
          <PillList items={items} selected={calculatorTool} onSelect={setCalculatorTool} />
        </StepCard>
      </DottedBg>
    )
  }

  if (step === 'bookkeeping') {
    return (
      <DottedBg>
        <StepCard
          title="Which bookkeeping software do you use?"
          subtitle="We can connect it later -- just a heads-up for now."
          step={4}
          totalSteps={4}
          onSkip={() => advance('fork')}
          onContinue={() => advance('fork')}
          footer={
            <div style={{ marginTop: 20 }}>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 600, color: '#1F1F21', marginBottom: 10, textAlign: 'center' }}>
                What next?
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button type="button" onClick={() => completeOnboarding('dashboard')} disabled={saving}
                  style={{ padding: '14px 12px', borderRadius: 12, border: '1px solid #E5E2DC', background: '#fff', textAlign: 'center', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 600, color: '#1F1F21' }}>
                  Go to dashboard
                </button>
                <button type="button" onClick={() => completeOnboarding('new-project')} disabled={saving}
                  style={{ padding: '14px 12px', borderRadius: 12, background: '#1F1F21', border: 'none', textAlign: 'center', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  Create first project
                </button>
              </div>
            </div>
          }
        >
          <PillGrid items={[...BOOKKEEPING_OPTIONS]} selected={bookkeeping} onSelect={setBookkeeping} />
          <button
            type="button"
            onClick={() => setBookkeeping("I don't use one")}
            className="transition-all"
            style={{
              width: '100%', marginTop: 8, padding: '14px 10px', borderRadius: 12, textAlign: 'center', fontSize: 13,
              background: bookkeeping === "I don't use one" ? '#FFF8D6' : '#fff',
              border: bookkeeping === "I don't use one" ? '2px solid #FFD528' : '1px solid #E5E2DC',
              fontWeight: bookkeeping === "I don't use one" ? 600 : 400,
              boxShadow: bookkeeping === "I don't use one" ? '0 2px 12px rgba(255,213,40,0.15)' : 'none',
              cursor: 'pointer',
            }}
          >
            I don't use one
          </button>
        </StepCard>
      </DottedBg>
    )
  }

  // fork step is handled by the bookkeeping footer buttons
  // If somehow we get here, redirect to dashboard
  return null
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/OnboardingPage.tsx
git commit -m "feat(ui): add OnboardingPage with 4-step wizard and fork"
```

---

## Task 5: SignUpPage (new separate page)

**Files:**
- Create: `src/pages/SignUpPage.tsx`

- [ ] **Step 1: Create SignUpPage**

This is the new standalone sign-up page with the redesigned UI from Claude Design. Email + password + confirm, Google OAuth, lighthouse logo centered.

```typescript
// src/pages/SignUpPage.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { usePageTitle } from '@/hooks/usePageTitle'
import { DottedBg } from '@/components/onboarding/DottedBg'
import logoSrc from '@/assets/logo.png'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export function SignUpPage() {
  usePageTitle('Sign Up')
  const { signUp, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!/\d/.test(password)) { setError('Password must contain at least one number'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error } = await signUp(email, password, '')
    if (error) { setError(error.message) } else { setSuccess(true) }
    setLoading(false)
  }

  const handleGoogle = async () => {
    setLoading(true)
    const { error } = await signInWithGoogle()
    if (error) setError(error.message)
    setLoading(false)
  }

  // Email confirmation screen
  if (success) {
    return (
      <DottedBg>
        <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: 420, border: '1px solid #E5E2DC', boxShadow: '0 2px 16px rgba(0,0,0,0.04)', textAlign: 'center' }}>
          <img src={logoSrc} alt="Crew Dock" style={{ width: 48, height: 48, borderRadius: 14, imageRendering: 'pixelated' as const, margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 18, color: '#1F1F21', letterSpacing: '-0.02em', marginBottom: 10 }}>Confirm your email</div>
          <div style={{ fontSize: 14, color: '#8A8A8A', lineHeight: 1.6, marginBottom: 24 }}>
            We sent a confirmation link to your inbox.<br />Click it to verify your email and finish setting up your account.
          </div>
          <div style={{ background: '#F0EDE8', borderRadius: 12, padding: '16px 18px', fontSize: 13, color: '#8A8A8A', lineHeight: 1.5, marginBottom: 28, textAlign: 'left' }}>
            Can't find it? Check spam, or wait a minute -- mail servers can be slow.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button type="button" onClick={handleSubmit} disabled={loading}
              style={{ height: 44, borderRadius: 16, background: '#FFD528', border: 'none', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, fontSize: 14, color: '#1F1F21', boxShadow: '0 2px 12px rgba(255,213,40,0.30)', cursor: 'pointer' }}>
              Resend link
            </button>
            <button type="button" onClick={() => setSuccess(false)}
              style={{ height: 44, borderRadius: 16, background: '#F0EDE8', border: '1px solid #E5E2DC', fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 14, color: '#2D2D3A', cursor: 'pointer' }}>
              Use a different email
            </button>
          </div>
        </div>
      </DottedBg>
    )
  }

  // Sign up form
  return (
    <DottedBg>
      <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: 420, border: '1px solid #E5E2DC', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src={logoSrc} alt="Crew Dock" style={{ width: 48, height: 48, borderRadius: 14, imageRendering: 'pixelated' as const, margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 16, color: '#1F1F21', letterSpacing: '-0.02em', marginBottom: 16 }}>Crew Dock</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{ background: '#F0EDE8', borderRadius: 999, padding: 4, display: 'flex' }}>
              <div style={{ height: 36, padding: '0 20px', borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 600, color: '#1F1F21' }}>Sign up</div>
              <Link to="/login" style={{ height: 36, padding: '0 20px', borderRadius: 999, display: 'flex', alignItems: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 500, color: '#8A8A8A', textDecoration: 'none' }}>Sign in</Link>
            </div>
          </div>
        </div>

        {error && <div style={{ background: '#FEE', border: '1px solid #D45B5B', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#D45B5B', marginBottom: 14 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 13, color: '#1F1F21', marginBottom: 6, display: 'block' }}>Work email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
              style={{ width: '100%', height: 44, borderRadius: 16, background: '#fff', border: '1px solid #E5E2DC', padding: '0 12px', fontSize: 14, color: '#1F1F21', outline: 'none' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 13, color: '#1F1F21', marginBottom: 6, display: 'block' }}>Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', height: 44, borderRadius: 16, background: '#fff', border: '1px solid #E5E2DC', padding: '0 12px', fontSize: 14, color: '#1F1F21', outline: 'none' }} />
            <div style={{ fontSize: 11, color: '#8A8A8A', marginTop: 4 }}>At least 8 characters, one number.</div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 13, color: '#1F1F21', marginBottom: 6, display: 'block' }}>Confirm password</label>
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
              style={{ width: '100%', height: 44, borderRadius: 16, background: '#fff', border: '1px solid #E5E2DC', padding: '0 12px', fontSize: 14, color: '#1F1F21', outline: 'none' }} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', height: 40, borderRadius: 16, background: '#FFD528', border: 'none', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, fontSize: 14, color: '#1F1F21', boxShadow: '0 2px 12px rgba(255,213,40,0.30)', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: '#E5E2DC' }} />
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#8A8A8A', letterSpacing: '0.08em', fontWeight: 500 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: '#E5E2DC' }} />
        </div>

        <button type="button" onClick={handleGoogle} disabled={loading}
          style={{ width: '100%', height: 40, borderRadius: 16, background: 'transparent', border: '1px solid #E5E2DC', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 14, color: '#1F1F21', cursor: 'pointer' }}>
          <GoogleIcon /> Continue with Google
        </button>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#8A8A8A', lineHeight: 1.5 }}>
          By continuing you accept the <Link to="/terms" style={{ textDecoration: 'underline', color: 'inherit' }}>Terms</Link> and <Link to="/privacy" style={{ textDecoration: 'underline', color: 'inherit' }}>Privacy Policy</Link>.<br />
          Already have an account? <Link to="/login" style={{ fontWeight: 600, color: '#1F1F21', textDecoration: 'underline' }}>Sign in</Link>
        </div>
      </div>
    </DottedBg>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/SignUpPage.tsx
git commit -m "feat(ui): add standalone SignUpPage with email confirmation screen"
```

---

## Task 6: Modify LoginPage to Sign-In Only

**Files:**
- Modify: `src/pages/LoginPage.tsx`

- [ ] **Step 1: Strip LoginPage down to sign-in only**

Remove the register tab, department dropdown, and registration form. Keep the sign-in form and forgot password flow. Add the same visual style (DottedBg, pill tabs linking to `/signup`). Keep the `GoogleIcon` component and Google OAuth button.

Key changes:
- Remove all `reg*` state variables (`regName`, `regEmail`, `regPassword`, `regConfirm`, `regDepartment`)
- Remove `handleRegister` function
- Remove the `<TabsContent value="register">` block
- Remove the `DEPARTMENTS` import
- Replace the Tabs component with the new pill tab design (Sign up links to `/signup`, Sign in is active)
- Apply the same DottedBg + card styling as SignUpPage
- Keep `handleLogin`, `handleForgotPassword`, Google auth
- Update "Don't have an account?" footer link to point to `/signup`

The implementer should read the current `LoginPage.tsx` fully before editing. The sign-in card should match the visual style of `SignUpPage` (same border-radius, shadows, DottedBg background, lighthouse logo centered at top, JetBrains Mono labels).

- [ ] **Step 2: Verify the sign-in form still works locally**

```bash
npm run dev
```

Open `http://localhost:5173/login` and verify:
- Logo displays centered
- Sign up / Sign in pill tabs present (Sign in active, Sign up links to `/signup`)
- Email + password fields work
- "Forgot password?" flow works
- Google sign-in button works
- Error messages display correctly

- [ ] **Step 3: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "refactor(ui): strip LoginPage to sign-in only, match new design system"
```

---

## Task 7: Update AuthContext

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Update signUp to remove department parameter**

Change the `signUp` function signature from:
```typescript
signUp: (email: string, password: string, fullName: string, department?: string) => Promise<{ error: Error | null }>;
```
to:
```typescript
signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
```

In the implementation, remove `department` from `options.data`:
```typescript
options: {
  data: { full_name: fullName },
  emailRedirectTo: `${window.location.origin}/onboarding`,
},
```

Note the `emailRedirectTo` change: from `https://app.crewdock.app/dashboard` to `${window.location.origin}/onboarding` so the email confirmation link lands on the onboarding wizard.

- [ ] **Step 2: Add onboardingCompleted to AuthContext**

Add to the interface:
```typescript
onboardingCompleted: boolean | null; // null = loading
```

Add state:
```typescript
const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
```

In the `onAuthStateChange` handler, after the `SIGNED_IN` event upsert, fetch `onboarding_completed`:
```typescript
if (_event === 'SIGNED_IN' && session) {
  // existing full_name upsert code...

  // Fetch onboarding status
  supabase.from('user_settings')
    .select('onboarding_completed')
    .eq('user_id', session.user.id)
    .maybeSingle()
    .then(({ data }) => {
      setOnboardingCompleted(data?.onboarding_completed ?? false)
    })
    .catch(() => setOnboardingCompleted(false))
}
```

When user signs out, reset:
```typescript
setOnboardingCompleted(null)
```

- [ ] **Step 3: Update signInWithGoogle redirect**

Change the `redirectTo` in `signInWithGoogle`:
```typescript
redirectTo: `${window.location.origin}/onboarding`,
```

This way Google OAuth users also land on onboarding. The `ProtectedRoute` will check `onboardingCompleted` and either show onboarding or redirect to dashboard.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat(auth): remove department from signUp, add onboardingCompleted state, redirect to /onboarding"
```

---

## Task 8: Update App.tsx Routing

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add new routes and update ProtectedRoute**

Add lazy imports:
```typescript
const SignUpPage = lazy(() => import('@/pages/SignUpPage').then(m => ({ default: m.SignUpPage })));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
```

Update `ProtectedRoute` to check onboarding status:
```typescript
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  if (loading || onboardingCompleted === null) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
```

Add a new route guard for onboarding (authenticated but NOT onboarded):
```typescript
function OnboardingRoute({ children }: { children: ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  if (loading || onboardingCompleted === null) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (onboardingCompleted) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
```

Update `PublicRoute` to handle signup vs login redirect:
```typescript
function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (user && !onboardingCompleted) return <Navigate to="/onboarding" replace />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
```

Add routes:
```typescript
<Route path="/signup" element={<PublicRoute><SignUpPage /></PublicRoute>} />
<Route path="/onboarding" element={<OnboardingRoute><OnboardingPage /></OnboardingRoute>} />
```

- [ ] **Step 2: Verify routing works**

```bash
npm run dev
```

Test these paths:
- `/signup` -- shows sign up page (or redirects to `/onboarding` if logged in but not onboarded)
- `/login` -- shows sign in page (or redirects to `/dashboard` if fully onboarded)
- `/onboarding` -- shows wizard (or redirects to `/login` if not authenticated)
- `/dashboard` -- redirects to `/onboarding` if not onboarded

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(routes): add /signup and /onboarding routes with onboarding gate"
```

---

## Task 9: Tests

**Files:**
- Create: `src/pages/__tests__/onboarding.test.ts`

- [ ] **Step 1: Write tests for onboarding constants and data**

```typescript
// src/pages/__tests__/onboarding.test.ts
import { describe, it, expect } from 'vitest'
import { ONBOARDING_COUNTRIES, CALCULATOR_TOOLS, BOOKKEEPING_OPTIONS } from '@/lib/onboarding'
import { DEPARTMENTS } from '@/data/apa-rates'

describe('Onboarding constants', () => {
  it('has 6 country options including Other', () => {
    expect(ONBOARDING_COUNTRIES).toHaveLength(6)
    expect(ONBOARDING_COUNTRIES.map(c => c.code)).toContain('OTHER')
    expect(ONBOARDING_COUNTRIES.map(c => c.code)).toContain('GB')
    expect(ONBOARDING_COUNTRIES.map(c => c.code)).toContain('BE')
  })

  it('has 5 calculator tool options', () => {
    expect(CALCULATOR_TOOLS).toHaveLength(5)
    expect(CALCULATOR_TOOLS).toContain('Google Sheets')
    expect(CALCULATOR_TOOLS).toContain('Pen & paper')
  })

  it('has 6 bookkeeping options (excluding "I don\'t use one")', () => {
    expect(BOOKKEEPING_OPTIONS).toHaveLength(6)
    expect(BOOKKEEPING_OPTIONS).toContain('Xero')
    expect(BOOKKEEPING_OPTIONS).toContain('FreeAgent')
  })

  it('DEPARTMENTS has at least 10 entries from engine', () => {
    expect(DEPARTMENTS.length).toBeGreaterThanOrEqual(10)
    expect(DEPARTMENTS).toContain('Camera')
    expect(DEPARTMENTS).toContain('Lighting')
    expect(DEPARTMENTS).toContain('Sound')
  })

  it('country codes map to valid engines', async () => {
    const { getEngineForCountry } = await import('@/engines/index')
    expect(getEngineForCountry('BE')).toBe('sdym-be')
    expect(getEngineForCountry('GB')).toBe('apa-uk')
    expect(getEngineForCountry('FR')).toBe('apa-uk') // no FR engine yet, falls back
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all tests pass (both new and existing)

- [ ] **Step 3: Commit**

```bash
git add src/pages/__tests__/onboarding.test.ts
git commit -m "test: add onboarding constants and engine mapping tests"
```

---

## Task 10: Build Verification & Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Full build check**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds with no errors

- [ ] **Step 2: Run full test suite**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Test the complete flow:
1. Open `http://localhost:5173/signup` -- sign up form renders with lighthouse logo, pill tabs, fields
2. Open `http://localhost:5173/login` -- sign in form renders, "Sign up" tab links to `/signup`
3. Create a test account on `/signup` -- should show "Confirm your email" screen
4. If using existing account: `/login` -> sign in -> should redirect to `/dashboard` (existing users have `onboarding_completed = true`)
5. For new users: after email confirmation click -> lands on `/onboarding` -> welcome modal -> 4 steps -> fork

- [ ] **Step 4: Verify no regressions**

Check that existing sign-in flow (email + password) still works:
- Login with existing credentials at `/login`
- Google OAuth still works
- Forgot password flow still works
- Dashboard, calculator, projects, settings all load correctly after login

- [ ] **Step 5: Final commit and push**

```bash
git add -A
git status
git push origin main
```

Verify Vercel deployment succeeds.
