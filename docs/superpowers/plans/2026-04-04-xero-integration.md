# Xero Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Xero OAuth integration to Crew Dock so Pro users can push draft ACCREC invoices from InvoicePage directly to their Xero organisation.

**Architecture:** Three Vercel serverless functions handle the OAuth PKCE flow server-side (`start`, `callback`, `refresh`). A frontend service (`src/services/bookkeeping/xero.ts`) mirrors the FreeAgent service pattern — token management, contact lookup/creation, invoice building. SettingsPage and InvoicePage get Xero-specific state and UI mirroring the FreeAgent integration exactly.

**Tech Stack:** TypeScript, Vercel Serverless Functions (`@vercel/node`), Supabase JS client, Xero Accounting API v2, PKCE (S256), React + shadcn/ui

---

## Key Decisions (read before touching code)

1. **No cookies for PKCE** — the FreeAgent lessons learned showed that `SameSite=Lax` cookies are dropped during cross-site OAuth redirects in production. For PKCE, encode `{ userId, codeVerifier }` together as base64url JSON in the `state` param — no cookies needed at all.

2. **No invoice number sent** — Xero auto-numbers invoices. Crew Dock invoice number goes in the `Reference` field (visible on the Xero invoice PDF). Job reference goes there too: `"INV-ABC123 | PepsiShoot | JB-2025-042"`.

3. **Xero account code `"200"`** — hard-coded to the standard UK Xero Sales account for now. A comment in the service explains how to make it configurable.

4. **Multi-tenant: first org wins** — If the user has multiple Xero orgs, pick the first. Full org picker is Phase 5 in the original BUILD_PLAN_XERO.md and is out of scope here.

5. **Basic / Detailed toggle** — match FreeAgent quality. Xero LineItems use the same `isHourlyItem` heuristic to distinguish day-rate from hourly items. Equipment and expenses are always separate line items.

6. **`XeroAuthError`** — same pattern as `FreeAgentAuthError`. Thrown on any 401 from Xero API. Caught in InvoicePage to flip `xeroConnected` to false and show reconnect prompt.

7. **DB schema is ready** — `bookkeeping_connections` already has `tenant_id TEXT`. No migration needed.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `api/auth/xero/start.ts` | Generate PKCE pair, encode state, redirect to Xero |
| Create | `api/auth/xero/callback.ts` | Exchange code+verifier for tokens, fetch tenants, store in DB |
| Create | `api/auth/xero/refresh.ts` | Refresh access token, update DB |
| Create | `src/services/bookkeeping/xero.ts` | Token helpers, contact lookup/creation, line item builder, invoice creation |
| Modify | `src/pages/SettingsPage.tsx` | Add xero state + disconnect, replace "Coming Soon" Xero row with live UI |
| Modify | `src/pages/InvoicePage.tsx` | Add xero state + export handler + Basic/Detailed toggle + export button |
| Modify | `src/components/BookkeepingCTA.tsx` | Check both FreeAgent and Xero before showing CTA |

---

## Task 1: Backend — Xero OAuth Start Route

**Files:**
- Create: `api/auth/xero/start.ts`

- [ ] **Step 1: Create the file**

```typescript
// api/auth/xero/start.ts
// Vercel Serverless Function — initiates Xero OAuth flow with PKCE
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64URLEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'xero_not_configured' });
  }

  const userId = req.query.userId as string;
  if (!userId || !UUID_RE.test(userId)) {
    return res.status(400).json({ error: 'missing_or_invalid_user_id' });
  }

  // PKCE S256 — no cookies needed; verifier travels in state alongside userId
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );

  // Encode both userId and codeVerifier in state as base64url JSON
  const state = Buffer.from(JSON.stringify({ userId, codeVerifier })).toString('base64url');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email accounting.transactions accounting.contacts offline_access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  res.redirect(`https://login.xero.com/identity/connect/authorize?${params}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add api/auth/xero/start.ts
git commit -m "feat: add Xero OAuth start route with PKCE"
```

---

## Task 2: Backend — Xero OAuth Callback Route

**Files:**
- Create: `api/auth/xero/callback.ts`

- [ ] **Step 1: Create the file**

```typescript
// api/auth/xero/callback.ts
// Vercel Serverless Function — exchanges Xero auth code for tokens, stores in Supabase
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect(`/settings?error=xero_not_configured`);
  }

  const { code, state, error } = req.query;
  const codeStr = Array.isArray(code) ? code[0] : code;
  const stateStr = Array.isArray(state) ? state[0] : state;

  if (error) return res.redirect(`/settings?error=xero_denied`);
  if (!codeStr || !stateStr) return res.redirect(`/settings?error=invalid_callback`);

  // Decode state to extract userId and codeVerifier
  let userId: string;
  let codeVerifier: string;
  try {
    const parsed = JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf-8'));
    userId = parsed.userId;
    codeVerifier = parsed.codeVerifier;
    if (!userId || !codeVerifier) throw new Error('missing fields');
  } catch {
    return res.redirect(`/settings?error=invalid_state`);
  }

  // Exchange code + PKCE verifier for tokens
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let tokenRes: Response;
  try {
    tokenRes = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: codeStr,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return res.redirect(`/settings?error=xero_token_failed`);
  }

  if (!tokenRes.ok) {
    console.error('Xero token exchange failed:', await tokenRes.text());
    return res.redirect(`/settings?error=xero_token_failed`);
  }

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    console.error('Xero token response missing access_token:', tokens);
    return res.redirect(`/settings?error=xero_token_failed`);
  }

  // Fetch the user's Xero organisations (tenants)
  let tenants: { tenantId: string; tenantName: string }[] = [];
  try {
    const tenantsRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (tenantsRes.ok) {
      tenants = await tenantsRes.json();
    }
  } catch {
    // If tenant fetch fails, we still store tokens — the first export will fail gracefully
    console.error('Xero tenant fetch failed');
  }

  const selectedTenant = tenants[0] ?? null;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: dbError } = await supabaseAdmin
    .from('bookkeeping_connections')
    .upsert(
      {
        user_id: userId,
        platform: 'xero',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        tenant_id: selectedTenant?.tenantId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    );

  if (dbError) {
    console.error('Failed to store Xero tokens:', dbError);
    return res.redirect(`/settings?error=xero_db_failed`);
  }

  res.redirect(`/settings?connected=xero`);
}
```

- [ ] **Step 2: Commit**

```bash
git add api/auth/xero/callback.ts
git commit -m "feat: add Xero OAuth callback route"
```

---

## Task 3: Backend — Xero Token Refresh Route

**Files:**
- Create: `api/auth/xero/refresh.ts`

- [ ] **Step 1: Create the file**

```typescript
// api/auth/xero/refresh.ts
// Vercel Serverless Function — refreshes Xero access token and stores the new tokens
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'xero_not_configured' });
  }

  const { refresh_token, user_id } = req.body as { refresh_token?: string; user_id?: string };
  if (!refresh_token || !user_id) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let tokenRes: Response;
  try {
    tokenRes = await fetch(XERO_TOKEN_URL, {
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
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return res.status(503).json({ error: 'xero_unreachable' });
  }

  if (!tokenRes.ok) return res.status(401).json({ error: 'refresh_failed' });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return res.status(401).json({ error: 'refresh_failed' });
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Xero refresh tokens do NOT rotate (unlike FreeAgent) but we store the new one anyway
  const { error: dbError } = await supabaseAdmin
    .from('bookkeeping_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user_id)
    .eq('platform', 'xero');

  if (dbError) {
    console.error('Failed to update Xero tokens:', dbError);
    return res.status(500).json({ error: 'db_write_failed' });
  }

  res.json({ access_token: tokens.access_token, expires_at: expiresAt });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/auth/xero/refresh.ts
git commit -m "feat: add Xero token refresh route"
```

---

## Task 4: Frontend Service — `src/services/bookkeeping/xero.ts`

**Files:**
- Create: `src/services/bookkeeping/xero.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/services/bookkeeping/xero.ts
import { supabase } from '@/lib/supabase';

const XERO_BASE = 'https://api.xero.com/api.xro/2.0';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoiceDay {
  id: string;
  work_date: string;
  role_name: string;
  day_type: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
  result_json?: {
    lineItems?: { description: string; hours?: number; rate?: number; total: number; timeFrom?: string; timeTo?: string }[];
    penalties?: { description: string; hours?: number; rate?: number; total: number }[];
    travelPay?: number;
    mileage?: number;
    mileageMiles?: number;
    equipmentTotal?: number;
    equipmentDiscount?: number;
  };
  expenses_amount?: number;
  expenses_notes?: string;
}

export interface XeroExportPayload {
  clientName: string;
  projectName: string;
  jobReference: string | null;
  invoiceNumber: string;
  days: InvoiceDay[];
  vatRegistered: boolean;
  detailed: boolean;
}

// Thrown on any 401 from Xero — signals the UI to prompt reconnect
export class XeroAuthError extends Error {
  constructor() {
    super('XERO_AUTH_ERROR');
    this.name = 'XeroAuthError';
  }
}

// ── Token helpers ─────────────────────────────────────────────────────────────

async function getValidToken(userId: string): Promise<{ accessToken: string; tenantId: string }> {
  const { data, error } = await supabase
    .from('bookkeeping_connections')
    .select('access_token, refresh_token, expires_at, tenant_id')
    .eq('user_id', userId)
    .eq('platform', 'xero')
    .single();

  if (error || !data) {
    throw new Error('Xero not connected. Please connect in Settings.');
  }

  if (!data.tenant_id) {
    throw new Error('No Xero organisation found. Please reconnect in Settings.');
  }

  const isExpired = Date.now() > new Date(data.expires_at).getTime() - 60_000;

  if (!isExpired) {
    return { accessToken: data.access_token, tenantId: data.tenant_id };
  }

  const res = await fetch('/api/auth/xero/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: data.refresh_token, user_id: userId }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new XeroAuthError();

  interface RefreshResponse { access_token: string; expires_at: string; }
  const newTokens = await res.json() as RefreshResponse;
  if (!newTokens.access_token) throw new Error('Xero token refresh returned no access token.');

  return { accessToken: newTokens.access_token, tenantId: data.tenant_id };
}

// ── Contact lookup / creation ─────────────────────────────────────────────────

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

  // Search by name using Xero's searchTerm param, then case-insensitive match locally
  const searchRes = await fetch(
    `${XERO_BASE}/Contacts?searchTerm=${encodeURIComponent(name)}&includeArchived=false`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );

  if (!searchRes.ok) {
    if (searchRes.status === 401) throw new XeroAuthError();
    const body = await searchRes.text().catch(() => '');
    throw new Error(`Failed to search Xero contacts (${searchRes.status}): ${body}`);
  }

  const searchData = await searchRes.json() as { Contacts?: { ContactID: string; Name: string }[] };
  const existing = (searchData.Contacts ?? []).find(
    (c) => c.Name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing.ContactID;

  // Create new contact
  const createRes = await fetch(`${XERO_BASE}/Contacts`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ Contacts: [{ Name: name }] }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!createRes.ok) {
    if (createRes.status === 401) throw new XeroAuthError();
    throw new Error('Failed to create Xero contact.');
  }

  const createData = await createRes.json() as { Contacts?: { ContactID: string }[] };
  const contactId = createData.Contacts?.[0]?.ContactID;
  if (!contactId) throw new Error('Xero contact created but no ContactID returned.');
  return contactId;
}

// ── Line item builder ─────────────────────────────────────────────────────────

type XeroLineItem = {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  AccountCode: string;
  TaxType: string;
};

// AccountCode "200" = standard UK Xero Sales account.
// If a user has a customised chart of accounts they may need a different code.
// Future: add a "Xero Sales Account Code" field to SettingsPage defaulting to "200".
const XERO_ACCOUNT_CODE = '200';

function buildXeroDayLineItems(day: InvoiceDay, taxType: string, detailed: boolean): XeroLineItem[] {
  const items: XeroLineItem[] = [];
  const rj = day.result_json ?? {};
  const equipmentNet = (rj.equipmentTotal ?? 0) - (rj.equipmentDiscount ?? 0);
  const expensesAmount = day.expenses_amount ?? 0;

  const hasDetailedData = (rj.lineItems?.length ?? 0) > 0;

  // Same heuristic as FreeAgent: 5% relative tolerance to separate day-rate from hourly items
  const isHourlyItem = (hours: number | undefined, rate: number | undefined, total: number) =>
    hours != null &&
    rate != null &&
    total > 0 &&
    Math.abs(hours * rate - total) / total < 0.05;

  if (detailed && hasDetailedData) {
    for (const li of rj.lineItems ?? []) {
      const timeStr = li.timeFrom && li.timeTo ? ` | ${li.timeFrom}–${li.timeTo}` : '';
      const hourly = isHourlyItem(li.hours, li.rate, li.total);
      items.push({
        Description: `${li.description}${timeStr} | ${day.work_date}`,
        Quantity: hourly ? li.hours! : 1,
        UnitAmount: hourly ? li.rate! : li.total,
        AccountCode: XERO_ACCOUNT_CODE,
        TaxType: taxType,
      });
    }

    for (const p of rj.penalties ?? []) {
      const hourly = isHourlyItem(p.hours, p.rate, p.total);
      items.push({
        Description: `${p.description} | ${day.work_date}`,
        Quantity: hourly ? p.hours! : 1,
        UnitAmount: hourly ? p.rate! : p.total,
        AccountCode: XERO_ACCOUNT_CODE,
        TaxType: taxType,
      });
    }

    if ((rj.travelPay ?? 0) > 0) {
      items.push({
        Description: `Travel Pay | ${day.work_date}`,
        Quantity: 1,
        UnitAmount: rj.travelPay!,
        AccountCode: XERO_ACCOUNT_CODE,
        TaxType: taxType,
      });
    }

    if ((rj.mileage ?? 0) > 0) {
      const milesStr = rj.mileageMiles ? ` (${rj.mileageMiles} miles)` : '';
      items.push({
        Description: `Mileage${milesStr} | ${day.work_date}`,
        Quantity: 1,
        UnitAmount: rj.mileage!,
        AccountCode: XERO_ACCOUNT_CODE,
        TaxType: taxType,
      });
    }
  } else {
    // Basic: one item per day (day total minus equipment and expenses)
    const dayTotal = day.grand_total - equipmentNet - expensesAmount;
    items.push({
      Description: `${day.role_name} — ${day.day_type.replace(/_/g, ' ')} | ${day.work_date} | Call: ${day.call_time} Wrap: ${day.wrap_time}`,
      Quantity: 1,
      UnitAmount: dayTotal,
      AccountCode: XERO_ACCOUNT_CODE,
      TaxType: taxType,
    });
  }

  // Equipment — always a separate line item
  if (equipmentNet > 0) {
    items.push({
      Description: `Equipment | ${day.work_date}`,
      Quantity: 1,
      UnitAmount: equipmentNet,
      AccountCode: XERO_ACCOUNT_CODE,
      TaxType: taxType,
    });
  }

  // Expenses — always a separate line item
  if (expensesAmount > 0) {
    const expDesc = day.expenses_notes
      ? `Expenses — ${day.expenses_notes} | ${day.work_date}`
      : `Expenses | ${day.work_date}`;
    items.push({
      Description: expDesc,
      Quantity: 1,
      UnitAmount: expensesAmount,
      AccountCode: XERO_ACCOUNT_CODE,
      TaxType: taxType,
    });
  }

  return items;
}

// ── Invoice creation ──────────────────────────────────────────────────────────

async function createInvoice(
  accessToken: string,
  tenantId: string,
  contactId: string,
  payload: XeroExportPayload
): Promise<string> {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Xero-Tenant-Id': tenantId,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  // OUTPUT2 = Standard rated (20%) VAT in UK Xero. NONE = no VAT.
  const taxType = payload.vatRegistered ? 'OUTPUT2' : 'NONE';

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  // Reference field: "INV-ABC | Project Name | Job Reference" (visible on invoice PDF)
  const referenceParts = [payload.invoiceNumber, payload.projectName];
  if (payload.jobReference) referenceParts.push(payload.jobReference);
  const reference = referenceParts.join(' | ');

  const lineItems = payload.days.flatMap(day => buildXeroDayLineItems(day, taxType, payload.detailed));

  const body = {
    Invoices: [{
      Type: 'ACCREC',
      Contact: { ContactID: contactId },
      // No InvoiceNumber — Xero assigns its own. Our ref goes in Reference.
      Reference: reference,
      Status: 'DRAFT',
      DateString: formatDate(new Date()),
      DueDateString: formatDate(dueDate),
      CurrencyCode: 'GBP',
      LineItems: lineItems,
    }],
  };

  const res = await fetch(`${XERO_BASE}/Invoices`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    if (res.status === 401) throw new XeroAuthError();
    const err = await res.text();
    throw new Error(`Failed to create Xero invoice: ${err}`);
  }

  const data = await res.json() as { Invoices?: { InvoiceID: string }[] };
  const invoiceId = data.Invoices?.[0]?.InvoiceID;
  if (!invoiceId) throw new Error('Xero invoice created but no InvoiceID returned.');

  return `https://go.xero.com/AccountsReceivable/Edit.aspx?InvoiceID=${invoiceId}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function exportToXero(
  userId: string,
  payload: XeroExportPayload
): Promise<{ invoiceUrl: string }> {
  const { accessToken, tenantId } = await getValidToken(userId);
  const contactId = await findOrCreateContact(accessToken, tenantId, payload.clientName);
  const invoiceUrl = await createInvoice(accessToken, tenantId, contactId, payload);
  return { invoiceUrl };
}

export async function isXeroConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bookkeeping_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'xero')
    .single();
  return !!data;
}

export async function disconnectXero(userId: string): Promise<void> {
  const { error } = await supabase
    .from('bookkeeping_connections')
    .delete()
    .eq('user_id', userId)
    .eq('platform', 'xero');
  if (error) throw new Error('Failed to disconnect Xero.');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/bookkeeping/xero.ts
git commit -m "feat: add Xero frontend service (token management, contact, invoice)"
```

---

## Task 5: SettingsPage — Xero Integration UI

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

The SettingsPage already has a "Coming Soon" Xero row. We're wiring it up.

- [ ] **Step 1: Add import for Xero service at the top of the imports block**

Find this line (around line 20):
```typescript
import { isFreeAgentConnected, disconnectFreeAgent } from '@/services/bookkeeping/freeagent';
```

Replace with:
```typescript
import { isFreeAgentConnected, disconnectFreeAgent } from '@/services/bookkeeping/freeagent';
import { isXeroConnected, disconnectXero } from '@/services/bookkeeping/xero';
```

- [ ] **Step 2: Add Xero state variables alongside the FreeAgent ones**

Find this block (around line 249):
```typescript
  // Integrations
  const [faConnected, setFaConnected] = useState<boolean | null>(null);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [disconnectingFa, setDisconnectingFa] = useState(false);
  // Track if faConnected was set from the ?connected=freeagent URL param — skip async check
  const faConnectedFromUrl = useRef(false);
```

Replace with:
```typescript
  // Integrations
  const [faConnected, setFaConnected] = useState<boolean | null>(null);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [disconnectingFa, setDisconnectingFa] = useState(false);
  // Track if faConnected was set from the ?connected=freeagent URL param — skip async check
  const faConnectedFromUrl = useRef(false);

  const [xeroConnected, setXeroConnected] = useState<boolean | null>(null);
  const [disconnectingXero, setDisconnectingXero] = useState(false);
  const [xeroConnectError, setXeroConnectError] = useState<string | null>(null);
  // Track if xeroConnected was set from the ?connected=xero URL param — skip async check
  const xeroConnectedFromUrl = useRef(false);
```

- [ ] **Step 3: Add Xero async connection check effect**

Find this block (around line 299):
```typescript
  useEffect(() => {
    if (!user || faConnectedFromUrl.current) return;
    isFreeAgentConnected(user.id).then(setFaConnected).catch(() => setFaConnected(false));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

Add immediately after it:
```typescript
  useEffect(() => {
    if (!user || xeroConnectedFromUrl.current) return;
    isXeroConnected(user.id).then(setXeroConnected).catch(() => setXeroConnected(false));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Add Xero URL param handler inside the existing URL-params useEffect**

Find the effect that checks `params.get('connected') === 'freeagent'` (around line 306). It looks like:
```typescript
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('connected') === 'freeagent') {
      faConnectedFromUrl.current = true;
      setFaConnected(true);
      setActiveSection('integrations');
      navigate('/settings', { replace: true });
```

Inside the same `useEffect`, after the `freeagent` block (before the closing `}`), add:
```typescript
    if (params.get('connected') === 'xero') {
      xeroConnectedFromUrl.current = true;
      setXeroConnected(true);
      setActiveSection('integrations');
      navigate('/settings', { replace: true });
    }
    // Xero error codes
    const err = params.get('error');
    if (err === 'xero_denied') setXeroConnectError('Connection cancelled.');
    if (err === 'xero_token_failed') setXeroConnectError('Token exchange failed — try again.');
    if (err === 'xero_not_configured') setXeroConnectError('Xero is not configured on this server.');
    if (err === 'xero_db_failed') setXeroConnectError('Failed to save connection — try again.');
```

- [ ] **Step 5: Add disconnect handler for Xero**

Find `handleDisconnectFreeAgent` (around line 332). Add immediately after it:
```typescript
  const handleDisconnectXero = async () => {
    if (!user) return;
    setDisconnectingXero(true);
    try {
      await disconnectXero(user.id);
      setXeroConnected(false);
    } catch {
      // Roll back — disconnect failed, connection still exists
      setXeroConnected(true);
    } finally {
      setDisconnectingXero(false);
    }
  };
```

- [ ] **Step 6: Replace the "Coming Soon" Xero row in the JSX**

Find (around line 1078):
```tsx
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
```

Replace with:
```tsx
                  {/* Xero — live */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={xeroLogo} alt="Xero" className="h-7 w-7 object-contain" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Xero</p>
                        <p className="text-xs text-muted-foreground">Sync invoices and expenses directly to Xero</p>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {xeroConnectError && (
                        <p className="text-xs text-red-500">Connection failed: {xeroConnectError}</p>
                      )}
                      {xeroConnected === null ? (
                        <Badge variant="secondary">Checking…</Badge>
                      ) : xeroConnected ? (
                        <div className="flex flex-col items-end gap-1.5">
                          <Badge className="bg-green-100 text-green-700 border-green-200">Connected</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={disconnectingXero}
                            onClick={handleDisconnectXero}
                          >
                            {disconnectingXero ? 'Disconnecting…' : 'Disconnect'}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isPremium}
                          onClick={() => {
                            if (user) window.location.href = `/api/auth/xero/start?userId=${user.id}`;
                          }}
                        >
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: wire up Xero connect/disconnect in SettingsPage"
```

---

## Task 6: InvoicePage — Xero Export Button and Logic

**Files:**
- Modify: `src/pages/InvoicePage.tsx`

- [ ] **Step 1: Add Xero import alongside the FreeAgent import**

Find (line 20):
```typescript
import { exportToFreeAgent, isFreeAgentConnected, FreeAgentAuthError } from '@/services/bookkeeping/freeagent';
```

Replace with:
```typescript
import { exportToFreeAgent, isFreeAgentConnected, FreeAgentAuthError } from '@/services/bookkeeping/freeagent';
import { exportToXero, isXeroConnected, XeroAuthError } from '@/services/bookkeeping/xero';
```

- [ ] **Step 2: Add Xero state variables alongside the FreeAgent ones**

Find (around line 84):
```typescript
  const [faConnected, setFaConnected] = useState<boolean | null>(null);
  const [faDetailed, setFaDetailed] = useState(true);
  const [exportingFa, setExportingFa] = useState(false);
  const [faExportUrl, setFaExportUrl] = useState<string | null>(null);
  const [faExportError, setFaExportError] = useState<string | null>(null);
```

Replace with:
```typescript
  const [faConnected, setFaConnected] = useState<boolean | null>(null);
  const [faDetailed, setFaDetailed] = useState(true);
  const [exportingFa, setExportingFa] = useState(false);
  const [faExportUrl, setFaExportUrl] = useState<string | null>(null);
  const [faExportError, setFaExportError] = useState<string | null>(null);

  const [xeroConnected, setXeroConnected] = useState<boolean | null>(null);
  const [xeroDetailed, setXeroDetailed] = useState(true);
  const [exportingXero, setExportingXero] = useState(false);
  const [xeroExportUrl, setXeroExportUrl] = useState<string | null>(null);
  const [xeroExportError, setXeroExportError] = useState<string | null>(null);
```

- [ ] **Step 3: Add Xero connection check useEffect alongside the FreeAgent one**

Find (around line 174):
```typescript
  useEffect(() => {
    if (!user) return;
    isFreeAgentConnected(user.id).then(setFaConnected).catch(() => setFaConnected(false));
  }, [user?.id]);
```

Add immediately after it:
```typescript
  useEffect(() => {
    if (!user) return;
    isXeroConnected(user.id).then(setXeroConnected).catch(() => setXeroConnected(false));
  }, [user?.id]);
```

- [ ] **Step 4: Add Xero export handler alongside the FreeAgent one**

Find (around line 179):
```typescript
  const handleExportToFreeAgent = async () => {
```

Add the Xero handler immediately after the entire `handleExportToFreeAgent` function:
```typescript
  const handleExportToXero = async () => {
    if (!user || selectedDays.length === 0) return;
    setExportingXero(true);
    setXeroExportUrl(null);
    setXeroExportError(null);
    try {
      const { invoiceUrl } = await exportToXero(user.id, {
        clientName,
        projectName: selectedProject?.name ?? '',
        jobReference: jobReference.trim() || null,
        invoiceNumber,
        days: selectedDays,
        vatRegistered,
        detailed: xeroDetailed,
      });
      setXeroExportUrl(invoiceUrl);
      window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (err instanceof XeroAuthError) {
        setXeroConnected(false);
        setXeroExportError('reconnect');
      } else {
        setXeroExportError(err instanceof Error ? err.message : 'Failed to export to Xero');
      }
    } finally {
      setExportingXero(false);
    }
  };
```

- [ ] **Step 5: Reset Xero export state when project changes**

Find `handleSelectProject` (around line 208) and add reset lines alongside the FreeAgent ones:
```typescript
  const handleSelectProject = (proj: Project) => {
    setSelectedProjectId(proj.id);
    setShowProjectPicker(false);
    setSelected(allDays.filter(d => d.project_id === proj.id).map(d => d.id));
    if (proj.client_name) setClientName(proj.client_name);
    setJobReference(proj.job_reference ?? '');
    setFaExportUrl(null);
    setFaExportError(null);
    setXeroExportUrl(null);
    setXeroExportError(null);
  };
```

- [ ] **Step 6: Update invoice number disabled condition to cover Xero too**

Find (around line 459):
```typescript
                  disabled={!!faConnected}
                  title={faConnected ? 'FreeAgent will assign its own invoice number' : undefined}
```

Replace with:
```typescript
                  disabled={!!faConnected || !!xeroConnected}
                  title={faConnected ? 'FreeAgent will assign its own invoice number' : xeroConnected ? 'Xero will assign its own invoice number' : undefined}
```

Find (around line 462):
```typescript
                {faConnected && (
                  <p className="text-xs text-muted-foreground">FreeAgent assigns its own number</p>
                )}
```

Replace with:
```typescript
                {(faConnected || xeroConnected) && (
                  <p className="text-xs text-muted-foreground">
                    {faConnected ? 'FreeAgent' : 'Xero'} assigns its own number
                  </p>
                )}
```

- [ ] **Step 7: Add Xero export section in the JSX after the FreeAgent export section**

Find (around line 617):
```tsx
          {/* BookkeepingCTA — shown when FreeAgent not connected */}
          {user && faConnected === false && (
            <BookkeepingCTA userId={user.id} />
          )}
```

Replace the entire block (including BookkeepingCTA) with:
```tsx
          {/* Xero export — only shown when connected and Pro */}
          {isPremium && xeroConnected && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Line items</span>
                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setXeroDetailed(false)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      !xeroDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    onClick={() => setXeroDetailed(true)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      xeroDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Detailed
                  </button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleExportToXero}
                disabled={exportingXero || selectedDays.length === 0}
              >
                {exportingXero
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending to Xero…</>
                  : 'Send to Xero'
                }
              </Button>
            </div>
          )}

          {/* Xero export result */}
          {xeroExportUrl && (
            <p className="text-xs text-center">
              <a href={xeroExportUrl} target="_blank" rel="noopener noreferrer" className="text-[#FFD528] underline">
                View draft invoice in Xero →
              </a>
            </p>
          )}
          {xeroExportError && (
            xeroExportError === 'reconnect' ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-center">
                <p className="text-xs text-red-400 font-medium">Please reconnect Xero</p>
                <a href="/settings#bookkeeping" className="text-xs text-[#FFD528] underline">
                  Go to Settings →
                </a>
              </div>
            ) : (
              <p className="text-xs text-red-500 text-center">{xeroExportError}</p>
            )
          )}

          {/* BookkeepingCTA — shown when neither FreeAgent nor Xero is connected */}
          {user && faConnected === false && xeroConnected === false && (
            <BookkeepingCTA userId={user.id} />
          )}
```

- [ ] **Step 8: Commit**

```bash
git add src/pages/InvoicePage.tsx
git commit -m "feat: add Xero export to InvoicePage with Basic/Detailed toggle"
```

---

## Task 7: BookkeepingCTA — Check Any Platform Connection

The CTA currently only checks FreeAgent internally and renders null if FreeAgent is connected. It needs to also return null if Xero is connected.

**Files:**
- Modify: `src/components/BookkeepingCTA.tsx`

- [ ] **Step 1: Update the CTA to also check Xero**

Replace the entire file with:
```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BookkeepingCTA.tsx
git commit -m "feat: update BookkeepingCTA to check Xero connection alongside FreeAgent"
```

---

## Task 8: Environment Variables

- [ ] **Step 1: Add to Vercel (production)**

In the Vercel dashboard for `crew-dock` → Settings → Environment Variables, add:

```
XERO_CLIENT_ID        = <from developer.xero.com app settings>
XERO_CLIENT_SECRET    = <from developer.xero.com app settings>
XERO_REDIRECT_URI     = https://app.crewdock.app/api/auth/xero/callback
```

Set all three for **Production** and **Preview** environments.

- [ ] **Step 2: Add to local `.env.local` for development**

```
XERO_CLIENT_ID=<dev app client id>
XERO_CLIENT_SECRET=<dev app client secret>
XERO_REDIRECT_URI=http://localhost:5173/api/auth/xero/callback
```

Note: In the Xero developer portal, add `http://localhost:5173/api/auth/xero/callback` as an additional redirect URI on the same app. The Xero dev portal supports multiple redirect URIs on one app, unlike FreeAgent.

- [ ] **Step 3: Redeploy**

Deploy to Vercel (or push to main to trigger auto-deploy) so the new env vars are available.

---

## Manual Testing Checklist (no automated test framework in project)

Work through this in order — each step confirms a dependency of the next.

- [ ] 1. Register a Web app at https://developer.xero.com/app/manage. Set redirect URIs for both localhost and production. Copy Client ID and Client Secret.
- [ ] 2. Add env vars locally and to Vercel (Task 8 above).
- [ ] 3. In your Xero account, enable a **Demo Company** (My Xero → Demo Company → Use Demo Company).
- [ ] 4. Run local dev server. Click Connect Xero in Settings. Complete OAuth flow. Verify `bookkeeping_connections` row exists with `platform='xero'`, `tenant_id` is not null, and `expires_at` is ~30 minutes from now.
- [ ] 5. Settings page shows "Connected" badge immediately after OAuth redirect (not "Checking…" flash).
- [ ] 6. Settings page shows correct error messages for `?error=xero_denied` and `?error=xero_token_failed` (manually append these to the URL to test).
- [ ] 7. Open InvoicePage. Select a project with days. Verify "Send to Xero" button appears and "Send to FreeAgent" (if connected) also appears.
- [ ] 8. Verify invoice number field is disabled with tooltip "Xero will assign its own invoice number".
- [ ] 9. Export a single-day invoice. Check draft appears in Xero Demo Company → Accounts Receivable → Drafts.
- [ ] 10. Verify Reference field on the Xero invoice shows `INV-XXX | ProjectName`.
- [ ] 11. Export a multi-day invoice (select 2+ days). Verify all line items are present with correct amounts.
- [ ] 12. Toggle Basic / Detailed and re-export. Verify Basic shows one line per day; Detailed shows individual segments.
- [ ] 13. Test with VAT on: set VAT registered in Settings, re-export. Verify `TaxType = OUTPUT2` in Xero line items.
- [ ] 14. Test with VAT off: unset VAT registered, re-export. Verify `TaxType = NONE`.
- [ ] 15. Test token refresh: manually update `expires_at` to a past timestamp in Supabase for the xero row, then export. Verify a new token is fetched silently and export succeeds.
- [ ] 16. Test auth revocation: in Xero, disconnect the app (Settings → Connected Apps → remove Crew Dock), then try to export. Verify the reconnect prompt appears in InvoicePage (red box "Please reconnect Xero → Go to Settings").
- [ ] 17. Test disconnect: click Disconnect in SettingsPage. Verify the row is removed from `bookkeeping_connections` and the UI shows the Connect button.
- [ ] 18. Verify BookkeepingCTA: disconnect both FreeAgent and Xero, reload InvoicePage, confirm CTA appears. Connect Xero only, reload — CTA should be hidden.
- [ ] 19. Test in production (not just local). Complete the OAuth flow against the real Xero app (production redirect URI).
- [ ] 20. Test `AccountCode: "200"` resolves correctly in Demo Company — in Xero go to Accounting → Chart of Accounts and confirm 200 = Sales.

---

## Self-Review

### Spec coverage

| Requirement | Covered by |
|---|---|
| PKCE S256 OAuth | Task 1 (start), Task 2 (callback) |
| Token storage in `bookkeeping_connections` with `tenant_id` | Task 2 |
| Token refresh route | Task 3 |
| Contact lookup (case-insensitive) + creation | Task 4 `findOrCreateContact` |
| Draft ACCREC invoice creation | Task 4 `createInvoice` |
| No invoice number sent (Xero auto-numbers) | Task 4, `InvoiceNumber` omitted |
| Job reference in `Reference` field | Task 4 |
| GBP currency | Task 4 |
| VAT toggle (OUTPUT2 vs NONE) | Task 4 |
| Basic / Detailed line item toggle | Task 4 `buildXeroDayLineItems`, Task 6 UI |
| Equipment always separate line item | Task 4 |
| Expenses always separate line item | Task 4 |
| `XeroAuthError` → reconnect prompt | Task 4 (throw), Task 6 (catch) |
| Settings page: Connected/Disconnect UI | Task 5 |
| Settings page: Connected immediately on OAuth return | Task 5 `xeroConnectedFromUrl` ref |
| Settings page: error messages for failed flows | Task 5 |
| InvoicePage: Send to Xero button | Task 6 |
| InvoicePage: View draft invoice link | Task 6 |
| InvoicePage: invoice number disabled when Xero connected | Task 6 |
| BookkeepingCTA hides when any platform connected | Task 7 |
| Env vars | Task 8 |

### No placeholders found in plan. ✓

### Type consistency

- `InvoiceDay` in `xero.ts` matches the fields used in `InvoicePage.tsx` — same shape as `freeagent.ts`. ✓
- `XeroExportPayload.detailed` matches the `xeroDetailed` state passed in `handleExportToXero`. ✓
- `buildXeroDayLineItems` returns `XeroLineItem[]`, consumed by `createInvoice` as `LineItems`. ✓

---

## Xero Developer Pricing & Break-Even (noted 2026-04-04)

Xero moved to a tiered API pricing model on **March 2, 2026**, based on number of connections (users with Xero linked).

| Tier | Monthly cost (USD) | Connections |
|---|---|---|
| **Starter** | **$0** | 5 |
| **Core** | ~$22 | ~100 |
| **Plus** | ~$155 | ~1,000 |
| **Advanced** | ~$895 | 10,000 |

**Starter is free** up to 5 Xero connections — safe for early testing and launch with no cost.

### Break-even at Core tier (~$22/mo ≈ £17/mo)

Crew Dock Pro = £3.45/month. £17 ÷ £3.45 = **~5 paying Pro users with Xero connected** to cover the Core tier fee.

In practice, Xero is a power feature (limited company owners only). If ~10–20% of Pro users connect it, you'd need **25–50 Pro subscribers total** before the Xero cost is negligible.

**Strategy:** Stay on Starter (free, 5 connections) while building user base. Upgrade to Core only once 5–6 users are actively using Xero on Pro.
- `getValidToken` returns `{ accessToken, tenantId }` — both used in `findOrCreateContact` and `createInvoice`. ✓
