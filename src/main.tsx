import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './engines/apa-uk'   // registers APA UK engine
import './index.css'
import App from './App'

Sentry.init({
  dsn: 'https://a329400d299c6e7f89458d7a231f99d5@o4511186084167680.ingest.de.sentry.io/4511186095898704',
  enabled: import.meta.env.PROD,
  sendDefaultPii: false,
})

function ErrorFallback({ eventId }: { eventId: string | null }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at 30% 20%, #FFF9E6 0%, #F5F3EE 50%, #EDE9E0 100%)',
      fontFamily: '"JetBrains Mono", monospace',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1F1F21', marginBottom: '0.5rem' }}>
        Something went wrong
      </h1>
      <p style={{ color: '#8A8A8A', marginBottom: '1.5rem', maxWidth: '360px', lineHeight: 1.6 }}>
        An unexpected error occurred. Our team has been notified automatically.
      </p>
      {eventId && (
        <p style={{ fontSize: '0.75rem', color: '#8A8A8A', marginBottom: '1.5rem' }}>
          Error ID: <code style={{ background: '#E8E5DF', padding: '2px 6px', borderRadius: '4px' }}>{eventId}</code>
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {eventId && (
          <button
            onClick={() => Sentry.showReportDialog({ eventId })}
            style={{
              background: '#FFD528', color: '#1F1F21', border: 'none',
              padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Send feedback
          </button>
        )}
        <button
          onClick={() => window.location.href = '/dashboard'}
          style={{
            background: 'transparent', color: '#1F1F21', border: '1.5px solid #1F1F21',
            padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ eventId }) => <ErrorFallback eventId={eventId} />}
      showDialog
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
