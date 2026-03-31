import { useState } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

interface ReviewPopupProps {
  type: 'day10' | 'expired';
  onClose: () => void;
}

export function ReviewPopup({ type, onClose }: ReviewPopupProps) {
  const { subscription, trialDaysLeft, refresh } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'prompt' | 'confirm' | 'success'>('prompt');
  const [loading, setLoading] = useState(false);

  const reviewUrl = 'https://crewdock.app'; // replace with Trustpilot/Google URL when confirmed

  const handleLeaveReview = () => {
    window.open(reviewUrl, '_blank', 'noopener,noreferrer');
    setPhase('confirm');
  };

  const handleClaimExtension = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/extend-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        await refresh();
        setPhase('success');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1F1F21] border border-[#2e2e32] rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="w-12 h-12 bg-[#FFD528]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 2L13.5 8.5L20.5 8.5L14.9 12.9L17.4 19.4L11 15L4.6 19.4L7.1 12.9L1.5 8.5L8.5 8.5L11 2Z"
              fill="#FFD528" />
          </svg>
        </div>

        {phase === 'prompt' && (
          <>
            {type === 'day10' ? (
              <>
                <div className="inline-flex items-center gap-1.5 bg-[#FFD528]/10 border border-[#FFD528]/20 text-[#FFD528] text-xs font-bold px-3 py-1 rounded-full mb-3">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle cx="5" cy="5" r="4" stroke="#FFD528" strokeWidth="1.3" />
                    <path d="M5 3V5.3L6.5 6.5" stroke="#FFD528" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in your trial
                </div>
                <h3 className="text-base font-bold text-white mb-2">Enjoying Crew Dock?</h3>
                <p className="text-sm text-white/50 mb-6 leading-relaxed">
                  Leave us a quick review and we'll add{' '}
                  <span className="text-[#FFD528] font-semibold">14 more days free</span>{' '}
                  to your trial — no card needed.
                </p>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-1.5 bg-[#FFD528]/10 border border-[#FFD528]/20 text-[#FFD528] text-xs font-bold px-3 py-1 rounded-full mb-3">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle cx="5" cy="5" r="4" stroke="#FFD528" strokeWidth="1.3" />
                    <path d="M5 3V5.3L6.5 6.5" stroke="#FFD528" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Your trial has ended
                </div>
                <h3 className="text-base font-bold text-white mb-2">Get 14 more days free</h3>
                <p className="text-sm text-white/50 mb-6 leading-relaxed">
                  Leave us a quick review and we'll unlock{' '}
                  <span className="text-[#FFD528] font-semibold">14 more days of Pro access</span>{' '}
                  — no card needed. Or upgrade to keep everything.
                </p>
              </>
            )}

            <button
              onClick={handleLeaveReview}
              className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors mb-2"
            >
              Leave a Review
            </button>
            <div className="border-t border-[#2e2e32] my-3" />
            <button
              onClick={() => { onClose(); navigate('/settings', { state: { section: 'billing' } }); }}
              className="w-full bg-transparent text-white/50 border border-[#2e2e32] font-medium py-2.5 rounded-xl text-sm hover:border-white/20 hover:text-white/70 transition-colors mb-2"
            >
              Upgrade to Pro instead
            </button>
            <button onClick={onClose} className="text-xs text-white/25 hover:text-white/40 transition-colors mt-1">
              {type === 'day10' ? 'Maybe later' : 'Continue on free plan'}
            </button>
          </>
        )}

        {phase === 'confirm' && (
          <>
            <h3 className="text-base font-bold text-white mb-2">Thanks for leaving a review!</h3>
            <p className="text-sm text-white/50 mb-6 leading-relaxed">
              Once you've submitted it, click below to unlock your 14 days.
            </p>
            <button
              onClick={handleClaimExtension}
              disabled={loading}
              className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors disabled:opacity-50 mb-2"
            >
              {loading ? 'Activating...' : "I've left my review → Unlock 14 days"}
            </button>
            <button onClick={onClose} className="text-xs text-white/25 hover:text-white/40 transition-colors">
              Cancel
            </button>
          </>
        )}

        {phase === 'success' && (
          <>
            <h3 className="text-base font-bold text-white mb-2">You're all set!</h3>
            <p className="text-sm text-white/50 mb-6 leading-relaxed">
              14 more days of Pro access have been added. Thanks for the review!
            </p>
            <button
              onClick={onClose}
              className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors"
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
