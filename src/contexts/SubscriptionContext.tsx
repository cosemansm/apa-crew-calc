import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: 'trialing' | 'active' | 'lifetime' | 'team' | 'past_due' | 'canceled' | 'unpaid';
  trial_ends_at: string;
  current_period_end: string | null;
  trial_extended: boolean;
  day10_popup_shown: boolean;
  expired_popup_shown: boolean;
  created_at: string;
}

interface SubscriptionContextType {
  subscription: Subscription | null;
  isPremium: boolean;
  isTrialing: boolean;
  trialDaysLeft: number;
  trialExtended: boolean;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

function getCachedSubscription(): Subscription | null {
  try {
    const raw = sessionStorage.getItem('cache:subscription');
    return raw ? JSON.parse(raw) as Subscription : null;
  } catch { return null; }
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isImpersonating, impersonatedData } = useImpersonation();
  const cached = getCachedSubscription();
  const [subscription, setSubscription] = useState<Subscription | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<Error | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!cached) setLoading(true);
    if (!user) {
      setSubscription(null);
      setError(null);
      setLoading(false);
      return;
    }
    try {
      const { data, error: fetchError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (fetchError) {
        console.error('Failed to fetch subscription:', fetchError);
        setError(new Error(fetchError.message));
        setSubscription(null);
      } else {
        setError(null);
        setSubscription(data ?? null);
        try { sessionStorage.setItem('cache:subscription', JSON.stringify(data)); } catch { /* quota */ }
      }
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
      setError(err instanceof Error ? err : new Error('Network error'));
      setSubscription(null);
    }
    setLoading(false);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const now = new Date();
  const trialEndsAt = subscription ? new Date(subscription.trial_ends_at) : null;
  const isTrialing =
    subscription?.status === 'trialing' && trialEndsAt != null && trialEndsAt > now;
  const isPremium =
    subscription?.status === 'active' ||
    subscription?.status === 'lifetime' ||
    subscription?.status === 'team' ||
    isTrialing;
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Override with impersonated user's subscription when active
  const impSub = isImpersonating ? impersonatedData?.subscription : null;
  const effectiveSubscription = impSub
    ? { ...impSub, id: '', user_id: '', stripe_customer_id: null, stripe_subscription_id: null, day10_popup_shown: true, expired_popup_shown: true, created_at: '' } as Subscription
    : subscription;

  const impTrialEndsAt = impSub?.trial_ends_at ? new Date(impSub.trial_ends_at) : null;
  const effectiveIsTrialing = isImpersonating
    ? (impSub?.status === 'trialing' && impTrialEndsAt != null && impTrialEndsAt > new Date())
    : isTrialing;
  const effectiveIsPremium = isImpersonating
    ? (impSub?.status === 'active' || impSub?.status === 'lifetime' || impSub?.status === 'team' || effectiveIsTrialing)
    : isPremium;
  const effectiveTrialDaysLeft = isImpersonating
    ? (impTrialEndsAt ? Math.max(0, Math.ceil((impTrialEndsAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : 0)
    : trialDaysLeft;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription: effectiveSubscription,
        isPremium: effectiveIsPremium,
        isTrialing: effectiveIsTrialing,
        trialDaysLeft: effectiveTrialDaysLeft,
        trialExtended: isImpersonating ? (impSub?.trial_extended ?? false) : (subscription?.trial_extended ?? false),
        loading: isImpersonating ? false : loading,
        error: isImpersonating ? null : error,
        refresh: fetchSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
