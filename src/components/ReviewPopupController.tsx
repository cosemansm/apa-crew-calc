import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { ReviewPopup } from '@/components/ReviewPopup';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function markPopupShown(userId: string, field: 'day10_popup_shown' | 'expired_popup_shown', token: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ [field]: true }),
  });
}

export function ReviewPopupController() {
  const { subscription, isPremium, isTrialing, trialDaysLeft, loading } = useSubscription();
  const { user, session } = useAuth();
  const [activePopup, setActivePopup] = useState<'day10' | 'expired' | null>(null);

  useEffect(() => {
    if (loading || !subscription || !user || !session) return;

    const now = new Date();
    const createdAt = new Date(subscription.created_at);
    const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const trialEnded = new Date(subscription.trial_ends_at) <= now;

    // Day-10 popup: show during trial at day 10+, not yet extended, not yet shown
    if (
      isTrialing &&
      daysSinceCreated >= 10 &&
      !subscription.trial_extended &&
      !subscription.day10_popup_shown
    ) {
      markPopupShown(user.id, 'day10_popup_shown', session.access_token)
        .catch(err => Sentry.captureException(err, { extra: { context: 'ReviewPopupController markPopupShown day10' } }));
      // Send review email
      fetch('/api/email/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: user.email, trialDaysLeft }),
      }).catch(err => Sentry.captureException(err, { extra: { context: 'ReviewPopupController review email' } }));
      setActivePopup('day10');
      return;
    }

    // Expired popup: show after trial ends, not extended, not yet shown
    if (
      trialEnded &&
      !isPremium &&
      !subscription.trial_extended &&
      !subscription.expired_popup_shown
    ) {
      markPopupShown(user.id, 'expired_popup_shown', session.access_token)
        .catch(err => Sentry.captureException(err, { extra: { context: 'ReviewPopupController markPopupShown expired' } }));
      setActivePopup('expired');
    }
  }, [loading, subscription?.id]);

  if (!activePopup) return null;

  return (
    <ReviewPopup
      type={activePopup}
      onClose={() => setActivePopup(null)}
    />
  );
}
