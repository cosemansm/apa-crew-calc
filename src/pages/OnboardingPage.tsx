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

    await supabase.from('user_settings').update({
      department: department || undefined,
      calculator_tool: calculatorTool || undefined,
      bookkeeping_software: bookkeeping || undefined,
      onboarding_completed: true,
    }).eq('user_id', user.id)

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
  return null
}
