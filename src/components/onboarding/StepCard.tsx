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
  footer?: React.ReactNode
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
