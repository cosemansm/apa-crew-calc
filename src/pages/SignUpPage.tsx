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
              style={{ width: '100%', height: 44, borderRadius: 16, background: '#fff', border: '1px solid #E5E2DC', padding: '0 12px', fontSize: 14, color: '#1F1F21', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 13, color: '#1F1F21', marginBottom: 6, display: 'block' }}>Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', height: 44, borderRadius: 16, background: '#fff', border: '1px solid #E5E2DC', padding: '0 12px', fontSize: 14, color: '#1F1F21', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ fontSize: 11, color: '#8A8A8A', marginTop: 4 }}>At least 8 characters, one number.</div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSize: 13, color: '#1F1F21', marginBottom: 6, display: 'block' }}>Confirm password</label>
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
              style={{ width: '100%', height: 44, borderRadius: 16, background: '#fff', border: '1px solid #E5E2DC', padding: '0 12px', fontSize: 14, color: '#1F1F21', outline: 'none', boxSizing: 'border-box' }} />
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
