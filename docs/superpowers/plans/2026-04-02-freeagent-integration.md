# FreeAgent Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Send to FreeAgent" button to InvoicePage that pushes a draft invoice to the user's FreeAgent account via OAuth, with a rotating bookkeeping CTA for upsell/discoverability.

**Architecture:** Three Vercel serverless functions handle OAuth server-side (protecting the Client Secret). A frontend service manages token validation and FreeAgent API calls. The Settings page gets a live FreeAgent connect/disconnect UI replacing the existing "Coming Soon" placeholder. A shared `BookkeepingCTA` component rotates through FreeAgent/Xero/QuickBooks names to drive discoverability.

**Tech Stack:** Vercel Serverless Functions (Node.js), Supabase (PostgreSQL + RLS), React + TypeScript, shadcn/ui components, FreeAgent REST API v2

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| CREATE | `supabase/migrations/20260402_add_bookkeeping.sql` | `bookkeeping_connections` table, `vat_registered`, `job_reference` columns |
| CREATE | `api/auth/freeagent/start.ts` | OAuth start — generate state, redirect to FreeAgent |
| CREATE | `api/auth/freeagent/callback.ts` | OAuth callback — exchange code, store tokens |
| CREATE | `api/auth/freeagent/refresh.ts` | Token refresh — exchange refresh token, update Supabase |
| CREATE | `src/services/bookkeeping/freeagent.ts` | Token management, contact lookup, invoice creation |
| CREATE | `src/components/BookkeepingCTA.tsx` | Rotating CTA with Pro gate |
| MODIFY | `src/pages/SettingsPage.tsx` | Live FreeAgent connect/disconnect + VAT toggle (lines 935–975) |
| MODIFY | `src/pages/InvoicePage.tsx` | Job ref from DB, FreeAgent export button, BookkeepingCTA |

---

## Task 1: Supabase Migration

**Files:**
- Create: `supabase/migrations/20260402_add_bookkeeping.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ── Bookkeeping connections (shared: FreeAgent, Xero, QuickBooks) ─────────────
CREATE TABLE IF NOT EXISTS bookkeeping_connections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('xero', 'quickbooks', 'freeagent')),
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  tenant_id     TEXT,        -- Xero: organisation tenantId
  realm_id      TEXT,        -- QuickBooks: company realmId
  qbo_item_id   TEXT,        -- QuickBooks: Film Crew Services item ID
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, platform)
);

ALTER TABLE bookkeeping_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own connections"
  ON bookkeeping_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── VAT registration (used in all bookkeeping exports) ────────────────────────
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN DEFAULT false;

-- ── Job reference on projects (optional, flows to exports) ───────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS job_reference TEXT;
```

- [ ] **Step 2: Run in Supabase SQL editor**

Open your Supabase project → SQL Editor → paste and run. Verify:
- `bookkeeping_connections` table appears in Table Editor
- `user_settings` has `vat_registered` column
- `projects` has `job_reference` column

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260402_add_bookkeeping.sql
git commit -m "feat: add bookkeeping_connections table, vat_registered, job_reference"
```

---

## Task 2: Environment Variables

**Files:**
- Modify: `.env.local` (dev — never committed)
- Modify: `.env.example` (template — committed)

- [ ] **Step 1: Add dev env vars to `.env.local`**

Copy Client ID and Client Secret from the **CrewDockDev** app at dev.freeagent.com and add:

```bash
# FreeAgent Dev (sandbox) — CrewDockDev app
FREEAGENT_CLIENT_ID=<dev-client-id>
FREEAGENT_CLIENT_SECRET=<dev-client-secret>
FREEAGENT_REDIRECT_URI=http://localhost:3000/api/auth/freeagent/callback
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

`SUPABASE_SERVICE_ROLE_KEY` is in Supabase → Project Settings → API → `service_role` key (keep this secret).

- [ ] **Step 2: Add production env vars in Vercel**

Go to Vercel → your project → Settings → Environment Variables. Add for **Production** environment:
```
FREEAGENT_CLIENT_ID       = <prod-client-id from CrewDock app>
FREEAGENT_CLIENT_SECRET   = <prod-client-secret from CrewDock app>
FREEAGENT_REDIRECT_URI    = https://crewdock.app/api/auth/freeagent/callback
SUPABASE_SERVICE_ROLE_KEY = <same service role key>
```

- [ ] **Step 3: Update `.env.example`**

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Google Gemini (for AI timesheet parsing)
VITE_GEMINI_API_KEY=your-gemini-api-key-here

# Supabase service role (server-side only — never expose to frontend)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# FreeAgent OAuth (server-side only)
FREEAGENT_CLIENT_ID=your-freeagent-client-id
FREEAGENT_CLIENT_SECRET=your-freeagent-client-secret
FREEAGENT_REDIRECT_URI=https://crewdock.app/api/auth/freeagent/callback
```

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: add FreeAgent and Supabase service role env var templates"
```

---

## Task 3: OAuth Start Route

**Files:**
- Create: `api/auth/freeagent/start.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'missing_user_id' });

  // CSRF nonce + userId encoded together in state
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = `${nonce}:${userId}`;

  res.setHeader(
    'Set-Cookie',
    `fa_oauth_nonce=${nonce}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );

  const params = new URLSearchParams({
    client_id: process.env.FREEAGENT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.FREEAGENT_REDIRECT_URI!,
    state,
  });

  res.redirect(`https://api.freeagent.com/v2/approve_app?${params}`);
}
```

- [ ] **Step 2: Verify locally**

Run `vercel dev` then open `http://localhost:3000/api/auth/freeagent/start?userId=test-123` in a browser.

Expected: browser redirects to `https://api.freeagent.com/v2/approve_app?...` with `client_id`, `state`, and `redirect_uri` in the query string.

- [ ] **Step 3: Commit**

```bash
git add api/auth/freeagent/start.ts
git commit -m "feat: add FreeAgent OAuth start route"
```

---

## Task 4: OAuth Callback Route

**Files:**
- Create: `api/auth/freeagent/callback.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FA_TOKEN_URL = 'https://api.freeagent.com/v2/token_endpoint';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(`/settings?error=freeagent_denied`);
  if (!code || !state) return res.redirect(`/settings?error=invalid_callback`);

  // Validate CSRF nonce and extract userId from state
  const [nonce, userId] = (state as string).split(':');
  const cookieNonce = req.cookies?.fa_oauth_nonce;

  if (!nonce || !userId || nonce !== cookieNonce) {
    return res.redirect(`/settings?error=invalid_state`);
  }

  // Exchange code for tokens using HTTP Basic Auth
  const credentials = Buffer.from(
    `${process.env.FREEAGENT_CLIENT_ID}:${process.env.FREEAGENT_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch(FA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: process.env.FREEAGENT_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) {
    console.error('FreeAgent token exchange failed:', await tokenRes.text());
    return res.redirect(`/settings?error=freeagent_token_failed`);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: dbError } = await supabaseAdmin
    .from('bookkeeping_connections')
    .upsert(
      {
        user_id: userId,
        platform: 'freeagent',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    );

  if (dbError) {
    console.error('Failed to store FreeAgent tokens:', dbError);
    return res.redirect(`/settings?error=freeagent_db_failed`);
  }

  // Clear nonce cookie and redirect to settings with success signal
  res.setHeader('Set-Cookie', `fa_oauth_nonce=; HttpOnly; Max-Age=0; Path=/`);
  res.redirect(`/settings?connected=freeagent`);
}
```

- [ ] **Step 2: Verify by completing the OAuth flow**

With `vercel dev` running:
1. Open `http://localhost:3000/api/auth/freeagent/start?userId=<your-supabase-user-id>`
2. Authorise in FreeAgent sandbox
3. Should redirect back to `http://localhost:3000/settings?connected=freeagent`
4. Check Supabase Table Editor → `bookkeeping_connections` — row should exist with `platform = 'freeagent'`, non-null `access_token`, `refresh_token`, `expires_at`

- [ ] **Step 3: Commit**

```bash
git add api/auth/freeagent/callback.ts
git commit -m "feat: add FreeAgent OAuth callback route"
```

---

## Task 5: OAuth Refresh Route

**Files:**
- Create: `api/auth/freeagent/refresh.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FA_TOKEN_URL = 'https://api.freeagent.com/v2/token_endpoint';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { refresh_token, user_id } = req.body as { refresh_token: string; user_id: string };
  if (!refresh_token || !user_id) return res.status(400).json({ error: 'missing_params' });

  const credentials = Buffer.from(
    `${process.env.FREEAGENT_CLIENT_ID}:${process.env.FREEAGENT_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch(FA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    }),
  });

  if (!tokenRes.ok) return res.status(401).json({ error: 'refresh_failed' });

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // FreeAgent refresh tokens rotate — store the new one
  await supabaseAdmin
    .from('bookkeeping_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user_id)
    .eq('platform', 'freeagent');

  res.json({ access_token: tokens.access_token, expires_at: expiresAt });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/auth/freeagent/refresh.ts
git commit -m "feat: add FreeAgent token refresh route"
```

---

## Task 6: Frontend FreeAgent Service

**Files:**
- Create: `src/services/bookkeeping/freeagent.ts`

- [ ] **Step 1: Create the file**

```typescript
import { supabase } from '@/lib/supabase';

const BASE_URL = import.meta.env.DEV
  ? 'https://api.sandbox.freeagent.com/v2'
  : 'https://api.freeagent.com/v2';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoiceDay {
  id: string;
  work_date: string;
  role_name: string;
  day_type: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
}

export interface FreeAgentExportPayload {
  clientName: string;
  projectName: string;
  jobReference: string | null;
  invoiceNumber: string;
  days: InvoiceDay[];
  vatRegistered: boolean;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

async function getValidToken(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('bookkeeping_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('platform', 'freeagent')
    .single();

  if (error || !data) {
    throw new Error('FreeAgent not connected. Please connect in Settings.');
  }

  const isExpired = Date.now() > new Date(data.expires_at).getTime() - 60_000;
  if (!isExpired) return data.access_token;

  const res = await fetch('/api/auth/freeagent/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: data.refresh_token, user_id: userId }),
  });

  if (!res.ok) throw new Error('FreeAgent session expired. Please reconnect in Settings.');

  const newTokens = await res.json();
  return newTokens.access_token;
}

// ── Contact lookup / creation ─────────────────────────────────────────────────

async function findOrCreateContact(
  accessToken: string,
  organisationName: string
): Promise<string> {
  const res = await fetch(`${BASE_URL}/contacts?view=all`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch FreeAgent contacts.');

  const { contacts } = await res.json();
  const match = (contacts ?? []).find(
    (c: { organisation_name?: string; url: string }) =>
      c.organisation_name?.toLowerCase() === organisationName.toLowerCase()
  );
  if (match) return match.url;

  const createRes = await fetch(`${BASE_URL}/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ contact: { organisation_name: organisationName } }),
  });

  if (!createRes.ok) throw new Error('Failed to create FreeAgent contact.');

  const contactUrl = createRes.headers.get('Location');
  if (!contactUrl) throw new Error('FreeAgent contact created but no URL returned.');

  return contactUrl;
}

// ── Invoice creation ──────────────────────────────────────────────────────────

async function createInvoice(
  accessToken: string,
  contactUrl: string,
  payload: FreeAgentExportPayload
): Promise<string> {
  const taxRate = payload.vatRegistered ? '20.0' : '0.0';

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const comments = payload.jobReference
    ? `${payload.projectName} | ${payload.jobReference}`
    : payload.projectName;

  const invoiceItems = payload.days.map(day => ({
    description: `${day.role_name} — ${day.day_type.replace(/_/g, ' ')} | ${day.work_date} | Call: ${day.call_time} Wrap: ${day.wrap_time}`,
    item_type: 'Days',
    quantity: '1.0',
    price: day.grand_total.toFixed(2),
    sales_tax_rate: taxRate,
  }));

  const body = {
    invoice: {
      contact: contactUrl,
      reference: payload.invoiceNumber,
      dated_on: new Date().toISOString().split('T')[0],
      due_on: dueDate.toISOString().split('T')[0],
      payment_terms_in_days: 30,
      currency: 'GBP',
      comments,
      invoice_items: invoiceItems,
    },
  };

  const res = await fetch(`${BASE_URL}/invoices`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create FreeAgent invoice: ${err}`);
  }

  return res.headers.get('Location') ?? '';
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function exportToFreeAgent(
  userId: string,
  payload: FreeAgentExportPayload
): Promise<{ invoiceUrl: string }> {
  const accessToken = await getValidToken(userId);
  const contactUrl = await findOrCreateContact(accessToken, payload.clientName);
  const invoiceUrl = await createInvoice(accessToken, contactUrl, payload);
  return { invoiceUrl };
}

export async function isFreeAgentConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bookkeeping_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'freeagent')
    .single();
  return !!data;
}

export async function disconnectFreeAgent(userId: string): Promise<void> {
  await supabase
    .from('bookkeeping_connections')
    .delete()
    .eq('user_id', userId)
    .eq('platform', 'freeagent');
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `src/services/bookkeeping/freeagent.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/services/bookkeeping/freeagent.ts
git commit -m "feat: add FreeAgent frontend service (token management, contact, invoice)"
```

---

## Task 7: BookkeepingCTA Component

**Files:**
- Create: `src/components/BookkeepingCTA.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';

const PLATFORMS = ['FreeAgent', 'Xero', 'QuickBooks'] as const;
const LS_KEY = 'bookkeeping_cta_index';

function getNextPlatform(): string {
  const raw = localStorage.getItem(LS_KEY);
  const current = raw !== null ? parseInt(raw, 10) : 0;
  const next = (current + 1) % PLATFORMS.length;
  localStorage.setItem(LS_KEY, String(next));
  return PLATFORMS[current];
}

export function BookkeepingCTA() {
  const { isPremium, isTrialing } = useSubscription();
  const navigate = useNavigate();
  const platform = getNextPlatform();
  const isProUser = isPremium || isTrialing;

  const handleClick = () => {
    if (!isProUser) {
      navigate('/settings', { state: { section: 'billing' } });
    } else {
      navigate('/settings', { state: { section: 'integrations' } });
    }
  };

  return (
    <button
      onClick={handleClick}
      className="w-full text-left px-3 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors group"
    >
      <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
        {isProUser
          ? <>Connect <span className="font-medium text-foreground">{platform}</span> to export invoices directly</>
          : <>Connect <span className="font-medium text-foreground">{platform}</span> — upgrade to Pro to export invoices directly</>
        }
      </p>
    </button>
  );
}
```

- [ ] **Step 2: Verify rotation works**

Open browser DevTools → Application → Local Storage → clear `bookkeeping_cta_index`. Navigate to InvoicePage three times — the platform name should cycle FreeAgent → Xero → QuickBooks → FreeAgent.

- [ ] **Step 3: Commit**

```bash
git add src/components/BookkeepingCTA.tsx
git commit -m "feat: add rotating BookkeepingCTA component with Pro gate"
```

---

## Task 8: Settings Page — Integrations Section + VAT Toggle

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

This task replaces the static "Coming Soon" integrations section (lines 935–975) with a live FreeAgent connect/disconnect UI and adds a VAT toggle.

- [ ] **Step 1: Add new state variables**

Find the `// Equipment packages` state block (around line 237). Add these new state variables directly after the existing equipment state and before the `// ── Load ──` comment:

```tsx
  // Integrations
  const [faConnected, setFaConnected] = useState(false);
  const [faConnecting, setFaConnecting] = useState(false);
  const [vatRegistered, setVatRegistered] = useState(false);
```

- [ ] **Step 2: Load FreeAgent connection status and VAT setting**

In the existing `useEffect` that calls `supabase.from('user_settings')...` (around line 251), extend it to also load `vat_registered`:

```tsx
  useEffect(() => {
    if (!user) return;
    supabase.from('user_settings').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) {
        setDisplayName(data.display_name ?? '');
        setPhone(data.phone ?? '');
        setAddress(data.address ?? '');
        setDepartment(data.department ?? '');
        setCompanyName(data.company_name ?? '');
        setCompanyAddress(data.company_address ?? '');
        setVatNumber(data.vat_number ?? '');
        setBankAccountName(data.bank_account_name ?? '');
        setBankSortCode(data.bank_sort_code ?? '');
        setBankAccountNumber(data.bank_account_number ?? '');
        setVatRegistered(data.vat_registered ?? false);
      }
    });
    // Check FreeAgent connection
    supabase
      .from('bookkeeping_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', 'freeagent')
      .single()
      .then(({ data }) => setFaConnected(!!data));
    loadCustomRoles();
    loadEquipmentPackages();
  }, [user]);
```

- [ ] **Step 3: Handle the `?connected=freeagent` redirect from OAuth**

Find the existing `useEffect` that handles `?stripe=success` (around line 269). Add a FreeAgent handler inside it:

```tsx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe') === 'success') {
      setActiveSection('billing');
      window.history.replaceState({}, '', '/settings');
    }
    if (params.get('connected') === 'freeagent') {
      setFaConnected(true);
      setActiveSection('integrations');
      window.history.replaceState({}, '', '/settings');
    }
    if (params.get('error')) {
      setActiveSection('integrations');
      window.history.replaceState({}, '', '/settings');
    }
    if (location.state?.section === 'billing') {
      setActiveSection('billing');
      navigate(location.pathname, { replace: true, state: {} });
    }
    if (location.state?.section === 'integrations') {
      setActiveSection('integrations');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []);
```

- [ ] **Step 4: Add disconnect handler**

Add this function near the other save helpers (after `upsertSettings`):

```tsx
  const handleDisconnectFreeAgent = async () => {
    if (!user) return;
    await supabase
      .from('bookkeeping_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', 'freeagent');
    setFaConnected(false);
  };
```

- [ ] **Step 5: Replace the integrations section JSX**

Find and replace the entire `{/* INTEGRATIONS */}` block (lines 935–975):

```tsx
          {/* INTEGRATIONS */}
          {activeSection === 'integrations' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5" /> Connected Accounts</CardTitle>
                  <CardDescription>Connect your accounting software to export draft invoices directly from Crew Dock</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* FreeAgent */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={freeagentLogo} alt="FreeAgent" className="h-7 w-7 object-contain" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">FreeAgent</p>
                        <p className="text-xs text-muted-foreground">Send invoices and log expenses in FreeAgent</p>
                      </div>
                    </div>
                    {faConnected ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className="bg-green-600 text-white">Connected</Badge>
                        <Button variant="ghost" size="sm" onClick={handleDisconnectFreeAgent}>Disconnect</Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={faConnecting}
                        onClick={() => {
                          setFaConnecting(true);
                          window.location.href = `/api/auth/freeagent/start?userId=${user?.id}`;
                        }}
                      >
                        {faConnecting ? 'Connecting…' : 'Connect'}
                      </Button>
                    )}
                  </div>
                  {/* Xero — coming soon */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border opacity-60">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={xeroLogo} alt="Xero" className="h-7 w-7 object-contain" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Xero</p>
                        <p className="text-xs text-muted-foreground">Sync invoices and expenses directly to Xero</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">Coming Soon</Badge>
                  </div>
                  {/* QuickBooks — coming soon */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border opacity-60">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={quickbooksLogo} alt="QuickBooks" className="h-7 w-7 object-contain" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">QuickBooks</p>
                        <p className="text-xs text-muted-foreground">Push invoices and track income in QuickBooks</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">Coming Soon</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* VAT */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">VAT Settings</CardTitle>
                  <CardDescription>Applied to all bookkeeping exports</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !vatRegistered;
                        setVatRegistered(next);
                        upsertSettings({ vat_registered: next });
                      }}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none',
                        vatRegistered ? 'bg-primary' : 'bg-input'
                      )}
                      role="switch"
                      aria-checked={vatRegistered}
                    >
                      <span className={cn(
                        'pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
                        vatRegistered ? 'translate-x-4' : 'translate-x-0'
                      )} />
                    </button>
                    <Label
                      className="cursor-pointer"
                      onClick={() => {
                        const next = !vatRegistered;
                        setVatRegistered(next);
                        upsertSettings({ vat_registered: next });
                      }}
                    >
                      I am VAT registered <span className="text-muted-foreground font-normal">(adds 20% to exported invoices)</span>
                    </Label>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
```

- [ ] **Step 6: Verify in browser**

Run `vercel dev`. Go to Settings → Integrations:
- FreeAgent row shows "Connect" button (not "Coming Soon")
- Xero and QuickBooks show dimmed "Coming Soon"
- VAT toggle is visible below
- Clicking "Connect" redirects to FreeAgent OAuth
- After OAuth completes, redirect back shows "Connected" badge

- [ ] **Step 7: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: wire up FreeAgent connect/disconnect in Settings, add VAT toggle"
```

---

## Task 9: Invoice Page — FreeAgent Export + BookkeepingCTA

**Files:**
- Modify: `src/pages/InvoicePage.tsx`

- [ ] **Step 1: Add imports**

At the top of `InvoicePage.tsx`, add these imports after the existing import block:

```tsx
import { useSubscription } from '@/contexts/SubscriptionContext';
import { exportToFreeAgent, isFreeAgentConnected, type FreeAgentExportPayload } from '@/services/bookkeeping/freeagent';
import { BookkeepingCTA } from '@/components/BookkeepingCTA';
```

- [ ] **Step 2: Add subscription hook and FreeAgent state**

Inside `export function InvoicePage()`, after the existing `const { user } = useAuth();` line, add:

```tsx
  const { isPremium, isTrialing } = useSubscription();
  const isProUser = isPremium || isTrialing;

  const [faConnected, setFaConnected] = useState(false);
  const [faExporting, setFaExporting] = useState(false);
  const [faInvoiceUrl, setFaInvoiceUrl] = useState<string | null>(null);
  const [faError, setFaError] = useState<string | null>(null);
```

- [ ] **Step 3: Update `Project` interface and projects query to include `job_reference`**

Replace the existing `Project` interface (around line 21):

```tsx
interface Project {
  id: string;
  name: string;
  client_name: string | null;
  job_reference: string | null;
}
```

Replace the projects query in the `useEffect` (around line 98):

```tsx
    supabase
      .from('projects')
      .select('id, name, client_name, job_reference')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => { if (data) setProjects(data as Project[]); });
```

- [ ] **Step 4: Auto-populate job reference when a project is selected**

Replace `handleSelectProject` (around line 159):

```tsx
  const handleSelectProject = (proj: Project) => {
    setSelectedProjectId(proj.id);
    setShowProjectPicker(false);
    setSelected(allDays.filter(d => d.project_id === proj.id).map(d => d.id));
    if (proj.client_name) setClientName(proj.client_name);
    if (proj.job_reference) setJobReference(proj.job_reference);
  };
```

- [ ] **Step 5: Load FreeAgent connection status**

Add a separate `useEffect` after the existing main data-load effect:

```tsx
  useEffect(() => {
    if (!user || !isProUser) return;
    isFreeAgentConnected(user.id).then(setFaConnected);
  }, [user, isProUser]);
```

- [ ] **Step 6: Add export handler**

Add this function after `handleDownload` (after line 233):

```tsx
  const handleExportToFreeAgent = async () => {
    if (!user || selectedDays.length === 0) return;
    setFaExporting(true);
    setFaError(null);
    setFaInvoiceUrl(null);
    try {
      const payload: FreeAgentExportPayload = {
        clientName,
        projectName: selectedProject?.name ?? '',
        jobReference: jobReference || null,
        invoiceNumber,
        days: selectedDays.map(d => ({
          id: d.id,
          work_date: d.work_date,
          role_name: d.role_name,
          day_type: d.day_type,
          call_time: d.call_time,
          wrap_time: d.wrap_time,
          grand_total: d.grand_total,
        })),
        vatRegistered: false, // loaded from user_settings below
      };

      // Fetch vat_registered from user_settings
      const { data: settings } = await supabase
        .from('user_settings')
        .select('vat_registered')
        .eq('user_id', user.id)
        .single();
      payload.vatRegistered = settings?.vat_registered ?? false;

      const { invoiceUrl } = await exportToFreeAgent(user.id, payload);
      setFaInvoiceUrl(invoiceUrl);
    } catch (err: unknown) {
      setFaError(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setFaExporting(false);
    }
  };
```

- [ ] **Step 7: Add FreeAgent button and BookkeepingCTA to the action buttons area**

Find the action buttons `<div className="flex gap-2">` (around line 465). Replace the closing `</div>` and the hint text block that follows (down to the `{/* Invoice document */}` comment) with:

```tsx
          </div>

          {/* Bookkeeping export */}
          {isProUser && faConnected && (
            <div className="space-y-1">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleExportToFreeAgent}
                disabled={faExporting || selectedDays.length === 0}
              >
                {faExporting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : 'Send to FreeAgent'
                }
              </Button>
              {faInvoiceUrl && (
                <a
                  href={faInvoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs text-primary underline"
                >
                  View draft invoice in FreeAgent →
                </a>
              )}
              {faError && (
                <p className="text-xs text-destructive">{faError}</p>
              )}
            </div>
          )}

          {isProUser && !faConnected && <BookkeepingCTA />}

          {selectedDays.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">Select a job to enable download</p>
          )}
          {selectedDays.length > 0 && !clientEmail.trim() && (
            <p className="text-xs text-muted-foreground text-center">Add a client email address to enable sending</p>
          )}
```

- [ ] **Step 8: Verify the full flow**

Run `vercel dev`. With FreeAgent connected:
1. Go to InvoicePage, select a project with days
2. "Send to FreeAgent" button appears below the existing buttons
3. Click it — verify draft invoice appears in FreeAgent sandbox
4. "View draft invoice in FreeAgent →" link appears
5. Verify `invoice.reference` = the invoice number shown in the input
6. Verify `invoice.comments` = `"<project name> | <job ref>"` (or just project name if no ref)
7. Verify line items each have role, day type, date, call/wrap times

With FreeAgent **not** connected (Pro user): `BookkeepingCTA` appears, click leads to Settings → Integrations.

- [ ] **Step 9: Commit and push**

```bash
git add src/pages/InvoicePage.tsx
git commit -m "feat: add FreeAgent export button and BookkeepingCTA to InvoicePage"
git push
```

---

## Task 10: End-to-End Verification

- [ ] **Verify Vercel deploy succeeds** — check Vercel dashboard after push, confirm build passes
- [ ] **Production OAuth test** — go to `https://crewdock.app`, log in, Settings → Integrations → Connect FreeAgent (using your own account, not sandbox)
- [ ] **Export a real invoice** — select a project with days, click "Send to FreeAgent", confirm draft appears in your FreeAgent account
- [ ] **Check invoice fields** — `reference` = Crew Dock invoice number, `comments` = project + job ref, line items correct, currency GBP
- [ ] **Test token rotation** — in Supabase, manually set `expires_at` to 1 minute ago for your `bookkeeping_connections` row. Export again — verify it refreshes the token without error
- [ ] **Disconnect and reconnect** — Settings → Disconnect → verify row deleted in Supabase → reconnect → verify new row
- [ ] **Pro gate** — if you have a free-tier test account, verify the BookkeepingCTA appears and clicking leads to the billing section
- [ ] **VAT toggle** — enable VAT in Settings → Integrations → export invoice → verify `sales_tax_rate = "20.0"` in FreeAgent
