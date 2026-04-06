# QuickBooks Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a QuickBooks Online (QBO) OAuth integration to Crew Dock so Pro users can push invoices from InvoicePage directly to their QBO company, mirroring the FreeAgent and Xero integrations.

**Architecture:** Three Vercel serverless functions handle the OAuth flow server-side (`api/auth/quickbooks/[action].ts`). A dedicated export function (`api/quickbooks/export-invoice.ts`) handles token refresh, contact/item lookup/creation, and invoice POST. A frontend service (`src/services/bookkeeping/quickbooks.ts`) mirrors the Xero service. SettingsPage and InvoicePage get QBO-specific state and UI. No DB migration needed — `realm_id` and `qbo_item_id` columns already exist.

**Tech Stack:** TypeScript, Vercel Serverless Functions (`@vercel/node`), Supabase JS client, QuickBooks Online Accounting API v3, React + shadcn/ui

---

## Key differences from Xero (read before touching code)

1. **No PKCE** — QBO is a confidential client. State carries only `{ userId }` as base64url JSON.
2. **`realmId` in callback query param** — QBO returns it alongside `code` as `?realmId=…`. This is the only opportunity to capture it. Store in `realm_id`.
3. **No draft invoices** — All invoices are immediately live "Open". Set `EmailStatus: "NotSet"` to suppress auto-send.
4. **`ItemRef` required on every line** — QBO won't accept a priced line without an item reference. On first export, look up "Film Crew Services" item; create it if missing (requires finding a valid income account first); cache `qbo_item_id`.
5. **`Amount` must be explicit** — QBO does not calculate `Amount = UnitPrice × Qty`. Set it on every line.
6. **Crew Dock reference → `PrivateNote`** — QBO auto-numbers; put `"INV-X | ProjectName | JobRef"` in `PrivateNote`.
7. **Sandbox toggle** — `QBO_SANDBOX=true` swaps the data API base URL. OAuth URLs are the same for both environments.
8. **Do not modify FreeAgent or Xero files** — Only new files plus targeted additions to SettingsPage, InvoicePage, BookkeepingCTA.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `api/auth/quickbooks/[action].ts` | OAuth start / callback / refresh |
| Create | `api/quickbooks/export-invoice.ts` | Token refresh, item/contact setup, invoice POST |
| Create | `src/services/bookkeeping/quickbooks.ts` | `exportToQBO`, `isQBOConnected`, `disconnectQBO`, `QBOAuthError` |
| Modify | `src/pages/SettingsPage.tsx` | Replace "Coming Soon" QBO row with live UI |
| Modify | `src/pages/InvoicePage.tsx` | Add QBO state, loading messages, export button |
| Modify | `src/components/BookkeepingCTA.tsx` | Add `isQBOConnected` to connection check |

---

## Task 1: Backend — QuickBooks OAuth Handler

**Files:**
- Create: `api/auth/quickbooks/[action].ts`

- [ ] **Step 1: Create the file**

```typescript
// api/auth/quickbooks/[action].ts
// Vercel Serverless Function — handles all QuickBooks OAuth actions in one function
// Routes: /api/auth/quickbooks/start  /api/auth/quickbooks/callback  /api/auth/quickbooks/refresh
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Start ─────────────────────────────────────────────────────────────────────

function handleStart(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.QBO_CLIENT_ID;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'qbo_not_configured' });
  }

  const userId = req.query.userId as string;
  if (!userId || !UUID_RE.test(userId)) {
    return res.status(400).json({ error: 'missing_or_invalid_user_id' });
  }

  // No PKCE — QBO is a confidential client. Encode userId in state for CSRF protection.
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });

  res.redirect(`https://appcenter.intuit.com/connect/oauth2?${params}`);
}

// ── Callback ──────────────────────────────────────────────────────────────────

async function handleCallback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect(`/settings?error=qbo_not_configured`);
  }

  const { code, state, realmId, error } = req.query;
  const codeStr = Array.isArray(code) ? code[0] : code;
  const stateStr = Array.isArray(state) ? state[0] : state;
  const realmIdStr = Array.isArray(realmId) ? realmId[0] : realmId;

  if (error) return res.redirect(`/settings?error=qbo_denied`);
  if (!codeStr || !stateStr || !realmIdStr) return res.redirect(`/settings?error=invalid_callback`);

  // Decode state to extract userId
  let userId: string;
  try {
    const parsed = JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf-8'));
    userId = parsed.userId;
    if (!userId) throw new Error('missing userId');
  } catch {
    return res.redirect(`/settings?error=invalid_state`);
  }

  // Exchange code for tokens using HTTP Basic Auth
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let tokenRes: Response;
  try {
    tokenRes = await fetch(QBO_TOKEN_URL, {
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
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return res.redirect(`/settings?error=qbo_token_failed`);
  }

  if (!tokenRes.ok) {
    console.error('QBO token exchange failed:', await tokenRes.text());
    return res.redirect(`/settings?error=qbo_token_failed`);
  }

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    console.error('QBO token response missing access_token:', tokens);
    return res.redirect(`/settings?error=qbo_token_failed`);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: dbError } = await supabaseAdmin
    .from('bookkeeping_connections')
    .upsert(
      {
        user_id: userId,
        platform: 'quickbooks',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        realm_id: realmIdStr,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    );

  if (dbError) {
    console.error('Failed to store QBO tokens:', dbError);
    return res.redirect(`/settings?error=qbo_db_failed`);
  }

  res.redirect(`/settings?connected=quickbooks`);
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function handleRefresh(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'qbo_not_configured' });
  }

  const { refresh_token, user_id } = req.body as { refresh_token?: string; user_id?: string };
  if (!refresh_token || !user_id) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let tokenRes: Response;
  try {
    tokenRes = await fetch(QBO_TOKEN_URL, {
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
    return res.status(503).json({ error: 'qbo_unreachable' });
  }

  if (!tokenRes.ok) return res.status(401).json({ error: 'refresh_failed' });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return res.status(401).json({ error: 'refresh_failed' });
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // QBO issues a new refresh token on each refresh — always store the latest one
  const { error: dbError } = await supabaseAdmin
    .from('bookkeeping_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user_id)
    .eq('platform', 'quickbooks');

  if (dbError) {
    console.error('Failed to update QBO tokens:', dbError);
    return res.status(500).json({ error: 'db_write_failed' });
  }

  res.json({ access_token: tokens.access_token, expires_at: expiresAt });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  switch (action) {
    case 'start':
      return handleStart(req, res);
    case 'callback':
      return handleCallback(req, res);
    case 'refresh':
      return handleRefresh(req, res);
    default:
      return res.status(404).json({ error: 'not_found' });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/auth/quickbooks/\[action\].ts
git commit -m "feat: add QuickBooks OAuth handler (start/callback/refresh)"
```

---

## Task 2: Backend — QuickBooks Export Invoice Function

**Files:**
- Create: `api/quickbooks/export-invoice.ts`

- [ ] **Step 1: Create the file**

```typescript
// api/quickbooks/export-invoice.ts
// Vercel Serverless Function — creates a QBO contact + invoice server-side
// Called by src/services/bookkeeping/quickbooks.ts to avoid browser CORS restrictions
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

function getQBOBaseUrl(): string {
  return process.env.QBO_SANDBOX === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

// ── Token helpers ─────────────────────────────────────────────────────────────

async function getValidToken(userId: string): Promise<{ accessToken: string; realmId: string; qboItemId: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('bookkeeping_connections')
    .select('access_token, refresh_token, expires_at, realm_id, qbo_item_id')
    .eq('user_id', userId)
    .eq('platform', 'quickbooks')
    .single();

  if (error || !data) throw new Error('QuickBooks not connected.');
  if (!data.realm_id) throw new Error('No QuickBooks company found. Please reconnect in Settings.');

  const isExpired = Date.now() > new Date(data.expires_at).getTime() - 60_000;
  if (!isExpired) {
    return { accessToken: data.access_token, realmId: data.realm_id, qboItemId: data.qbo_item_id ?? null };
  }

  // Refresh the token directly here — no extra HTTP round-trip needed
  const clientId = process.env.QBO_CLIENT_ID!;
  const clientSecret = process.env.QBO_CLIENT_SECRET!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenRes = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!tokenRes.ok) throw new Error('QBO_AUTH_ERROR');

  const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!tokens.access_token) throw new Error('QBO_AUTH_ERROR');

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from('bookkeeping_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? data.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', 'quickbooks');

  return { accessToken: tokens.access_token, realmId: data.realm_id, qboItemId: data.qbo_item_id ?? null };
}

// ── Item setup (Film Crew Services) ───────────────────────────────────────────
// QBO requires every priced line item to reference an Item entity.
// We look up "Film Crew Services" once, create it if missing, then cache the ID.

async function ensureServiceItem(accessToken: string, realmId: string, userId: string): Promise<string> {
  const base = getQBOBaseUrl();
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  // Search for existing item by name
  const query = `SELECT * FROM Item WHERE Name = 'Film Crew Services'`;
  const searchRes = await fetch(
    `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );

  if (!searchRes.ok) {
    if (searchRes.status === 401) throw new Error('QBO_AUTH_ERROR');
    throw new Error(`Item search failed (${searchRes.status})`);
  }

  const searchData = await searchRes.json() as { QueryResponse?: { Item?: { Id: string }[] } };
  const existingItem = searchData.QueryResponse?.Item?.[0];
  if (existingItem?.Id) {
    // Cache it for future exports
    await supabaseAdmin
      .from('bookkeeping_connections')
      .update({ qbo_item_id: existingItem.Id, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('platform', 'quickbooks');
    return existingItem.Id;
  }

  // Item not found — find the first active income account to attach it to
  const acctQuery = `SELECT * FROM Account WHERE AccountType = 'Income' AND Active = true AND SubAccount = false LIMIT 1`;
  const acctRes = await fetch(
    `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(acctQuery)}&minorversion=75`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );

  if (!acctRes.ok) {
    if (acctRes.status === 401) throw new Error('QBO_AUTH_ERROR');
    throw new Error(`Account lookup failed (${acctRes.status})`);
  }

  const acctData = await acctRes.json() as { QueryResponse?: { Account?: { Id: string; Name: string }[] } };
  const incomeAccount = acctData.QueryResponse?.Account?.[0];
  if (!incomeAccount) throw new Error('No income account found in QuickBooks company.');

  // Create the "Film Crew Services" item
  const createRes = await fetch(
    `${base}/v3/company/${realmId}/item?minorversion=75`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Name: 'Film Crew Services',
        Type: 'Service',
        IncomeAccountRef: { value: incomeAccount.Id, name: incomeAccount.Name },
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!createRes.ok) {
    if (createRes.status === 401) throw new Error('QBO_AUTH_ERROR');
    throw new Error(`Item creation failed (${createRes.status})`);
  }

  const createData = await createRes.json() as { Item?: { Id: string } };
  const newItemId = createData.Item?.Id;
  if (!newItemId) throw new Error('Item created but no Id returned.');

  // Cache the new item ID
  await supabaseAdmin
    .from('bookkeeping_connections')
    .update({ qbo_item_id: newItemId, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('platform', 'quickbooks');

  return newItemId;
}

// ── Contact lookup / creation ─────────────────────────────────────────────────

async function findOrCreateCustomer(
  accessToken: string,
  realmId: string,
  name: string
): Promise<string> {
  const base = getQBOBaseUrl();
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  // Case-insensitive search using LIKE
  const query = `SELECT * FROM Customer WHERE DisplayName LIKE '${name.replace(/'/g, "''")}'`;
  const searchRes = await fetch(
    `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );

  if (!searchRes.ok) {
    if (searchRes.status === 401) throw new Error('QBO_AUTH_ERROR');
    throw new Error(`Customer search failed (${searchRes.status})`);
  }

  const searchData = await searchRes.json() as { QueryResponse?: { Customer?: { Id: string; DisplayName: string }[] } };
  const customers = searchData.QueryResponse?.Customer ?? [];
  const match = customers.find(c => c.DisplayName?.toLowerCase() === name.toLowerCase());
  if (match) return match.Id;

  // Create new customer
  const createRes = await fetch(
    `${base}/v3/company/${realmId}/customer?minorversion=75`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ DisplayName: name, CompanyName: name }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!createRes.ok) {
    if (createRes.status === 401) throw new Error('QBO_AUTH_ERROR');
    throw new Error(`Customer creation failed (${createRes.status})`);
  }

  const createData = await createRes.json() as { Customer?: { Id: string } };
  const customerId = createData.Customer?.Id;
  if (!customerId) throw new Error('Customer created but no Id returned.');
  return customerId;
}

// ── Line item builder ─────────────────────────────────────────────────────────

type QBOLine = {
  Description: string;
  Amount: number;
  DetailType: 'SalesItemLineDetail';
  SalesItemLineDetail: {
    ItemRef: { value: string };
    UnitPrice: number;
    Qty: number;
    TaxCodeRef?: { value: string };
  };
};

type InvoiceDay = {
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
};

const isHourlyItem = (hours: number | undefined, rate: number | undefined, total: number) =>
  hours != null && rate != null && total > 0 && Math.abs(hours * rate - total) / total < 0.05;

function makeLine(description: string, qty: number, unitPrice: number, itemId: string, taxCode: string | null): QBOLine {
  return {
    Description: description,
    Amount: Math.round(qty * unitPrice * 100) / 100,
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: {
      ItemRef: { value: itemId },
      UnitPrice: unitPrice,
      Qty: qty,
      ...(taxCode ? { TaxCodeRef: { value: taxCode } } : {}),
    },
  };
}

function buildDayLines(day: InvoiceDay, itemId: string, taxCode: string | null, detailed: boolean): QBOLine[] {
  const lines: QBOLine[] = [];
  const rj = day.result_json ?? {};
  const equipmentNet = (rj.equipmentTotal ?? 0) - (rj.equipmentDiscount ?? 0);
  const expensesAmount = day.expenses_amount ?? 0;
  const hasDetailedData = (rj.lineItems?.length ?? 0) > 0;

  if (detailed && hasDetailedData) {
    for (const li of rj.lineItems ?? []) {
      const timeStr = li.timeFrom && li.timeTo ? ` | ${li.timeFrom}–${li.timeTo}` : '';
      const hourly = isHourlyItem(li.hours, li.rate, li.total);
      lines.push(makeLine(
        `${li.description}${timeStr} | ${day.work_date}`,
        hourly ? li.hours! : 1,
        hourly ? li.rate! : li.total,
        itemId,
        taxCode,
      ));
    }
    for (const p of rj.penalties ?? []) {
      const hourly = isHourlyItem(p.hours, p.rate, p.total);
      lines.push(makeLine(
        `${p.description} | ${day.work_date}`,
        hourly ? p.hours! : 1,
        hourly ? p.rate! : p.total,
        itemId,
        taxCode,
      ));
    }
    if ((rj.travelPay ?? 0) > 0) {
      lines.push(makeLine(`Travel Pay | ${day.work_date}`, 1, rj.travelPay!, itemId, taxCode));
    }
    if ((rj.mileage ?? 0) > 0) {
      const milesStr = rj.mileageMiles ? ` (${rj.mileageMiles} miles)` : '';
      lines.push(makeLine(`Mileage${milesStr} | ${day.work_date}`, 1, rj.mileage!, itemId, taxCode));
    }
  } else {
    const dayTotal = day.grand_total - equipmentNet - expensesAmount;
    lines.push(makeLine(
      `${day.role_name} — ${day.day_type.replace(/_/g, ' ')} | ${day.work_date} | Call: ${day.call_time} Wrap: ${day.wrap_time}`,
      1,
      dayTotal,
      itemId,
      taxCode,
    ));
  }

  if (equipmentNet > 0) {
    lines.push(makeLine(`Equipment | ${day.work_date}`, 1, equipmentNet, itemId, taxCode));
  }
  if (expensesAmount > 0) {
    const expDesc = day.expenses_notes
      ? `Expenses — ${day.expenses_notes} | ${day.work_date}`
      : `Expenses | ${day.work_date}`;
    lines.push(makeLine(expDesc, 1, expensesAmount, itemId, taxCode));
  }

  return lines;
}

// ── Invoice creation ──────────────────────────────────────────────────────────

async function createInvoice(
  accessToken: string,
  realmId: string,
  customerId: string,
  itemId: string,
  payload: {
    invoiceNumber: string;
    projectName: string;
    jobReference: string | null;
    days: InvoiceDay[];
    vatRegistered: boolean;
    detailed: boolean;
  }
): Promise<string> {
  const base = getQBOBaseUrl();
  const taxCode = payload.vatRegistered ? 'TAX' : 'NON';

  const privateNote = [payload.invoiceNumber, payload.projectName, payload.jobReference]
    .filter(Boolean)
    .join(' | ');

  const lines = payload.days.flatMap(day => buildDayLines(day, itemId, taxCode, payload.detailed));

  const res = await fetch(
    `${base}/v3/company/${realmId}/invoice?minorversion=75`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        CustomerRef: { value: customerId },
        EmailStatus: 'NotSet',
        PrivateNote: privateNote,
        Line: lines,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!res.ok) {
    if (res.status === 401) throw new Error('QBO_AUTH_ERROR');
    const err = await res.text().catch(() => '');
    throw new Error(`Failed to create QuickBooks invoice: ${err}`);
  }

  const data = await res.json() as { Invoice?: { Id: string } };
  const invoiceId = data?.Invoice?.Id;
  if (!invoiceId) throw new Error('Invoice created but QuickBooks returned no Id.');

  return `https://app.qbo.intuit.com/app/invoice?txnId=${invoiceId}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { userId, clientName, projectName, jobReference, invoiceNumber, days, vatRegistered, detailed } = req.body;

  if (!userId || !clientName || !days?.length) {
    return res.status(400).json({ error: 'missing_required_fields' });
  }

  try {
    const { accessToken, realmId, qboItemId } = await getValidToken(userId);

    // ensureServiceItem handles both the lookup and caching — pass cached ID if we have it
    const itemId = qboItemId ?? await ensureServiceItem(accessToken, realmId, userId);

    const customerId = await findOrCreateCustomer(accessToken, realmId, clientName);
    const invoiceUrl = await createInvoice(accessToken, realmId, customerId, itemId, {
      invoiceNumber, projectName, jobReference, days, vatRegistered, detailed,
    });

    return res.status(200).json({ invoiceUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'QBO_AUTH_ERROR') {
      return res.status(401).json({ error: 'QBO_AUTH_ERROR' });
    }
    console.error('QBO export error:', message);
    return res.status(500).json({ error: message });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/quickbooks/export-invoice.ts
git commit -m "feat: add QuickBooks export-invoice serverless function"
```

---

## Task 3: Frontend Service

**Files:**
- Create: `src/services/bookkeeping/quickbooks.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/services/bookkeeping/quickbooks.ts
import { supabase } from '@/lib/supabase';

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

export interface QBOExportPayload {
  clientName: string;
  projectName: string;
  jobReference: string | null;
  invoiceNumber: string;
  days: InvoiceDay[];
  vatRegistered: boolean;
  detailed: boolean;
}

// Thrown when QBO rejects the token — signals the UI to prompt reconnect
export class QBOAuthError extends Error {
  constructor() {
    super('QBO_AUTH_ERROR');
    this.name = 'QBOAuthError';
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Delegates to a serverless function to avoid CORS restrictions —
// QBO's API does not allow direct browser-side requests.
export async function exportToQBO(
  userId: string,
  payload: QBOExportPayload
): Promise<{ invoiceUrl: string }> {
  const res = await fetch('/api/quickbooks/export-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...payload }),
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 401) throw new QBOAuthError();

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Export failed (${res.status})`);
  }

  const data = await res.json() as { invoiceUrl: string };
  return { invoiceUrl: data.invoiceUrl };
}

export async function isQBOConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('bookkeeping_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'quickbooks')
    .single();
  return !!data;
}

export async function disconnectQBO(userId: string): Promise<void> {
  const { error } = await supabase
    .from('bookkeeping_connections')
    .delete()
    .eq('user_id', userId)
    .eq('platform', 'quickbooks');
  if (error) throw new Error('Failed to disconnect QuickBooks.');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/bookkeeping/quickbooks.ts
git commit -m "feat: add QuickBooks frontend service (exportToQBO, isQBOConnected, disconnectQBO)"
```

---

## Task 4: BookkeepingCTA — add QBO to connection check

**Files:**
- Modify: `src/components/BookkeepingCTA.tsx`

The CTA currently checks FreeAgent and Xero. Add QuickBooks so it hides when any platform is connected.

- [ ] **Step 1: Add the import**

In `src/components/BookkeepingCTA.tsx`, after the existing `isXeroConnected` import on line 7, add:

```typescript
import { isQBOConnected } from '@/services/bookkeeping/quickbooks';
```

- [ ] **Step 2: Add QBO to the Promise.all check**

Find this block (around line 33):

```typescript
  useEffect(() => {
    Promise.all([
      isFreeAgentConnected(userId).catch(() => false),
      isXeroConnected(userId).catch(() => false),
    ]).then(([fa, xero]) => setAnyConnected(fa || xero));
  }, [userId]);
```

Replace with:

```typescript
  useEffect(() => {
    Promise.all([
      isFreeAgentConnected(userId).catch(() => false),
      isXeroConnected(userId).catch(() => false),
      isQBOConnected(userId).catch(() => false),
    ]).then(([fa, xero, qbo]) => setAnyConnected(fa || xero || qbo));
  }, [userId]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/BookkeepingCTA.tsx
git commit -m "feat: include QuickBooks in BookkeepingCTA connection check"
```

---

## Task 5: SettingsPage — replace Coming Soon with live QBO row

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add the QuickBooks import at the top of the file**

Find the existing bookkeeping imports (around lines 20–21):

```typescript
import { isFreeAgentConnected, disconnectFreeAgent } from '@/services/bookkeeping/freeagent';
import { isXeroConnected, disconnectXero } from '@/services/bookkeeping/xero';
```

Add after:

```typescript
import { isQBOConnected, disconnectQBO } from '@/services/bookkeeping/quickbooks';
```

- [ ] **Step 2: Add QBO state variables**

Find the existing Xero state block (around lines 257–261):

```typescript
  const [xeroConnected, setXeroConnected] = useState<boolean | null>(null);
  const [disconnectingXero, setDisconnectingXero] = useState(false);
  const [xeroConnectError, setXeroConnectError] = useState<string | null>(null);
  // Track if xeroConnected was set from the ?connected=xero URL param — skip async check
  const xeroConnectedFromUrl = useRef(false);
```

Add after:

```typescript
  const [qboConnected, setQboConnected] = useState<boolean | null>(null);
  const [disconnectingQbo, setDisconnectingQbo] = useState(false);
  const [qboConnectError, setQboConnectError] = useState<string | null>(null);
  // Track if qboConnected was set from the ?connected=quickbooks URL param — skip async check
  const qboConnectedFromUrl = useRef(false);
```

- [ ] **Step 3: Add QBO async connection check**

Find the existing Xero connection check useEffect (around lines 312–314):

```typescript
    if (!user || xeroConnectedFromUrl.current) return;
    isXeroConnected(user.id).then(setXeroConnected).catch(() => setXeroConnected(false));
```

Add a new `useEffect` after the Xero one:

```typescript
  useEffect(() => {
    if (!user || qboConnectedFromUrl.current) return;
    isQBOConnected(user.id).then(setQboConnected).catch(() => setQboConnected(false));
  }, [user?.id]);
```

- [ ] **Step 4: Add QBO URL param handling**

Find the Xero URL param block (around lines 333–344):

```typescript
    if (params.get('connected') === 'xero') {
      xeroConnectedFromUrl.current = true;
      setXeroConnected(true);
```

After the full Xero block (all `if (urlError === 'xero_…')` lines), add:

```typescript
    if (params.get('connected') === 'quickbooks') {
      qboConnectedFromUrl.current = true;
      setQboConnected(true);
    }
    if (urlError === 'qbo_denied') setQboConnectError('Connection cancelled.');
    if (urlError === 'qbo_token_failed') setQboConnectError('Token exchange failed — try again.');
    if (urlError === 'qbo_not_configured') setQboConnectError('QuickBooks is not configured on this server.');
    if (urlError === 'qbo_db_failed') setQboConnectError('Failed to save connection — try again.');
    if (urlError === 'invalid_callback') setQboConnectError('Invalid callback — please try connecting again.');
    if (urlError === 'invalid_state') setQboConnectError('Connection expired — please try connecting again.');
```

Note: `invalid_callback` and `invalid_state` are shared error keys also used by the Xero and FreeAgent handlers. Setting all three is fine — only one OAuth flow runs at a time, so only one section will be visible to the user.

- [ ] **Step 5: Add QBO disconnect handler**

Find the existing `handleDisconnectXero` function and add after:

```typescript
  const handleDisconnectQbo = async () => {
    if (!user) return;
    setDisconnectingQbo(true);
    try {
      await disconnectQBO(user.id);
      setQboConnected(false);
    } catch {
      setQboConnected(true);
    } finally {
      setDisconnectingQbo(false);
    }
  };
```

- [ ] **Step 6: Replace the Coming Soon QBO row**

Find and replace the entire `{/* QuickBooks — coming soon */}` block:

```tsx
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
```

Replace with:

```tsx
                  {/* QuickBooks — live */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={quickbooksLogo} alt="QuickBooks" className="h-7 w-7 object-contain" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">QuickBooks</p>
                        <p className="text-xs text-muted-foreground">Push invoices and track income in QuickBooks</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {qboConnectError && (
                        <p className="text-xs text-red-500">Connection failed: {qboConnectError}</p>
                      )}
                      {qboConnected === null ? (
                        <div className="h-9 w-24 rounded-md bg-muted animate-pulse" />
                      ) : qboConnected ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-green-500 border-green-500/30">Connected</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={disconnectingQbo}
                            onClick={handleDisconnectQbo}
                          >
                            {disconnectingQbo ? 'Disconnecting…' : 'Disconnect'}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-[#2CA01C] hover:bg-[#2CA01C]/90 text-white"
                          onClick={() => {
                            if (user) window.location.href = `/api/auth/quickbooks/start?userId=${user.id}`;
                          }}
                        >
                          Connect QuickBooks
                        </Button>
                      )}
                    </div>
                  </div>
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: add live QuickBooks connect/disconnect UI to SettingsPage"
```

---

## Task 6: InvoicePage — add QBO export

**Files:**
- Modify: `src/pages/InvoicePage.tsx`

- [ ] **Step 1: Add the import**

Find the existing bookkeeping imports (around lines 20–21):

```typescript
import { exportToFreeAgent, isFreeAgentConnected, FreeAgentAuthError } from '@/services/bookkeeping/freeagent';
import { exportToXero, isXeroConnected, XeroAuthError } from '@/services/bookkeeping/xero';
```

Add after:

```typescript
import { exportToQBO, isQBOConnected, QBOAuthError } from '@/services/bookkeeping/quickbooks';
```

- [ ] **Step 2: Add QBO state variables**

Find the Xero state block (around lines 91–95):

```typescript
  const [xeroConnected, setXeroConnected] = useState<boolean | null>(null);
  const [xeroDetailed, setXeroDetailed] = useState(true);
  const [exportingXero, setExportingXero] = useState(false);
  const [xeroExportUrl, setXeroExportUrl] = useState<string | null>(null);
  const [xeroExportError, setXeroExportError] = useState<string | null>(null);
```

Add after:

```typescript
  const [qboConnected, setQboConnected] = useState<boolean | null>(null);
  const [qboDetailed, setQboDetailed] = useState(true);
  const [exportingQbo, setExportingQbo] = useState(false);
  const [qboExportUrl, setQboExportUrl] = useState<string | null>(null);
  const [qboExportError, setQboExportError] = useState<string | null>(null);
  const [qboLoadingMessage, setQboLoadingMessage] = useState('Connecting to QuickBooks…');
```

- [ ] **Step 3: Add QBO connection check useEffect**

Find the Xero connection check useEffect (around lines 186–189):

```typescript
  useEffect(() => {
    if (!user) return;
    isXeroConnected(user.id).then(setXeroConnected).catch(() => setXeroConnected(false));
  }, [user?.id]);
```

Add after:

```typescript
  useEffect(() => {
    if (!user) return;
    isQBOConnected(user.id).then(setQboConnected).catch(() => setQboConnected(false));
  }, [user?.id]);
```

- [ ] **Step 4: Add QBO export handler**

Find the `handleExportToXero` function and add after it:

```typescript
  const QBO_MESSAGES = ['Connecting to QuickBooks…', 'Preparing export…', 'Creating invoice…'];

  const handleExportToQBO = async () => {
    if (!user || selectedDays.length === 0) return;
    setExportingQbo(true);
    setQboExportUrl(null);
    setQboExportError(null);
    setQboLoadingMessage(QBO_MESSAGES[0]);

    const t1 = setTimeout(() => setQboLoadingMessage(QBO_MESSAGES[1]), 1500);
    const t2 = setTimeout(() => setQboLoadingMessage(QBO_MESSAGES[2]), 4000);

    try {
      const { invoiceUrl } = await exportToQBO(user.id, {
        clientName,
        projectName: selectedProject?.name ?? '',
        jobReference: jobReference.trim() || null,
        invoiceNumber,
        days: selectedDays,
        vatRegistered,
        detailed: qboDetailed,
      });
      setQboExportUrl(invoiceUrl);
      window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (err instanceof QBOAuthError) {
        setQboConnected(false);
        setQboExportError('reconnect');
      } else {
        setQboExportError(err instanceof Error ? err.message : 'Failed to export to QuickBooks');
      }
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setExportingQbo(false);
    }
  };
```

- [ ] **Step 5: Clear QBO export state on project change**

Find `handleSelectProject` (around line 249). It already clears FA and Xero state:

```typescript
    setFaExportUrl(null);
    setFaExportError(null);
    setXeroExportUrl(null);
    setXeroExportError(null);
```

Add after those four lines:

```typescript
    setQboExportUrl(null);
    setQboExportError(null);
```

- [ ] **Step 6: Update invoice number disabled state**

Find the invoice number `Input` disabled logic (around line 502):

```tsx
                  disabled={!!faConnected || !!xeroConnected}
                  title={faConnected ? 'FreeAgent will assign its own invoice number' : xeroConnected ? 'Xero will assign its own invoice number' : undefined}
```

Replace with:

```tsx
                  disabled={!!faConnected || !!xeroConnected || !!qboConnected}
                  title={faConnected ? 'FreeAgent will assign its own invoice number' : xeroConnected ? 'Xero will assign its own invoice number' : qboConnected ? 'QuickBooks will assign its own invoice number' : undefined}
```

Then find the caption below it (around line 505):

```tsx
                {(faConnected || xeroConnected) && (
                  <p className="text-xs text-muted-foreground">
                    {faConnected ? 'FreeAgent' : 'Xero'} assigns its own number
                  </p>
                )}
```

Replace with:

```tsx
                {(faConnected || xeroConnected || qboConnected) && (
                  <p className="text-xs text-muted-foreground">
                    {faConnected ? 'FreeAgent' : xeroConnected ? 'Xero' : 'QuickBooks'} assigns its own number
                  </p>
                )}
```

- [ ] **Step 7: Add the QBO export UI block**

Find the Xero export result block and the BookkeepingCTA line (around lines 704–727):

```tsx
          {/* Xero export result */}
          {xeroExportUrl && (
            ...
          )}
          {xeroExportError && (
            ...
          )}

          {/* BookkeepingCTA — shown when neither FreeAgent nor Xero is connected */}
          {user && faConnected === false && xeroConnected === false && (
            <BookkeepingCTA userId={user.id} />
          )}
```

Insert the QBO export section **between** the Xero error block and the BookkeepingCTA line:

```tsx
          {/* QBO export — only shown when connected and Pro */}
          {isPremium && qboConnected && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Line items</span>
                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setQboDetailed(false)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      !qboDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    onClick={() => setQboDetailed(true)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      qboDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Detailed
                  </button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleExportToQBO}
                disabled={exportingQbo || selectedDays.length === 0}
              >
                {exportingQbo
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {qboLoadingMessage}</>
                  : 'Send to QuickBooks'
                }
              </Button>
            </div>
          )}

          {/* QBO export result */}
          {qboExportUrl && (
            <p className="text-xs text-center">
              <a href={qboExportUrl} target="_blank" rel="noopener noreferrer" className="text-[#FFD528] underline">
                View invoice in QuickBooks →
              </a>
            </p>
          )}
          {qboExportError && (
            qboExportError === 'reconnect' ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-center">
                <p className="text-xs text-red-400 font-medium">Please reconnect QuickBooks</p>
                <a href="/settings#bookkeeping" className="text-xs text-[#FFD528] underline">
                  Go to Settings →
                </a>
              </div>
            ) : (
              <p className="text-xs text-red-500 text-center">{qboExportError}</p>
            )
          )}
```

Also update the BookkeepingCTA condition to include QBO:

```tsx
          {/* BookkeepingCTA — shown when no bookkeeping platform is connected */}
          {user && faConnected === false && xeroConnected === false && qboConnected === false && (
            <BookkeepingCTA userId={user.id} />
          )}
```

- [ ] **Step 8: Commit**

```bash
git add src/pages/InvoicePage.tsx
git commit -m "feat: add QuickBooks export to InvoicePage with cycling loading messages"
```

---

## Task 7: Environment Variables

**Files:**
- Modify: `.env.example` (committed template)
- Do NOT commit `.env.local`

- [ ] **Step 1: Add QBO vars to `.env.example`**

Open `.env.example` and add alongside the existing FreeAgent/Xero entries:

```bash
# QuickBooks Online
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=https://app.crewdock.app/api/auth/quickbooks/callback
# QBO_SANDBOX=true   # uncomment to use sandbox data API
```

- [ ] **Step 2: Add vars to Vercel**

In the Vercel dashboard (or via `vercel env add`), add:
- `QBO_CLIENT_ID` — from Intuit developer dashboard → Keys & OAuth
- `QBO_CLIENT_SECRET` — same location
- `QBO_REDIRECT_URI` → `https://app.crewdock.app/api/auth/quickbooks/callback`

For sandbox testing, also add `QBO_SANDBOX=true` temporarily and remove before going live.

- [ ] **Step 3: Register the redirect URI in Intuit developer portal**

Go to `developer.intuit.com` → your app → Keys & OAuth → add redirect URI:
`https://app.crewdock.app/api/auth/quickbooks/callback`

Also set the "Reconnect URL" (required since Feb 2026): `https://app.crewdock.app/settings#bookkeeping`

- [ ] **Step 4: Commit `.env.example`**

```bash
git add .env.example
git commit -m "chore: add QuickBooks env var template to .env.example"
```

---

## Task 8: Push and verify deployment

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Confirm Vercel deployment completes**

Check Vercel dashboard or run:
```bash
vercel ls
```
Expected: new deployment with status `● Ready`

- [ ] **Step 3: Run the testing checklist**

Work through each item in production (`app.crewdock.app`):

1. Click "Connect QuickBooks" in Settings → confirm Intuit OAuth page opens
2. Approve access → confirm redirect to `/settings?connected=quickbooks` with "Connected" badge
3. Settings shows "Connected" immediately without waiting for page reload
4. Click "Disconnect" → badge reverts to Connect button
5. Connect again, go to InvoicePage, select a project with days
6. Click "Send to QuickBooks" — verify loading messages cycle: "Connecting…" → "Preparing export…" → "Creating invoice…"
7. Invoice opens in new tab at `app.qbo.intuit.com`
8. In QBO, verify "Film Crew Services" item was created under Items
9. In QBO, verify customer was created matching `clientName`
10. In QBO, verify invoice is "Open" (not emailed), `PrivateNote` contains invoice ref + project + job ref
11. Export a second invoice for the same client — confirm no duplicate customer created
12. Export with Basic toggle — verify one line per day
13. Export with Detailed toggle — verify individual time segments
14. Export with VAT registered — verify tax code on lines
15. Confirm FreeAgent export still works on a test invoice
16. Confirm Xero export still works on a test invoice
