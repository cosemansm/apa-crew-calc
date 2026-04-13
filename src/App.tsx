import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { EngineProvider } from '@/contexts/EngineContext';
import { AppLayout } from '@/components/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CalculatorPage } from '@/pages/CalculatorPage';
import { AIInputPage } from '@/pages/AIInputPage';
import { InvoicePage } from '@/pages/InvoicePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { SupportPage } from '@/pages/SupportPage';
import { AdminPage } from '@/pages/AdminPage';
import { SharePage } from '@/pages/SharePage';
import { ReviewPopupController } from '@/components/ReviewPopupController';
import { TermsPage } from '@/pages/TermsPage';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { UpdatePasswordPage } from '@/pages/UpdatePasswordPage';
import type { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
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
          <EngineProvider>
            <SubscriptionProvider>
              <PendingShareRedirect />
              <Routes>
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/share/:token" element={<SharePage />} />
                <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
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
              <ReviewPopupController />
            </SubscriptionProvider>
          </EngineProvider>
        </AuthProvider>
      </BrowserRouter>
      <Analytics />
    </>
  );
}
