import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isFreeAgentConnected } from '@/services/bookkeeping/freeagent';
import { isXeroConnected } from '@/services/bookkeeping/xero';
import { isQBOConnected } from '@/services/bookkeeping/quickbooks';
import freeagentLogo from '@/assets/integrations/freeagent.svg';
import xeroLogo from '@/assets/integrations/xero.svg';
import quickbooksLogo from '@/assets/integrations/quickbooks.svg';

interface BookkeepingSectionProps {
  userId: string;
  isPremium: boolean;
}

type Platform = 'freeagent' | 'xero' | 'quickbooks';

const PLATFORMS: { id: Platform; name: string; description: string; logo: string }[] = [
  { id: 'freeagent', name: 'FreeAgent',  description: 'Export invoices to FreeAgent',      logo: freeagentLogo },
  { id: 'xero',      name: 'Xero',       description: 'Sync invoices directly to Xero',     logo: xeroLogo },
  { id: 'quickbooks',name: 'QuickBooks', description: 'Push invoices to QuickBooks Online', logo: quickbooksLogo },
];

export function BookkeepingSection({ userId, isPremium }: BookkeepingSectionProps) {
  const navigate = useNavigate();
  // null = still loading, undefined = none connected, Platform = connected platform id
  const [connected, setConnected] = useState<Platform | null | undefined>(null);

  useEffect(() => {
    Promise.all([
      isFreeAgentConnected(userId).catch(() => false),
      isXeroConnected(userId).catch(() => false),
      isQBOConnected(userId).catch(() => false),
    ]).then(([fa, xero, qbo]) => {
      if (fa)        setConnected('freeagent');
      else if (xero) setConnected('xero');
      else if (qbo)  setConnected('quickbooks');
      else           setConnected(undefined);
    });
  }, [userId]);

  const handleConnect = () => {
    navigate(isPremium ? '/settings#bookkeeping' : '/#pricing');
  };

  const handleManage = () => {
    navigate('/settings#bookkeeping');
  };

  // Still resolving — render nothing to avoid layout shift
  if (connected === null) return null;

  const connectedPlatform = connected !== undefined
    ? PLATFORMS.find(p => p.id === connected)
    : null;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <BookOpen className="h-5 w-5" />
        Bookkeeping
      </h2>

      {!isPremium ? (
        // Compact Pro lock for free users
        <Card className="relative overflow-hidden">
          <CardContent className="p-0">
            {/* Blurred platform list */}
            <div className="pointer-events-none select-none" style={{ filter: 'blur(4px)', opacity: 0.35 }}>
              {PLATFORMS.map((platform, i) => (
                <div
                  key={platform.id}
                  className={`flex items-center justify-between gap-4 p-4 ${i < PLATFORMS.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={platform.logo} alt={platform.name} className="h-7 w-7 object-contain" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{platform.name}</p>
                      <p className="text-xs text-muted-foreground">{platform.description}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" tabIndex={-1}>Connect</Button>
                </div>
              ))}
            </div>

            {/* Compact overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#FFD528]" />
                <span className="text-sm font-semibold">Link your bookkeeping software and invoice in seconds</span>
              </div>
              <Button
                size="sm"
                className="bg-[#FFD528] text-[#1F1F21] font-bold hover:bg-[#FFD528]/90"
                onClick={() => navigate('/settings', { state: { section: 'billing' } })}
              >
                Upgrade
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {connectedPlatform ? (
              // Connected state — single platform row
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                    <img src={connectedPlatform.logo} alt={connectedPlatform.name} className="h-7 w-7 object-contain" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{connectedPlatform.name}</p>
                    <Badge className="bg-green-100 text-green-700 border-green-200 mt-1">Connected</Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleManage}>
                  Manage
                </Button>
              </div>
            ) : (
              // Not connected — all three platforms
              PLATFORMS.map((platform, i) => (
                <div
                  key={platform.id}
                  className={`flex items-center justify-between gap-4 p-4 ${i < PLATFORMS.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={platform.logo} alt={platform.name} className="h-7 w-7 object-contain" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{platform.name}</p>
                      <p className="text-xs text-muted-foreground">{platform.description}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleConnect}>
                    Connect
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
