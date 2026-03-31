import { useSubscription } from '@/contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

interface ProLockOverlayProps {
  children: ReactNode;
  featureName?: string;
  featureDescription?: string;
}

export function ProLockOverlay({
  children,
  featureName = 'This feature',
  featureDescription = 'Upgrade to Pro to unlock access.',
}: ProLockOverlayProps) {
  const { isPremium, trialExtended } = useSubscription();
  const navigate = useNavigate();

  if (isPremium) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred background content */}
      <div className="pointer-events-none select-none" style={{ filter: 'blur(4px)', opacity: 0.35 }}>
        {children}
      </div>

      {/* Lock card overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="bg-[#1F1F21] border border-[#2e2e32] rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl">
          {/* Lock icon */}
          <div className="w-12 h-12 bg-[#FFD528]/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="4" y="10" width="14" height="10" rx="2.5" stroke="#FFD528" strokeWidth="1.7" />
              <path d="M7.5 10V7.5a3.5 3.5 0 017 0V10" stroke="#FFD528" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="11" cy="15" r="1.3" fill="#FFD528" />
            </svg>
          </div>

          <h3 className="text-base font-bold text-white mb-2">{featureName} is a Pro feature</h3>
          <p className="text-sm text-white/50 mb-6 leading-relaxed">{featureDescription}</p>

          <button
            onClick={() => navigate('/settings', { state: { section: 'billing' } })}
            className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors mb-2"
          >
            Upgrade to Pro
          </button>

          {!trialExtended ? (
            <button
              onClick={() => navigate('/settings', { state: { section: 'billing' } })}
              className="w-full bg-transparent text-white/50 border border-[#2e2e32] font-medium py-2.5 rounded-xl text-sm hover:border-white/20 hover:text-white/70 transition-colors"
            >
              Leave a review → 14 days free
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-white/30 text-xs border border-[#2a2a2c] rounded-xl py-2.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Review extension already used
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
