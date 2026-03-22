# QuickBooks Online Integration — Build Plan
**APA Rate Calc · Bookkeeping Export Feature**

> Build this integration third, after FreeAgent and Xero. QuickBooks Online uses standard OAuth 2.0 (no PKCE required). The main quirk unique to QBO is that invoice line items must reference an **Item** — you will create a "Film Crew Services" item on first connect and reuse its ID on every invoice.

---

## Context

APA Rate Calc is a Vite + React + TypeScript SaaS app using Supabase for auth and data storage. The existing `InvoicePage.tsx` already assembles invoice data (project name, client name, work days with `role_name`, `day_type`, `call_time`, `wrap_time`, `grand_total`) from Supabase. The goal is to add a "Send to QuickBooks" button that pushes that data to QuickBooks Online as a draft invoice.

### Data being sent
| APA Rate Calc field | QuickBooks field |
|---|---|
| `client_name` | `Customer.DisplayName` |
| `project.name` | `Invoice.PrivateNote` |
| `invoiceNumber` | `Invoice.DocNumber` |
| `role_name + day_type + times` | `Line.Description` |
| `grand_total` (per day) | `Line.Amount` + `SalesItemLineDetail.UnitPrice` |
| `work_date` | Appended to line description |

---

## Prerequisites

1. Register an app at https://developer.intuit.com
2. Select **QuickBooks Online and Payments**
3. Set redirect URI to: `https://<your-domain>/auth/qbo/callback`
4. Copy **Client ID** and **Client Secret** into environment variables:
   ```
   QBO_CLIENT_ID=
   QBO_CLIENT_SECRET=
   QBO_REDIRECT_URI=https://<your-domain>/auth/qbo/callback
   ```
5. The Intuit Developer portal gives you a **sandbox company** automatically — use it for all development.

---

## API Reference

| Item | Value |
|---|---|
| Authorization URL | `https://appcenter.intuit.com/connect/oauth2` |
| Token URL | `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` |
| Revoke URL | `https://developer.api.intuit.com/v2/oauth2/tokens/revoke` |
| Scope required | `com.intuit.quickbooks.accounting` |
| Grant type | `authorization_code` (standard — no PKCE required) |
| Access token lifetime | 1 hour |
| Refresh token lifetime | 100 days |
| Sandbox base URL | `https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}/` |
| Production base URL | `https://quickbooks.api.intuit.com/v3/company/{realmId}/` |
| Rate limits | 500 requests/minute (no daily cap) |
| Response format | JSON — include `Accept: application/json` on all requests |
| Key identifier | `realmId` — the company ID returned in the OAuth callback URL |

---

## Phase 1 — Supabase Schema

Run this only if you haven't already created it for the FreeAgent or Xero integrations:

```sql
CREATE TABLE IF NOT EXISTS bookkeeping_connections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('xero', 'quickbooks', 'freeagent')),
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  tenant_id     TEXT,   -- Xero only
  realm_id      TEXT,   -- QuickBooks: the company realmId
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

Also add a column to store the QBO Service Item ID (created on first connect):

```sql
ALTER TABLE bookkeeping_connections ADD COLUMN IF NOT EXISTS qbo_item_id TEXT;
```

---

## Phase 2 — OAuth Backend Routes

All routes must be **server-side** to protect the Client Secret. Use Vercel Serverless Functions (`/api/`) or Supabase Edge Functions.

### `/api/auth/qbo/start.ts`

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const state = crypto.randomBytes(16).toString('hex');

  res.setHeader('Set-Cookie', `qbo_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);

  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID!,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: process.env.QBO_REDIRECT_URI!,
    state,
  });

  res.redirect(`https://appcenter.intuit.com/connect/oauth2?${params}`);
}
```

### `/api/auth/qbo/callback.ts`

Captures `realmId` from the callback URL — this is the QBO company identifier and must be stored.

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, realmId, error } = req.query;

  if (error) return res.redirect(`/?error=qbo_denied`);

  // Validate state
  const cookieState = req.cookies?.qbo_oauth_state;
  if (!state || state !== cookieState) return res.redirect(`/?error=invalid_state`);

  // realmId MUST be captured here — it is only sent once in the OAuth callback
  if (!realmId) return res.redirect(`/?error=missing_realm_id`);

  // Exchange code for tokens using Basic Auth
  const credentials = Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) return res.redirect(`/?error=qbo_token_failed`);

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Get the APA Rate Calc user from their session JWT
  const jwt = req.cookies?.sb_access_token;
  const { data: { user } } = await supabaseAdmin.auth.getUser(jwt);
  if (!user) return res.redirect(`/?error=not_logged_in`);

  await supabaseAdmin.from('bookkeeping_connections').upsert({
    user_id: user.id,
    platform: 'quickbooks',
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    realm_id: realmId as string,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,platform' });

  res.setHeader('Set-Cookie', 'qbo_oauth_state=; HttpOnly; Max-Age=0; Path=/');

  // Redirect to a setup step that creates the Film Crew Services item
  res.redirect(`/settings?connected=quickbooks&setup=qbo`);
}
```

### `/api/auth/qbo/refresh.ts`

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { refresh_token } = req.body;

  const credentials = Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
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

  // Update Supabase with new tokens (use service role client)
  // ... same upsert pattern as callback.ts

  res.json({ access_token: tokens.access_token, expires_at: expiresAt });
}
```

---

## Phase 3 — Frontend Service (`src/services/bookkeeping/quickbooks.ts`)

```typescript
import { supabase } from '@/lib/supabase';

function getBaseUrl(realmId: string): string {
  const isDev = import.meta.env.DEV;
  const base = isDev
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
  return `${base}/v3/company/${realmId}`;
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

async function getConnection(userId: string) {
  const { data, error } = await supabase
    .from('bookkeeping_connections')
    .select('access_token, refresh_token, expires_at, realm_id, qbo_item_id')
    .eq('user_id', userId)
    .eq('platform', 'quickbooks')
    .single();

  if (error || !data) throw new Error('QuickBooks not connected. Please connect in Settings.');
  return data;
}

async function getValidToken(userId: string) {
  const conn = await getConnection(userId);
  const isExpired = Date.now() > new Date(conn.expires_at).getTime() - 60_000;

  if (!isExpired) return conn;

  const res = await fetch('/api/auth/qbo/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: conn.refresh_token }),
  });

  if (!res.ok) throw new Error('QuickBooks session expired. Please reconnect in Settings.');

  const { access_token } = await res.json();
  return { ...conn, access_token };
}

// ── Item setup (run once on first connect) ─────────────────────────────────

// Call this after OAuth connect if qbo_item_id is null.
// Creates a "Film Crew Services" non-inventory service item and stores its ID.
export async function setupQBOServiceItem(userId: string): Promise<void> {
  const conn = await getValidToken(userId);
  if (conn.qbo_item_id) return; // Already set up

  const BASE = getBaseUrl(conn.realm_id);
  const headers = {
    'Authorization': `Bearer ${conn.access_token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Check if item already exists (e.g. user reconnecting)
  const queryRes = await fetch(
    `${BASE}/query?query=${encodeURIComponent("SELECT * FROM Item WHERE Name = 'Film Crew Services'")}`,
    { headers }
  );
  const queryData = await queryRes.json();
  const existing = queryData.QueryResponse?.Item?.[0];

  let itemId: string;

  if (existing) {
    itemId = existing.Id;
  } else {
    // Create the item
    // IncomeAccountRef value "1" = Services (standard QBO account)
    // Adjust if the user's chart of accounts uses a different ID
    const createRes = await fetch(`${BASE}/item`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Name: 'Film Crew Services',
        Type: 'Service',
        IncomeAccountRef: { value: '1', name: 'Services' },
      }),
    });

    if (!createRes.ok) throw new Error('Failed to create QuickBooks service item');

    const createData = await createRes.json();
    itemId = createData.Item.Id;
  }

  // Store the item ID so we don't create it again
  await supabase
    .from('bookkeeping_connections')
    .update({ qbo_item_id: itemId })
    .eq('user_id', userId)
    .eq('platform', 'quickbooks');
}

// ── Customer lookup / creation ─────────────────────────────────────────────

async function findOrCreateCustomer(
  accessToken: string,
  realmId: string,
  displayName: string
): Promise<string> {
  const BASE = getBaseUrl(realmId);
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  // Query for existing customer
  const query = `SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`;
  const queryRes = await fetch(`${BASE}/query?query=${encodeURIComponent(query)}`, { headers });

  if (!queryRes.ok) throw new Error('Failed to query QuickBooks customers');

  const queryData = await queryRes.json();
  const existing = queryData.QueryResponse?.Customer?.[0];
  if (existing) return existing.Id;

  // Create new customer
  const createRes = await fetch(`${BASE}/customer`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      DisplayName: displayName,
      CompanyName: displayName,
    }),
  });

  if (!createRes.ok) throw new Error('Failed to create QuickBooks customer');

  const createData = await createRes.json();
  return createData.Customer.Id;
}

// ── Invoice creation ───────────────────────────────────────────────────────

async function createInvoice(
  accessToken: string,
  realmId: string,
  customerId: string,
  itemId: string,
  payload: ExportPayload
): Promise<string> {
  const BASE = getBaseUrl(realmId);
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const lines = payload.days.map(day => {
    const dayLabel = day.day_type.replace(/_/g, ' ');
    const description = `${day.role_name} — ${dayLabel} | ${day.work_date} | Call: ${day.call_time} Wrap: ${day.wrap_time}`;

    return {
      Amount: day.grand_total,
      DetailType: 'SalesItemLineDetail',
      Description: description,
      SalesItemLineDetail: {
        ItemRef: { value: itemId, name: 'Film Crew Services' },
        Qty: 1,
        UnitPrice: day.grand_total,
        // VAT: QBO UK uses TaxCodeRef — set "TAX" for VAT, "NON" for exempt
        ...(payload.vatRegistered
          ? { TaxCodeRef: { value: 'TAX' } }
          : { TaxCodeRef: { value: 'NON' } }),
      },
    };
  });

  const body = {
    DocNumber: payload.invoiceNumber,
    TxnDate: formatDate(new Date()),
    DueDate: formatDate(dueDate),
    CurrencyRef: { value: 'GBP' },
    CustomerRef: { value: customerId },
    PrivateNote: payload.projectName,
    Line: lines,
  };

  const res = await fetch(`${BASE}/invoice`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create QuickBooks invoice: ${err}`);
  }

  const data = await res.json();
  const invoiceId = data.Invoice.Id;

  // Deep link to the invoice in QBO
  const domain = import.meta.env.DEV ? 'sandbox.qbo.intuit.com' : 'qbo.intuit.com';
  return `https://${domain}/app/invoice?txnId=${invoiceId}`;
}

// ── Main export function ───────────────────────────────────────────────────

export async function exportToQuickBooks(
  userId: string,
  payload: ExportPayload
): Promise<{ invoiceUrl: string }> {
  const conn = await getValidToken(userId);

  if (!conn.qbo_item_id) {
    throw new Error('QuickBooks setup incomplete. Please visit Settings to finish setup.');
  }

  const customerId = await findOrCreateCustomer(conn.access_token, conn.realm_id, payload.clientName);
  const invoiceUrl = await createInvoice(conn.access_token, conn.realm_id, customerId, conn.qbo_item_id, payload);
  return { invoiceUrl };
}

// ── Connection status check ────────────────────────────────────────────────

export async function isQuickBooksConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bookkeeping_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'quickbooks')
    .single();
  return !!data;
}
```

---

## Phase 4 — UI Changes

### `SettingsPage.tsx` — Connected Accounts + Setup Step

The QBO connection requires one extra setup step after OAuth: creating the Film Crew Services item. Detect the `?setup=qbo` param on return from OAuth and trigger it.

```tsx
import { isQuickBooksConnected, setupQBOServiceItem } from '@/services/bookkeeping/quickbooks';

const [qboConnected, setQboConnected] = useState(false);
const [qboSetting, setQboSetting] = useState(false);

useEffect(() => {
  if (user) isQuickBooksConnected(user.id).then(setQboConnected);
}, [user]);

useEffect(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('connected') === 'quickbooks' && params.get('setup') === 'qbo' && user) {
    setQboSetting(true);
    setupQBOServiceItem(user.id)
      .then(() => { setQboConnected(true); setQboSetting(false); })
      .catch((err) => { alert(err.message); setQboSetting(false); });
  }
}, [user]);

// JSX:
<div className="space-y-2">
  <Label>QuickBooks Online</Label>
  {qboSetting ? (
    <Badge variant="secondary">Setting up…</Badge>
  ) : qboConnected ? (
    <div className="flex items-center gap-2">
      <Badge className="bg-[#2CA01C] text-white">Connected</Badge>
      <Button variant="ghost" size="sm" onClick={handleDisconnectQBO}>Disconnect</Button>
    </div>
  ) : (
    <Button variant="outline" onClick={() => window.location.href = '/api/auth/qbo/start'}>
      Connect to QuickBooks
    </Button>
  )}
</div>
```

### `InvoicePage.tsx` — Export button

```tsx
import { exportToQuickBooks, isQuickBooksConnected } from '@/services/bookkeeping/quickbooks';

const [qboConnected, setQboConnected] = useState(false);
const [qboExporting, setQboExporting] = useState(false);
const [qboInvoiceUrl, setQboInvoiceUrl] = useState<string | null>(null);

useEffect(() => {
  if (user) isQuickBooksConnected(user.id).then(setQboConnected);
}, [user]);

const handleExportToQBO = async () => {
  if (!user || selectedDays.length === 0) return;
  setQboExporting(true);
  try {
    const { invoiceUrl } = await exportToQuickBooks(user.id, {
      clientName,
      projectName: selectedProject?.name ?? '',
      invoiceNumber,
      days: selectedDays,
      vatRegistered: userSettings?.vat_registered ?? false,
    });
    setQboInvoiceUrl(invoiceUrl);
  } catch (err: any) {
    alert(err.message);
  } finally {
    setQboExporting(false);
  }
};

// JSX — alongside Print/PDF button:
{qboConnected && (
  <Button
    variant="outline"
    size="sm"
    onClick={handleExportToQBO}
    disabled={qboExporting || selectedDays.length === 0}
  >
    {qboExporting ? 'Sending...' : 'Send to QuickBooks'}
  </Button>
)}
{qboInvoiceUrl && (
  <a href={qboInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#2CA01C] underline">
    View draft invoice in QuickBooks →
  </a>
)}
```

---

## Phase 5 — VAT for UK QBO Accounts

QuickBooks Online UK uses a different VAT system from the US version. For UK accounts, the tax code values are:

| Scenario | TaxCodeRef value |
|---|---|
| VAT registered (20% standard) | `'TAX'` |
| Not VAT registered | `'NON'` |
| Zero-rated | `'Z'` |

The `vatRegistered` boolean from `user_settings` controls which value is sent. Default to `'NON'` for safety.

> **Important:** QBO UK accounts must have VAT enabled under Taxes → VAT settings inside QuickBooks. If the user's QBO account isn't set up for VAT, sending `TaxCodeRef: { value: 'TAX' }` will return an error. Catch this gracefully and prompt the user to set up VAT in QBO first.

---

## Testing Checklist

- [ ] Use the Intuit Developer sandbox (sandbox-quickbooks.api.intuit.com) — credentials are provided in the Developer Portal
- [ ] Complete OAuth flow — verify `realm_id` and tokens are stored correctly in `bookkeeping_connections`
- [ ] Trigger setup step — verify "Film Crew Services" item is created in sandbox QBO and `qbo_item_id` is stored
- [ ] Export a single-day invoice — check draft appears in QBO Invoicing section
- [ ] Export a multi-day invoice — verify all line items have correct amounts, descriptions, and item references
- [ ] Test token refresh: manually expire `expires_at` in Supabase, then trigger export and confirm refresh works
- [ ] Test VAT on/off — verify `TaxCodeRef` changes correctly
- [ ] Test duplicate customer: export twice for the same client — confirm no duplicate customer is created
- [ ] Test disconnect and reconnect — confirm `qbo_item_id` is reused rather than a duplicate item created

---

## Notes on IncomeAccountRef

When creating the "Film Crew Services" item, the `IncomeAccountRef` value `"1"` maps to the standard **Services** income account in a fresh QBO UK company. If the user has a customised chart of accounts, this ID may differ. To handle this robustly, query `GET /account?type=Income` first and let the user pick the account — or default to `"1"` and show a note in Settings like *"Invoices export to the Services income account. Change this in QuickBooks if needed."*

---

## Environment Variables Summary

```
# Server-side only — never expose in frontend
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=

# Already in use by APA Rate Calc
VITE_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```
