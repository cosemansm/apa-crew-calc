import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import logoSrc from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

export function UpdatePasswordPage() {
  usePageTitle('Set New Password');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Sign out so the user logs in fresh with their new password
    await supabase.auth.signOut();
    setSuccess(true);
    setLoading(false);

    setTimeout(() => navigate('/login', { replace: true }), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#1F1F21] p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src={logoSrc} alt="Crew Dock" className="h-12 w-auto" />
        </div>

        <Card>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Set new password</CardTitle>
              <CardDescription>Choose a new password for your account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div role="alert" className="p-3 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>
              )}
              {success ? (
                <div role="status" className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
                  Password updated — redirecting to sign in…
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}
            </CardContent>
            {!success && (
              <CardFooter>
                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? 'Updating…' : 'Update password'}
                </Button>
              </CardFooter>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
