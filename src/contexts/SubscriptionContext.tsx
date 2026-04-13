import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: 'trialing' | 'active' | 'lifetime' | 'past_due' | 'canceled' | 'unpaid';
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

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSubscription = useCallback(async () => {
    setLoading(true);
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
    isTrialing;
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        isPremium,
        isTrialing,
        trialDaysLeft,
        trialExtended: subscription?.trial_extended ?? false,
        loading,
        error,
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
