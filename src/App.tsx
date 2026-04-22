import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { EngineProvider } from '@/contexts/EngineContext';
import { ImpersonationProvider } from '@/contexts/ImpersonationContext';
import { AppLayout } from '@/components/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReviewPopupController } from '@/components/ReviewPopupController';
import type { ReactNode } from 'react';

// Retry dynamic imports once with a full page reload to handle stale chunks after deploy
function lazyWithReload(
  factory: () => Promise<Record<string, unknown>>,
  pick: string,
) {
  return lazy(() =>
    factory()
      .then(m => {
        sessionStorage.removeItem('chunk-reload');
        return { default: m[pick] as React.ComponentType };
      })
      .catch(() => {
        const key = 'chunk-reload';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.location.reload();
        }
        return new Promise<{ default: React.ComponentType }>(() => {});
      }),
  );
}

// Lazy-loaded pages — split into separate chunks
const LoginPage = lazyWithReload(() => import('@/pages/LoginPage'), 'LoginPage');
const CalculatorPage = lazyWithReload(() => import('@/pages/CalculatorPage'), 'CalculatorPage');
const AIInputPage = lazyWithReload(() => import('@/pages/AIInputPage'), 'AIInputPage');
const InvoicePage = lazyWithReload(() => import('@/pages/InvoicePage'), 'InvoicePage');
const SettingsPage = lazyWithReload(() => import('@/pages/SettingsPage'), 'SettingsPage');
const ProjectsPage = lazyWithReload(() => import('@/pages/ProjectsPage'), 'ProjectsPage');
const SupportPage = lazyWithReload(() => import('@/pages/SupportPage'), 'SupportPage');
const AdminPage = lazyWithReload(() => import('@/pages/AdminPage'), 'AdminPage');
const SharePage = lazyWithReload(() => import('@/pages/SharePage'), 'SharePage');
const TermsPage = lazyWithReload(() => import('@/pages/TermsPage'), 'TermsPage');
const PrivacyPage = lazyWithReload(() => import('@/pages/PrivacyPage'), 'PrivacyPage');
const UpdatePasswordPage = lazyWithReload(() => import('@/pages/UpdatePasswordPage'), 'UpdatePasswordPage');
const SignUpPage = lazyWithReload(() => import('@/pages/SignUpPage'), 'SignUpPage');
const OnboardingPage = lazyWithReload(() => import('@/pages/OnboardingPage'), 'OnboardingPage');

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (onboardingCompleted === null) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (user && onboardingCompleted === null) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (user && !onboardingCompleted) return <Navigate to="/onboarding" replace />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function OnboardingRoute({ children }: { children: ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (onboardingCompleted) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// After login (email or Google OAuth), redirect to any pending share link.
function PendingShareRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      const pending = sessionStorage.getItem('pendingShareRedirect');
      if (pending) {
        sessionStorage.removeItem('pendingShareRedirect');
        navigate(pending, { replace: true });
      }
    }
  }, [user, navigate]);

  return null;
}

export default function App() {
  return (
    <>
      <BrowserRouter>
        <AuthProvider>
          <ImpersonationProvider>
            <EngineProvider>
              <SubscriptionProvider>
                <PendingShareRedirect />
                <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
                <Routes>
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/share/:token" element={<SharePage />} />
                  <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                  <Route path="/signup" element={<PublicRoute><SignUpPage /></PublicRoute>} />
                  <Route path="/onboarding" element={<OnboardingRoute><OnboardingPage /></OnboardingRoute>} />
                  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/calculator" element={<CalculatorPage />} />
                    <Route path="/projects" element={<ProjectsPage />} />
                    <Route path="/ai-input" element={<AIInputPage />} />
                    <Route path="/history" element={<Navigate to="/projects" replace />} />
                    <Route path="/invoices" element={<InvoicePage />} />
                    <Route path="/support/:section?" element={<SupportPage />} />
                    <Route path="/settings/:section?" element={<SettingsPage />} />
                    <Route path="/admin/:tab?" element={<AdminPage />} />
                  </Route>
                  <Route path="/update-password" element={<UpdatePasswordPage />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
                </Suspense>
                <ReviewPopupController />
              </SubscriptionProvider>
            </EngineProvider>
          </ImpersonationProvider>
        </AuthProvider>
      </BrowserRouter>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
