import { useState, useEffect, useRef } from 'react'
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
import { useEngine } from '@/hooks/useEngine'
import logoSrc from '@/assets/logo.png'

type Step = 'welcome' | 'country' | 'department' | 'calculator' | 'bookkeeping' | 'fork'

export function OnboardingPage() {
  usePageTitle('Welcome')
  const navigate = useNavigate()
  const { user, setOnboardingCompleted } = useAuth()
  const { defaultEngineId } = useEngine()
  const [step, setStep] = useState<Step>('welcome')
  const [country, setCountry] = useState<string | null>(null)
  const [department, setDepartment] = useState<string | null>(null)
  const [calculatorTool, setCalculatorTool] = useState<string | null>(null)
  const [bookkeeping, setBookkeeping] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [jobName, setJobName] = useState('')
  const [clientName, setClientName] = useState('')
  const [showCreateJob, setShowCreateJob] = useState(false)
  const markedComplete = useRef(false)

  // Persist onboarding as completed in the DB on first visit so re-logins skip it.
  // Don't update in-memory state here — that would cause OnboardingRoute to
  // redirect to /dashboard before the user finishes the questionnaire.
  useEffect(() => {
    if (!user || markedComplete.current) return
    markedComplete.current = true
    supabase.from('user_settings').upsert({
      user_id: user.id,
      onboarding_completed: true,
    }, { onConflict: 'user_id' })
  }, [user])

  const saveOnboardingData = async () => {
    if (!user) return

    await supabase.from('user_settings').upsert({
      user_id: user.id,
      department: department || undefined,
      calculator_tool: calculatorTool || undefined,
      bookkeeping_software: bookkeeping || undefined,
      onboarding_completed: true,
    }, { onConflict: 'user_id' })

    if (country && country !== 'OTHER') {
      const engineId = getEngineForCountry(country)
      await supabase.from('profiles').update({
        signup_country: country,
        default_engine: engineId,
        multi_engine_enabled: country !== 'GB',
        authorized_engines: country !== 'GB' ? ['apa-uk', engineId] : ['apa-uk'],
      }).eq('id', user.id)
    }

    setOnboardingCompleted(true)
  }

  const goToDashboard = async () => {
    setSaving(true)
    await saveOnboardingData()
    setSaving(false)
    navigate('/dashboard', { replace: true })
  }

  const createFirstProject = async () => {
    if (!user || !jobName.trim()) return
    setSaving(true)
    await saveOnboardingData()

    const { data } = await supabase.from('projects').insert({
      user_id: user.id,
      name: jobName.trim(),
      client_name: clientName.trim() || null,
      calc_engine: defaultEngineId,
    }).select().single()

    setSaving(false)
    if (data) {
      navigate(`/calculator?project=${data.id}&name=${encodeURIComponent(data.name)}`, { replace: true })
    } else {
      navigate('/dashboard', { replace: true })
    }
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
            Let's get you set up. A few quick questions so we can tailor the calculator to you.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 20 }}>
            {['Country', 'Dept', 'Workflow', 'Books', 'Start'].map((label, i) => (
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
        <StepCard title="Where are you based?" subtitle="This sets the right rate calculator and currency for you." step={1} totalSteps={5} onSkip={() => advance('department')} onContinue={() => advance('department')}>
          <PillList items={items} selected={country} onSelect={setCountry} />
        </StepCard>
      </DottedBg>
    )
  }

  if (step === 'department') {
    return (
      <DottedBg>
        <StepCard title="What department are you in?" subtitle="You can always change this later." step={2} totalSteps={5} onSkip={() => advance('calculator')} onContinue={() => advance('calculator')}>
          <PillGrid items={[...DEPARTMENTS]} selected={department} onSelect={setDepartment} />
        </StepCard>
      </DottedBg>
    )
  }

  if (step === 'calculator') {
    const items = CALCULATOR_TOOLS.map(t => ({ value: t, label: t }))
    return (
      <DottedBg>
        <StepCard title="How do you calculate rates now?" subtitle="No wrong answers here." step={3} totalSteps={5} onSkip={() => advance('bookkeeping')} onContinue={() => advance('bookkeeping')}>
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
          totalSteps={5}
          onSkip={() => advance('fork')}
          onContinue={() => advance('fork')}
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

  // Fork step — "What next?"
  return (
    <DottedBg>
      <StepCard
        title="You're all set!"
        subtitle="What would you like to do first?"
        step={5}
        totalSteps={5}
        onSkip={() => goToDashboard()}
        onContinue={() => goToDashboard()}
        footer={
          <div style={{ marginTop: 20 }}>
            {!showCreateJob ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button type="button" onClick={goToDashboard} disabled={saving}
                  style={{ padding: '14px 12px', borderRadius: 12, border: '1px solid #E5E2DC', background: '#fff', textAlign: 'center', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 600, color: '#1F1F21', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving...' : 'Go to dashboard'}
                </button>
                <button type="button" onClick={() => setShowCreateJob(true)} disabled={saving}
                  style={{ padding: '14px 12px', borderRadius: 12, background: '#1F1F21', border: 'none', textAlign: 'center', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  Create first project
                </button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 12, color: '#1F1F21', marginBottom: 4, display: 'block' }}>Job name</label>
                  <input
                    type="text"
                    value={jobName}
                    onChange={e => setJobName(e.target.value)}
                    placeholder="e.g. Nike Summer Campaign"
                    autoFocus
                    style={{ width: '100%', height: 40, borderRadius: 12, background: '#fff', border: '1px solid #E5E2DC', padding: '0 12px', fontSize: 13, color: '#1F1F21', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 12, color: '#1F1F21', marginBottom: 4, display: 'block' }}>Client (optional)</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="e.g. Nike UK"
                    style={{ width: '100%', height: 40, borderRadius: 12, background: '#fff', border: '1px solid #E5E2DC', padding: '0 12px', fontSize: 13, color: '#1F1F21', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button type="button" onClick={() => setShowCreateJob(false)}
                    style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #E5E2DC', background: '#fff', textAlign: 'center', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 500, color: '#8A8A8A' }}>
                    Back
                  </button>
                  <button type="button" onClick={createFirstProject} disabled={saving || !jobName.trim()}
                    style={{ padding: '10px 12px', borderRadius: 12, background: '#FFD528', border: 'none', textAlign: 'center', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 600, color: '#1F1F21', boxShadow: '0 2px 12px rgba(255,213,40,0.30)', opacity: saving || !jobName.trim() ? 0.6 : 1 }}>
                    {saving ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            )}
          </div>
        }
      >
        <div style={{ fontSize: 13, color: '#8A8A8A', lineHeight: 1.6, textAlign: 'center' }}>
          Jump straight into a project, or explore the dashboard first.
        </div>
      </StepCard>
    </DottedBg>
  )
}
