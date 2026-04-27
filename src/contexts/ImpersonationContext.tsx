import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// ── Types ──

interface ImpersonatedSubscription {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  trial_extended: boolean;
}

interface ImpersonatedProfile {
  signup_country: string | null;
  default_engine: string | null;
  multi_engine_enabled: boolean;
  authorized_engines: string[];
}

interface ImpersonatedProjectDay {
  id: string;
  project_id: string;
  day_number: number;
  work_date: string;
  role_name: string;
  grand_total: number;
  result_json: unknown;
}

interface ImpersonatedProject {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  calc_engine: string | null;
  created_at: string;
  days: ImpersonatedProjectDay[];
}

interface ImpersonatedCustomRole {
  id: string;
  role_name: string;
  daily_rate: number;
  ot_coefficient: number;
  custom_bhr: number | null;
  is_buyout: boolean;
}

interface ImpersonatedEquipment {
  id: string;
  name: string;
  day_rate: number;
}

interface ImpersonatedFavourite {
  id: string;
  role_name: string;
  default_rate: number | null;
}

interface ImpersonatedUserSettings {
  display_name: string | null;
  phone: string | null;
  address: string | null;
  department: string | null;
  company_name: string | null;
  company_address: string | null;
  vat_number: string | null;
  vat_registered: boolean | null;
  bank_account_name: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  bank_iban: string | null;
  bank_bic: string | null;
}

export interface ImpersonatedUserData {
  userId: string;
  email: string;
  displayName: string | null;
  department: string | null;
  subscription: ImpersonatedSubscription | null;
  profile: ImpersonatedProfile | null;
  projects: ImpersonatedProject[];
  customRoles: ImpersonatedCustomRole[];
  equipmentPackages: ImpersonatedEquipment[];
  favouriteRoles: ImpersonatedFavourite[];
  userSettings: ImpersonatedUserSettings | null;
  bookkeepingConnections: {
    freeagent: boolean;
    xero: boolean;
    quickbooks: boolean;
  };
}

interface ImpersonationContextType {
  isImpersonating: boolean;
  impersonatedData: ImpersonatedUserData | null;
  impersonationLoading: boolean;
  startImpersonation: (userId: string) => Promise<void>;
  stopImpersonation: () => void;
  refreshImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

// ── Provider ──

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [data, setData] = useState<ImpersonatedUserData | null>(null);
  const [loading, setLoading] = useState(false);

  const startImpersonation = useCallback(async (userId: string) => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-view-user-data', {
        body: { userId },
      });
      if (error) {
        // Extract the actual error message from the function response
        let detail = error.message;
        if ('context' in error && error.context instanceof Response) {
          try {
            const body = await error.context.json();
            detail = body.error || detail;
          } catch { /* response not JSON */ }
        }
        throw new Error(detail);
      }
      setData(data as ImpersonatedUserData);
    } catch (e) {
      Sentry.captureException(e, { extra: { context: 'ImpersonationContext startImpersonation', userId } });
      throw e;
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const stopImpersonation = useCallback(() => {
    setData(null);
  }, []);

  const refreshImpersonation = useCallback(async () => {
    if (!data?.userId) return;
    await startImpersonation(data.userId);
  }, [data?.userId, startImpersonation]);

  return (
    <ImpersonationContext.Provider value={{
      isImpersonating: data !== null,
      impersonatedData: data,
      impersonationLoading: loading,
      startImpersonation,
      stopImpersonation,
      refreshImpersonation,
    }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) throw new Error('useImpersonation must be used within ImpersonationProvider');
  return ctx;
}
