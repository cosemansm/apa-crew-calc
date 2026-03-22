# FreeAgent Integration — Build Plan
**APA Rate Calc · Bookkeeping Export Feature**

> Build this integration first. It has the simplest OAuth flow (no PKCE, no multi-tenant) and is the most popular platform among UK freelancers. Use it to validate the shared architecture before building Xero and QuickBooks.

---

## Context

APA Rate Calc is a Vite + React + TypeScript SaaS app using Supabase for auth and data storage. The existing `InvoicePage.tsx` already assembles invoice data (project name, client name, work days with `role_name`, `day_type`, `call_time`, `wrap_time`, `grand_total`) from Supabase. The goal is to add a "Send to FreeAgent" button that pushes that data to FreeAgent as a draft invoice.

### Data being sent
| APA Rate Calc field | FreeAgent field |
|---|---|
| `client_name` | `contact.organisation_name` |
| `project.name` | `invoice.comments` |
| `invoiceNumber` | `invoice.reference` |
| `work_date` | line item context |
| `role_name + day_type` | `invoice_item.description` |
| `call_time – wrap_time` | appended to description |
| `grand_total` (per day) | `invoice_item.price` |

---

## Prerequisites

1. Register an app at https://dev.freeagent.com
2. Set redirect URI to: `https://<your-domain>/auth/freeagent/callback`
3. Copy **Client ID** and **Client Secret** into environment variables:
   ```
   FREEAGENT_CLIENT_ID=
   FREEAGENT_CLIENT_SECRET=
   FREEAGENT_REDIRECT_URI=https://<your-domain>/auth/freeagent/callback
   ```
4. For development, register a second app pointing to `http://localhost:5173/auth/freeagent/callback` and use the sandbox URL.

---

## API Reference

| Item | Value |
|---|---|
| Authorization URL | `https://api.freeagent.com/v2/approve_app` |
| Token URL | `https://api.freeagent.com/v2/token_endpoint` |
| Production base URL | `https://api.freeagent.com/v2/` |
| Sandbox base URL | `https://api.sandbox.freeagent.com/v2/` |
| Auth method | HTTP Basic Auth (Client ID as username, Client Secret as password) |
| Access token lifetime | 1 hour (`expires_in: 3600`) |
| Refresh token | Long-lived; rotates on every refresh — always store the new one |
| Grant type | `authorization_code` |
| Response format | JSON — include `Accept: application/json` on all requests |

---

## Phase 1 — Supabase Schema

Run this in the Supabase SQL editor. This table is shared across all three bookkeeping integrations — only create it once.

```sql
CREATE TABLE IF NOT EXISTS bookkeeping_connections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('xero', 'quickbooks', 'freeagent')),
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  tenant_id     TEXT,   -- Xero only
  realm_id      TEXT,   -- QuickBooks only
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, platform)
);

ALTER TABLE bookkeeping_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own connections"
  ON bookkeeping_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Also add a `vat_registered` boolean to `user_settings` if it doesn't exist:

```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN DEFAULT false;
```

---

## Phase 2 — OAuth Backend Routes

These must be **server-side** to protect the Client Secret. Use Vercel Serverless Functions (`/api/` directory) or Supabase Edge Functions.

### `/api/auth/freeagent/start.ts`

Redirects the user to FreeAgent's authorization page.

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const state = crypto.randomBytes(16).toString('hex');

  // Store state in a short-lived cookie or pass it through session
  res.setHeader('Set-Cookie', `fa_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);

  const params = new URLSearchParams({
    client_id: process.env.FREEAGENT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.FREEAGENT_REDIRECT_URI!,
    state,
  });

  res.redirect(`https://api.freeagent.com/v2/approve_app?${params}`);
}
```

### `/api/auth/freeagent/callback.ts`

Exchanges the authorization code for tokens and stores them in Supabase.

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // service role — never expose this client-side
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(`/?error=freeagent_denied`);

  // Validate state from cookie
  const cookieState = req.cookies?.fa_oauth_state;
  if (!state || state !== cookieState) return res.redirect(`/?error=invalid_state`);

  // Exchange code for tokens using Basic Auth
  const credentials = Buffer.from(
    `${process.env.FREEAGENT_CLIENT_ID}:${process.env.FREEAGENT_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch('https://api.freeagent.com/v2/token_endpoint', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: process.env.FREEAGENT_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) return res.redirect(`/?error=freeagent_token_failed`);

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Get the Supabase user from the session cookie/JWT
  // The user must be logged into APA Rate Calc — pass their JWT in a cookie or query param
  const authHeader = req.headers.authorization;
  const jwt = authHeader?.replace('Bearer ', '') ?? req.cookies?.sb_access_token;
  const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);

  if (!user) return res.redirect(`/?error=not_logged_in`);

  await supabaseAdmin.from('bookkeeping_connections').upsert({
    user_id: user.id,
    platform: 'freeagent',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform' });

  // Clear state cookie and redirect to settings
  res.setHeader('Set-Cookie', `fa_oauth_state=; HttpOnly; Max-Age=0; Path=/`);
  res.redirect(`/settings?connected=freeagent`);
}
```

---

## Phase 3 — Frontend Service (`src/services/bookkeeping/freeagent.ts`)

```typescript
import { supabase } from '@/lib/supabase';

const BASE_URL = import.meta.env.DEV
  ? 'https://api.sandbox.freeagent.com/v2'
  : 'https://api.freeagent.com/v2';

// ── Types ─────────────────────────────────────────────────────────────────

export interface BookingConnection {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface InvoiceDay {
  id: string;
  work_date: string;
  role_name: string;
  day_type: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
}

export interface ExportPayload {
  clientName: string;
  projectName: string;
  invoiceNumber: string;
  days: InvoiceDay[];
  vatRegistered: boolean;
}

// ── Token helpers ──────────────────────────────────────────────────────────

async function getValidToken(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('bookkeeping_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('platform', 'freeagent')
    .single();

  if (error || !data) throw new Error('FreeAgent not connected. Please connect in Settings.');

  const expiresAt = new Date(data.expires_at).getTime();
  const isExpired = Date.now() > expiresAt - 60_000; // refresh 60s before expiry

  if (!isExpired) return data.access_token;

  // Refresh the token via our backend route (keeps secret server-side)
  const res = await fetch('/api/auth/freeagent/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: data.refresh_token }),
  });

  if (!res.ok) throw new Error('FreeAgent session expired. Please reconnect in Settings.');

  const newTokens = await res.json();
  return newTokens.access_token;
}

// ── Contact lookup / creation ──────────────────────────────────────────────

async function findOrCreateContact(accessToken: string, organisationName: string): Promise<string> {
  // List all contacts (FreeAgent doesn't support name-based query params)
  const res = await fetch(`${BASE_URL}/contacts?view=all`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch FreeAgent contacts');

  const { contacts } = await res.json();
  const match = contacts?.find(
    (c: any) => c.organisation_name?.toLowerCase() === organisationName.toLowerCase()
  );

  if (match) return match.url; // e.g. "https://api.freeagent.com/v2/contacts/70"

  // Create new contact
  const createRes = await fetch(`${BASE_URL}/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      contact: { organisation_name: organisationName },
    }),
  });

  if (!createRes.ok) throw new Error('Failed to create FreeAgent contact');

  // Contact URL is in the Location response header
  const contactUrl = createRes.headers.get('Location');
  if (!contactUrl) throw new Error('FreeAgent contact created but no URL returned');

  return contactUrl;
}

// ── Invoice creation ───────────────────────────────────────────────────────

async function createInvoice(
  accessToken: string,
  contactUrl: string,
  payload: ExportPayload
): Promise<string> {
  const taxRate = payload.vatRegistered ? '20.0' : '0.0';

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const invoiceItems = payload.days.map(day => {
    const dayLabel = day.day_type.replace(/_/g, ' ');
    const description = `${day.role_name} — ${dayLabel} | ${day.work_date} | Call: ${day.call_time} Wrap: ${day.wrap_time}`;
    return {
      description,
      item_type: 'Days',
      quantity: '1.0',
      price: day.grand_total.toFixed(2),
      sales_tax_rate: taxRate,
    };
  });

  const body = {
    invoice: {
      contact: contactUrl,
      reference: payload.invoiceNumber,
      dated_on: new Date().toISOString().split('T')[0],
      due_on: dueDate.toISOString().split('T')[0],
      payment_terms_in_days: 30,
      currency: 'GBP',
      comments: payload.projectName,
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

  // Return the URL of the created invoice from the Location header
  const invoiceUrl = res.headers.get('Location') ?? '';
  return invoiceUrl;
}

// ── Main export function ───────────────────────────────────────────────────

export async function exportToFreeAgent(
  userId: string,
  payload: ExportPayload
): Promise<{ invoiceUrl: string }> {
  const accessToken = await getValidToken(userId);
  const contactUrl = await findOrCreateContact(accessToken, payload.clientName);
  const invoiceUrl = await createInvoice(accessToken, contactUrl, payload);
  return { invoiceUrl };
}

// ── Connection status check ────────────────────────────────────────────────

export async function isFreeAgentConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bookkeeping_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'freeagent')
    .single();
  return !!data;
}
```

Also add a refresh token backend route at `/api/auth/freeagent/refresh.ts`:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { refresh_token } = req.body;

  const credentials = Buffer.from(
    `${process.env.FREEAGENT_CLIENT_ID}:${process.env.FREEAGENT_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch('https://api.freeagent.com/v2/token_endpoint', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    }),
  });

  if (!tokenRes.ok) return res.status(401).json({ error: 'refresh_failed' });

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Update Supabase — use service role client here
  // (omitted for brevity — same upsert pattern as callback.ts)

  res.json({ access_token: tokens.access_token, expires_at: expiresAt });
}
```

---

## Phase 4 — UI Changes

### `SettingsPage.tsx` — Add a "Connected Accounts" section

```tsx
import { isFreeAgentConnected } from '@/services/bookkeeping/freeagent';

// In the component:
const [faConnected, setFaConnected] = useState(false);

useEffect(() => {
  if (user) isFreeAgentConnected(user.id).then(setFaConnected);
}, [user]);

// Check URL params on mount for post-OAuth redirect feedback:
useEffect(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('connected') === 'freeagent') setFaConnected(true);
}, []);

// JSX:
<div className="space-y-2">
  <Label>FreeAgent</Label>
  {faConnected ? (
    <div className="flex items-center gap-2">
      <Badge variant="default" className="bg-green-600">Connected</Badge>
      <Button variant="ghost" size="sm" onClick={handleDisconnectFreeAgent}>Disconnect</Button>
    </div>
  ) : (
    <Button variant="outline" onClick={() => window.location.href = '/api/auth/freeagent/start'}>
      Connect to FreeAgent
    </Button>
  )}
</div>
```

### `InvoicePage.tsx` — Add export button

```tsx
import { exportToFreeAgent, isFreeAgentConnected } from '@/services/bookkeeping/freeagent';

// In the component:
const [faConnected, setFaConnected] = useState(false);
const [faExporting, setFaExporting] = useState(false);
const [faInvoiceUrl, setFaInvoiceUrl] = useState<string | null>(null);

useEffect(() => {
  if (user) isFreeAgentConnected(user.id).then(setFaConnected);
}, [user]);

const handleExportToFreeAgent = async () => {
  if (!user || selectedDays.length === 0) return;
  setFaExporting(true);
  try {
    const { invoiceUrl } = await exportToFreeAgent(user.id, {
      clientName,
      projectName: selectedProject?.name ?? '',
      invoiceNumber,
      days: selectedDays,
      vatRegistered: userSettings?.vat_registered ?? false,
    });
    setFaInvoiceUrl(invoiceUrl);
  } catch (err: any) {
    alert(err.message);
  } finally {
    setFaExporting(false);
  }
};

// JSX — add alongside the Print/PDF button:
{faConnected && (
  <Button
    variant="outline"
    size="sm"
    onClick={handleExportToFreeAgent}
    disabled={faExporting || selectedDays.length === 0}
  >
    {faExporting ? 'Sending...' : 'Send to FreeAgent'}
  </Button>
)}
{faInvoiceUrl && (
  <a href={faInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline">
    View draft invoice in FreeAgent →
  </a>
)}
```

---

## Phase 5 — VAT Setting

In `SettingsPage.tsx`, add a VAT toggle and save it to `user_settings.vat_registered`:

```tsx
<div className="flex items-center gap-3">
  <Switch
    checked={vatRegistered}
    onCheckedChange={(val) => {
      setVatRegistered(val);
      supabase.from('user_settings')
        .update({ vat_registered: val })
        .eq('user_id', user.id);
    }}
  />
  <Label>I am VAT registered (adds 20% to exported invoices)</Label>
</div>
```

---

## Testing Checklist

- [ ] Register a sandbox app at dev.freeagent.com (separate from production app)
- [ ] Set `VITE_DEV=true` or use `import.meta.env.DEV` to route to `api.sandbox.freeagent.com`
- [ ] Complete OAuth flow in dev — verify tokens are stored in `bookkeeping_connections`
- [ ] Export a single-day invoice — check draft appears in FreeAgent sandbox
- [ ] Export a multi-day invoice — verify all line items are present
- [ ] Wait 1 hour and verify refresh token flow works correctly
- [ ] Test disconnect and reconnect flow in Settings
- [ ] Test with VAT on and VAT off — verify `sales_tax_rate` changes

---

## Environment Variables Summary

```
# Server-side only — never expose in frontend
FREEAGENT_CLIENT_ID=
FREEAGENT_CLIENT_SECRET=
FREEAGENT_REDIRECT_URI=

# Already in use by APA Rate Calc
VITE_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```
