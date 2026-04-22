import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { BOOKKEEPING_BRAND_COLORS } from '@/lib/bookkeepingPopup'
import freeagentLogo from '@/assets/integrations/freeagent.svg'
import xeroLogo from '@/assets/integrations/xero.svg'
import quickbooksLogo from '@/assets/integrations/quickbooks.svg'

const BOOKKEEPING_LOGOS: Record<string, string> = {
  FreeAgent: freeagentLogo,
  Xero: xeroLogo,
  QuickBooks: quickbooksLogo,
}

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
          background: variant === 'trial'
            ? (BOOKKEEPING_LOGOS[software] ? '#fff' : brandColor)
            : '#1F1F21',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          border: variant === 'trial' && BOOKKEEPING_LOGOS[software] ? '1px solid #E5E2DC' : 'none',
        }}>
          {variant === 'trial' ? (
            BOOKKEEPING_LOGOS[software]
              ? <img src={BOOKKEEPING_LOGOS[software]} alt={software} style={{ width: 32, height: 32, objectFit: 'contain' }} />
              : <span style={{ color: '#fff', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 18 }}>{initial}</span>
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
