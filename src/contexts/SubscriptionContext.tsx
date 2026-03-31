import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
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
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();
    setSubscription(data ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchSubscription();
  }, [user?.id]);

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
