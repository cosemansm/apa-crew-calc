import { useSubscription } from '@/contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useState } from 'react';

export function TrialBanner() {
  const { isTrialing, trialDaysLeft } = useSubscription();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (!isTrialing || trialDaysLeft > 5 || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-[#FFD528]/10 border border-[#FFD528]/25 rounded-xl px-4 py-3 mb-6">
      <p className="text-sm font-medium text-[#FFD528]">
        Your trial ends in <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</strong> — upgrade to keep Pro access.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate('/settings', { state: { section: 'billing' } })}
          className="text-xs font-bold bg-[#FFD528] text-[#1F1F21] px-3 py-1.5 rounded-lg hover:bg-[#FFD528]/90 transition-colors"
        >
          Upgrade
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/30 hover:text-white/60 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
