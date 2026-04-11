# Xero Integration — Build Plan
**APA Rate Calc · Bookkeeping Export Feature**

> Build this integration second, after FreeAgent. Xero has the highest UK market share overall and is the most requested accounting integration. It adds two new concepts over FreeAgent: PKCE for OAuth and multi-tenancy (a user can have multiple Xero organisations — you must ask which one to use).

---

## Context

APA Rate Calc is a Vite + React + TypeScript SaaS app using Supabase for auth and data storage. The existing `InvoicePage.tsx` already assembles invoice data (project name, client name, work days with `role_name`, `day_type`, `call_time`, `wrap_time`, `grand_total`) from Supabase. The goal is to add a "Send to Xero" button that pushes that data to Xero as a draft ACCREC invoice.

### Data being sent
| APA Rate Calc field | Xero field |
|---|---|
| `client_name` | `Contact.Name` |
| `project.name` | `Invoice.Reference` |
| `invoiceNumber` | `Invoice.InvoiceNumber` |
| `role_name + day_type + times` | `LineItem.Description` |
| `grand_total` (per day) | `LineItem.UnitAmount` |
| `work_date` | Appended to line item description |

---

## Prerequisites

1. Register an app at https://developer.xero.com/app/manage
2. App type: **Web app**
3. Set redirect URI to: `https://<your-domain>/auth/xero/callback`
4. Copy **Client ID** and **Client Secret** into environment variables:
   ```
   XERO_CLIENT_ID=
   XERO_CLIENT_SECRET=
   XERO_REDIRECT_URI=https://<your-domain>/auth/xero/callback
   ```
5. For development, add `http://localhost:5173/auth/xero/callback` as an additional redirect URI in the Xero app settings.

---

## API Reference

| Item | Value |
|---|---|
| Authorization URL | `https://login.xero.com/identity/connect/authorize` |
| Token URL | `https://identity.xero.com/connect/token` |
| Connections URL | `https://api.xero.com/connections` |
| Production base URL | `https://api.xero.com/api.xro/2.0/` |
| Sandbox | Use a free **Demo Company** in any Xero account (no separate URL — same API) |
| Required scopes | `openid profile email accounting.transactions accounting.contacts offline_access` |
| Grant type | `authorization_code` with **PKCE (S256)** |
| Access token lifetime | 30 minutes |
| Refresh token lifetime | 60 days |
| Rate limits | 60 API calls/minute per org · 5,000 calls/day |
| Required header on all API calls | `Xero-Tenant-Id: {tenantId}` |

---

## Phase 1 — Supabase Schema

Run this only if you haven't already created it for the FreeAgent integration:

```sql
CREATE TABLE IF NOT EXISTS bookkeeping_connections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('xero', 'quickbooks', 'freeagent')),
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  tenant_id     TEXT,   -- Xero: the selected organisation's tenantId
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

---

## Phase 2 — OAuth Backend Routes (with PKCE)

All routes must be **server-side** to protect the Client Secret. Use Vercel Serverless Functions (`/api/`) or Supabase Edge Functions.

### `/api/auth/xero/start.ts`

Generates a PKCE pair and redirects the user to Xero.

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

function base64URLEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Generate PKCE pair
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );
  const state = crypto.randomBytes(16).toString('hex');

  // Store verifier and state in short-lived cookies
  const cookieOpts = 'HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/';
  res.setHeader('Set-Cookie', [
    `xero_code_verifier=${codeVerifier}; ${cookieOpts}`,
    `xero_oauth_state=${state}; ${cookieOpts}`,
  ]);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: process.env.XERO_REDIRECT_URI!,
    scope: 'openid profile email accounting.transactions accounting.contacts offline_access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  res.redirect(`https://login.xero.com/identity/connect/authorize?${params}`);
}
```

### `/api/auth/xero/callback.ts`

Exchanges the code for tokens, fetches available tenants, stores the selection.

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query;

  if (error) return res.redirect(`/?error=xero_denied`);

  // Validate state
  const cookieState = req.cookies?.xero_oauth_state;
  if (!state || state !== cookieState) return res.redirect(`/?error=invalid_state`);

  const codeVerifier = req.cookies?.xero_code_verifier;
  if (!codeVerifier) return res.redirect(`/?error=missing_verifier`);

  // Exchange code + verifier for tokens
  const credentials = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: process.env.XERO_REDIRECT_URI!,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) return res.redirect(`/?error=xero_token_failed`);

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Fetch the user's Xero organisations (tenants)
  const tenantsRes = await fetch('https://api.xero.com/connections', {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` },
  });
  const tenants: { tenantId: string; tenantName: string }[] = await tenantsRes.json();

  // Get the APA Rate Calc user from their session JWT
  const jwt = req.cookies?.sb_access_token;
  const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);
  if (!user) return res.redirect(`/?error=not_logged_in`);

  // If only one tenant, store immediately
  // If multiple, redirect to a tenant-picker page passing the token temporarily
  // Simple approach for most users (one Xero org): store the first tenant
  const selectedTenant = tenants[0];

  await supabaseAdmin.from('bookkeeping_connections').upsert({
    user_id: user.id,
    platform: 'xero',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    tenant_id: selectedTenant.tenantId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform' });

  // Clear cookies
  res.setHeader('Set-Cookie', [
    'xero_code_verifier=; HttpOnly; Max-Age=0; Path=/',
    'xero_oauth_state=; HttpOnly; Max-Age=0; Path=/',
  ]);

  res.redirect(`/settings?connected=xero`);

  // NOTE: If you want to support multiple orgs, store tokens temporarily
  // (e.g. in a short-lived Supabase row or encrypted cookie), then redirect to
  // /settings/xero/pick-org where the user chooses from `tenants`.
  // The chosen tenantId is then stored in bookkeeping_connections.
}
```

### `/api/auth/xero/refresh.ts`

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { refresh_token } = req.body;

  const credentials = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch('https://identity.xero.com/connect/token', {
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

  // Update Supabase with new tokens (use service role client)
  // ... same upsert pattern as callback.ts

  res.json({ access_token: tokens.access_token, expires_at: expiresAt });
}
```

---

## Phase 3 — Frontend Service (`src/services/bookkeeping/xero.ts`)

```typescript
import { supabase } from '@/lib/supabase';

const BASE_URL = 'https://api.xero.com/api.xro/2.0';

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

async function getConnection(userId: string) {
  const { data, error } = await supabase
    .from('bookkeeping_connections')
    .select('access_token, refresh_token, expires_at, tenant_id')
    .eq('user_id', userId)
    .eq('platform', 'xero')
    .single();

  if (error || !data) throw new Error('Xero not connected. Please connect in Settings.');
  return data;
}

async function getValidToken(userId: string): Promise<{ accessToken: string; tenantId: string }> {
  const conn = await getConnection(userId);
  const isExpired = Date.now() > new Date(conn.expires_at).getTime() - 60_000;

  if (!isExpired) return { accessToken: conn.access_token, tenantId: conn.tenant_id };

  const res = await fetch('/api/auth/xero/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: conn.refresh_token }),
  });

  if (!res.ok) throw new Error('Xero session expired. Please reconnect in Settings.');

  const { access_token } = await res.json();
  return { accessToken: access_token, tenantId: conn.tenant_id };
}

// ── Contact lookup / creation ──────────────────────────────────────────────

async function findOrCreateContact(
  accessToken: string,
  tenantId: string,
  name: string
): Promise<string> {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Xero-Tenant-Id': tenantId,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  // Search by name
  const searchRes = await fetch(
    `${BASE_URL}/Contacts?where=Name%3D%3D%22${encodeURIComponent(name)}%22`,
    { headers }
  );

  if (!searchRes.ok) throw new Error('Failed to search Xero contacts');

  const searchData = await searchRes.json();
  const existing = searchData.Contacts?.[0];
  if (existing) return existing.ContactID;

  // Create new contact
  const createRes = await fetch(`${BASE_URL}/Contacts`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ Contacts: [{ Name: name }] }),
  });

  if (!createRes.ok) throw new Error('Failed to create Xero contact');

  const createData = await createRes.json();
  return createData.Contacts[0].ContactID;
}

// ── Invoice creation ───────────────────────────────────────────────────────

async function createInvoice(
  accessToken: string,
  tenantId: string,
  contactId: string,
  payload: ExportPayload
): Promise<string> {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Xero-Tenant-Id': tenantId,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  const taxType = payload.vatRegistered ? 'OUTPUT2' : 'NONE';

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const lineItems = payload.days.map(day => {
    const dayLabel = day.day_type.replace(/_/g, ' ');
    return {
      Description: `${day.role_name} — ${dayLabel} | ${day.work_date} | Call: ${day.call_time} Wrap: ${day.wrap_time}`,
      Quantity: 1,
      UnitAmount: day.grand_total,
      AccountCode: '200',  // Standard sales account — make configurable in Settings if needed
      TaxType: taxType,
    };
  });

  const body = {
    Invoices: [{
      Type: 'ACCREC',
      Contact: { ContactID: contactId },
      InvoiceNumber: payload.invoiceNumber,
      Reference: payload.projectName,
      Status: 'DRAFT',
      DateString: formatDate(new Date()),
      DueDateString: formatDate(dueDate),
      CurrencyCode: 'GBP',
      LineItems: lineItems,
    }],
  };

  const res = await fetch(`${BASE_URL}/Invoices`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create Xero invoice: ${err}`);
  }

  const data = await res.json();
  const invoiceId = data.Invoices[0].InvoiceID;

  // Return a deep link to the invoice in Xero
  return `https://go.xero.com/AccountsReceivable/Edit.aspx?InvoiceID=${invoiceId}`;
}

// ── Main export function ───────────────────────────────────────────────────

export async function exportToXero(
  userId: string,
  payload: ExportPayload
): Promise<{ invoiceUrl: string }> {
  const { accessToken, tenantId } = await getValidToken(userId);
  const contactId = await findOrCreateContact(accessToken, tenantId, payload.clientName);
  const invoiceUrl = await createInvoice(accessToken, tenantId, contactId, payload);
  return { invoiceUrl };
}

// ── Connection status check ────────────────────────────────────────────────

export async function isXeroConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bookkeeping_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'xero')
    .single();
  return !!data;
}
```

---

## Phase 4 — UI Changes

### `SettingsPage.tsx` — Connected Accounts section

```tsx
import { isXeroConnected } from '@/services/bookkeeping/xero';

const [xeroConnected, setXeroConnected] = useState(false);

useEffect(() => {
  if (user) isXeroConnected(user.id).then(setXeroConnected);
}, [user]);

useEffect(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('connected') === 'xero') setXeroConnected(true);
}, []);

// JSX:
<div className="space-y-2">
  <Label>Xero</Label>
  {xeroConnected ? (
    <div className="flex items-center gap-2">
      <Badge className="bg-[#13B5EA] text-white">Connected</Badge>
      <Button variant="ghost" size="sm" onClick={handleDisconnectXero}>Disconnect</Button>
    </div>
  ) : (
    <Button variant="outline" onClick={() => window.location.href = '/api/auth/xero/start'}>
      Connect to Xero
    </Button>
  )}
</div>
```

### `InvoicePage.tsx` — Export button

```tsx
import { exportToXero, isXeroConnected } from '@/services/bookkeeping/xero';

const [xeroConnected, setXeroConnected] = useState(false);
const [xeroExporting, setXeroExporting] = useState(false);
const [xeroInvoiceUrl, setXeroInvoiceUrl] = useState<string | null>(null);

useEffect(() => {
  if (user) isXeroConnected(user.id).then(setXeroConnected);
}, [user]);

const handleExportToXero = async () => {
  if (!user || selectedDays.length === 0) return;
  setXeroExporting(true);
  try {
    const { invoiceUrl } = await exportToXero(user.id, {
      clientName,
      projectName: selectedProject?.name ?? '',
      invoiceNumber,
      days: selectedDays,
      vatRegistered: userSettings?.vat_registered ?? false,
    });
    setXeroInvoiceUrl(invoiceUrl);
  } catch (err: any) {
    alert(err.message);
  } finally {
    setXeroExporting(false);
  }
};

// JSX — alongside Print/PDF button:
{xeroConnected && (
  <Button
    variant="outline"
    size="sm"
    onClick={handleExportToXero}
    disabled={xeroExporting || selectedDays.length === 0}
  >
    {xeroExporting ? 'Sending...' : 'Send to Xero'}
  </Button>
)}
{xeroInvoiceUrl && (
  <a href={xeroInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#13B5EA] underline">
    View draft invoice in Xero →
  </a>
)}
```

---

## Phase 5 — Multi-Org Support (Optional Enhancement)

If a user has more than one Xero organisation, the callback currently picks the first. To support a picker:

1. In the callback, if `tenants.length > 1`, store the tokens temporarily in a short-lived Supabase table row (`xero_pending_auth`) keyed by a random token.
2. Redirect to `/settings/xero/pick-org?token=XXX`.
3. That page fetches the pending auth, shows a list of org names, and on selection POSTs the chosen `tenantId` to `/api/auth/xero/confirm-org`, which moves the record to `bookkeeping_connections` with the correct `tenant_id`.

---

## Testing Checklist

- [ ] Enable a **Demo Company** inside your Xero account (My Xero → Demo Company)
- [ ] Complete OAuth flow — verify `tenant_id` and tokens are stored in `bookkeeping_connections`
- [ ] Verify PKCE: check that removing `code_verifier` from the token exchange causes a 400 error (confirming it is being validated by Xero)
- [ ] Export a single-day invoice — check draft appears in Xero Demo Company → Invoices
- [ ] Export a multi-day invoice — verify all line items are present with correct amounts
- [ ] Test token refresh: manually set `expires_at` to the past in Supabase, then trigger an export and verify a new token is fetched
- [ ] Test with VAT on and VAT off — verify `TaxType` is `OUTPUT2` vs `NONE`
- [ ] Test the `AccountCode: "200"` resolves correctly in Demo Company (check Xero chart of accounts)

---

## Notes on AccountCode

Xero requires a chart-of-accounts code on each line item. `"200"` is the default **Sales** account in standard Xero setups, but users with customised charts of accounts may need a different code. Consider adding an optional **Xero Sales Account Code** field to SettingsPage that defaults to `"200"`.

---

## Environment Variables Summary

```
# Server-side only — never expose in frontend
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=

# Already in use by APA Rate Calc
VITE_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```
