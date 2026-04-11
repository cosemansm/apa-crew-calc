# Dashboard Bookkeeping Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Bookkeeping section to the Dashboard that shows all three platforms when none is connected, and collapses to show only the connected one when linked.

**Architecture:** New `BookkeepingSection` component handles its own async state. Placed in `DashboardPage` after the Recent Jobs section. Reuses existing `isFreeAgentConnected`, `isXeroConnected`, `isQBOConnected` service functions and matches the existing card/badge styling patterns used throughout the app.

**Tech Stack:** React, TypeScript, shadcn/ui (Card, Button, Badge), lucide-react, react-router-dom

---

## File Map

- **Create:** `src/components/BookkeepingSection.tsx` — self-contained component
- **Modify:** `src/pages/DashboardPage.tsx` — import and render `<BookkeepingSection>` after Recent Jobs

---

### Task 1: Create `BookkeepingSection` component

**Files:**
- Create: `src/components/BookkeepingSection.tsx`

- [ ] **Step 1: Create the file with this full implementation**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
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
      if (fa)   setConnected('freeagent');
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
                  {isPremium ? 'Connect' : 'Connect'}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BookkeepingSection.tsx
git commit -m "feat: add BookkeepingSection component"
```

---

### Task 2: Add `BookkeepingSection` to `DashboardPage`

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add the import at the top of `DashboardPage.tsx`**

Find the existing import block near the top of the file and add:

```tsx
import { BookkeepingSection } from '@/components/BookkeepingSection';
```

- [ ] **Step 2: Render the section after Recent Jobs**

Find the closing `</div>` of the Recent Jobs section (around line 741 — the `</div>` that closes `{/* Projects */}`). Add immediately after it:

```tsx
      {/* Bookkeeping */}
      {user && (
        <BookkeepingSection userId={user.id} isPremium={isPremium} />
      )}
```

- [ ] **Step 3: Verify in the browser**

Open the dashboard (`/`). Confirm:
- The Bookkeeping section appears below Recent Jobs
- All three platforms show with Connect buttons when none is connected
- Connect navigates to `/settings#bookkeeping` (Pro) or `/#pricing` (free)
- If a platform is connected (check in Settings first), only that one shows with a green Connected badge and Manage button

- [ ] **Step 4: Commit and push**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: add bookkeeping section to dashboard"
git push
```
