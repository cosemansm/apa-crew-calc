import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { isFreeAgentConnected } from '@/services/bookkeeping/freeagent';
import { isXeroConnected } from '@/services/bookkeeping/xero';

const PLATFORMS = ['FreeAgent', 'Xero', 'QuickBooks'] as const;
const STORAGE_KEY = 'bookkeeping_cta_index';

interface BookkeepingCTAProps {
  userId: string;
}

export function BookkeepingCTA({ userId }: BookkeepingCTAProps) {
  const { isPremium } = useSubscription();
  const navigate = useNavigate();

  // null = still resolving, true = any platform connected, false = none connected
  const [anyConnected, setAnyConnected] = useState<boolean | null>(null);
  const [platform, setPlatform] = useState<string>('FreeAgent');

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = parseInt(raw ?? '0', 10);
    const current = Number.isFinite(parsed) && parsed >= 0 && parsed < PLATFORMS.length ? parsed : 0;
    setPlatform(PLATFORMS[current]);
    localStorage.setItem(STORAGE_KEY, String((current + 1) % PLATFORMS.length));
  }, []);

  useEffect(() => {
    Promise.all([
      isFreeAgentConnected(userId).catch(() => false),
      isXeroConnected(userId).catch(() => false),
    ]).then(([fa, xero]) => setAnyConnected(fa || xero));
  }, [userId]);

  // Still loading or any platform connected — render nothing
  if (anyConnected === null || anyConnected === true) return null;

  const handleClick = () => {
    if (isPremium) {
      navigate('/settings#bookkeeping');
    } else {
      navigate('/#pricing');
    }
  };

  const ctaText = isPremium
    ? `Connect ${platform} to export invoices directly`
    : `Connect ${platform} to export invoices — upgrade to Pro`;

  return (
    <div className="flex items-center gap-3 bg-[#1F1F21] border border-[#2e2e32] rounded-xl px-4 py-3">
      <div className="shrink-0 w-8 h-8 bg-[#FFD528]/10 rounded-lg flex items-center justify-center">
        <BookOpen className="h-4 w-4 text-[#FFD528]" />
      </div>
      <p className="flex-1 text-sm font-medium text-white/70 font-mono">{ctaText}</p>
      <Button
        size="sm"
        onClick={handleClick}
        className="shrink-0 bg-[#FFD528] text-[#1F1F21] font-bold hover:bg-[#FFD528]/90 rounded-lg text-xs"
      >
        {isPremium ? 'Connect' : 'Upgrade'}
      </Button>
    </div>
  );
}
