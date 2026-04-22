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

// Lazy-loaded pages — split into separate chunks
const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const CalculatorPage = lazy(() => import('@/pages/CalculatorPage').then(m => ({ default: m.CalculatorPage })));
const AIInputPage = lazy(() => import('@/pages/AIInputPage').then(m => ({ default: m.AIInputPage })));
const InvoicePage = lazy(() => import('@/pages/InvoicePage').then(m => ({ default: m.InvoicePage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const SupportPage = lazy(() => import('@/pages/SupportPage').then(m => ({ default: m.SupportPage })));
const AdminPage = lazy(() => import('@/pages/AdminPage').then(m => ({ default: m.AdminPage })));
const SharePage = lazy(() => import('@/pages/SharePage').then(m => ({ default: m.SharePage })));
const TermsPage = lazy(() => import('@/pages/TermsPage').then(m => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const UpdatePasswordPage = lazy(() => import('@/pages/UpdatePasswordPage').then(m => ({ default: m.UpdatePasswordPage })));
const SignUpPage = lazy(() => import('@/pages/SignUpPage').then(m => ({ default: m.SignUpPage })));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })));

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (onboardingCompleted === null || !onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
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
