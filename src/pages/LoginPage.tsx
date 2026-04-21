import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { DottedBg } from '@/components/onboarding/DottedBg';
import logoSrc from '@/assets/logo.png';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

export function LoginPage() {
  usePageTitle('Sign In');
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sign-in form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot password
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) {
      setError(error.message);
    } else {
      navigate('/dashboard');
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: 'https://app.crewdock.app/update-password',
    });
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Password reset email sent — check your inbox');
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) setError(error.message);
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 44,
    borderRadius: 16,
    background: '#fff',
    border: '1px solid #E5E2DC',
    padding: '0 12px',
    fontSize: 14,
    color: '#1F1F21',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 500,
    fontSize: 13,
    color: '#1F1F21',
    marginBottom: 6,
    display: 'block',
  };

  if (showForgotPassword) {
    return (
      <DottedBg>
        <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: 420, border: '1px solid #E5E2DC', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <img src={logoSrc} alt="Crew Dock" style={{ width: 48, height: 48, borderRadius: 14, imageRendering: 'pixelated' as const, margin: '0 auto 8px', display: 'block' }} />
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 16, color: '#1F1F21', letterSpacing: '-0.02em' }}>Crew Dock</div>
          </div>

          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, fontSize: 15, color: '#1F1F21', marginBottom: 6 }}>Reset password</div>
          <div style={{ fontSize: 13, color: '#8A8A8A', marginBottom: 16 }}>Enter your email and we'll send you a reset link.</div>

          {error && <div style={{ background: '#FEE', border: '1px solid #D45B5B', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#D45B5B', marginBottom: 14 }}>{error}</div>}
          {success && <div style={{ background: '#EDFBE8', border: '1px solid #4CAF50', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#2E7D32', marginBottom: 14 }}>{success}</div>}

          {!success && (
            <form onSubmit={handleForgotPassword}>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Email</label>
                <input type="email" required value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} />
              </div>
              <button type="submit" disabled={loading}
                style={{ width: '100%', height: 40, borderRadius: 16, background: '#FFD528', border: 'none', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, fontSize: 14, color: '#1F1F21', boxShadow: '0 2px 12px rgba(255,213,40,0.30)', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Sending...' : 'Send reset email'}
              </button>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button type="button" onClick={() => { setShowForgotPassword(false); setError(null); setSuccess(null); }}
              style={{ background: 'none', border: 'none', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: '#8A8A8A', cursor: 'pointer', textDecoration: 'underline' }}>
              Back to sign in
            </button>
          </div>
        </div>
      </DottedBg>
    );
  }

  return (
    <DottedBg>
      <div style={{ background: '#fff', borderRadius: 24, padding: 32, width: '100%', maxWidth: 420, border: '1px solid #E5E2DC', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src={logoSrc} alt="Crew Dock" style={{ width: 48, height: 48, borderRadius: 14, imageRendering: 'pixelated' as const, margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, fontSize: 16, color: '#1F1F21', letterSpacing: '-0.02em', marginBottom: 16 }}>Crew Dock</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{ background: '#F0EDE8', borderRadius: 999, padding: 4, display: 'flex' }}>
              <Link to="/signup" style={{ height: 36, padding: '0 20px', borderRadius: 999, display: 'flex', alignItems: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 500, color: '#8A8A8A', textDecoration: 'none' }}>Sign up</Link>
              <div style={{ height: 36, padding: '0 20px', borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 600, color: '#1F1F21' }}>Sign in</div>
            </div>
          </div>
        </div>

        {error && <div style={{ background: '#FEE', border: '1px solid #D45B5B', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#D45B5B', marginBottom: 14 }}>{error}</div>}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>Password</label>
            <input type="password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 18, textAlign: 'right' }}>
            <button type="button" onClick={() => { setShowForgotPassword(true); setError(null); setSuccess(null); }}
              style={{ background: 'none', border: 'none', fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#8A8A8A', cursor: 'pointer', textDecoration: 'underline' }}>
              Forgot password?
            </button>
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', height: 40, borderRadius: 16, background: '#FFD528', border: 'none', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, fontSize: 14, color: '#1F1F21', boxShadow: '0 2px 12px rgba(255,213,40,0.30)', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Signing in...' : 'Sign in'}
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
          Don't have an account?{' '}
          <Link to="/signup" style={{ fontWeight: 600, color: '#1F1F21', textDecoration: 'underline' }}>Sign up</Link>
        </div>
      </div>
    </DottedBg>
  );
}
