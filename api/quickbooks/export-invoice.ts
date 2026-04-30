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

// ── Item IDs map ───────────────────────────────────────────────────────────────
// Stored as JSON in the qbo_item_id column, e.g.:
// {"days":"1","hours":"2","expenses":"3","equipment":"4","penalty":"5"}

type ItemIds = {
  days: string;
  hours: string;
  expenses: string;
  equipment: string;
  penalty: string;
};

function parseItemIds(raw: string | null): ItemIds | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ItemIds>;
    if (parsed.days && parsed.hours && parsed.expenses && parsed.equipment && parsed.penalty) {
      return parsed as ItemIds;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Token helpers ─────────────────────────────────────────────────────────────

async function getValidToken(userId: string): Promise<{ accessToken: string; realmId: string; itemIds: ItemIds | null }> {
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
    return { accessToken: data.access_token, realmId: data.realm_id, itemIds: parseItemIds(data.qbo_item_id) };
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

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
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

  return { accessToken: tokens.access_token, realmId: data.realm_id, itemIds: parseItemIds(data.qbo_item_id) };
}

// ── Item setup ────────────────────────────────────────────────────────────────
// QBO requires every line item to reference an Item entity.
// We maintain 5 service items: Days, Hours, Expenses, Equipment Hire, Penalty.
// All are looked up (or created) on first export and cached as JSON in qbo_item_id.

const ITEM_NAMES: Record<keyof ItemIds, string> = {
  days: 'Days',
  hours: 'Hours',
  expenses: 'Expenses',
  equipment: 'Equipment Hire',
  penalty: 'Penalty',
};

async function ensureServiceItems(accessToken: string, realmId: string, userId: string): Promise<ItemIds> {
  const base = getQBOBaseUrl();
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  // Fetch all 5 items in one query
  const names = Object.values(ITEM_NAMES).map(n => `'${n}'`).join(', ');
  const searchQuery = `SELECT * FROM Item WHERE Name IN (${names})`;
  const searchRes = await fetch(
    `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(searchQuery)}&minorversion=75`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );

  if (!searchRes.ok) {
    if (searchRes.status === 401) throw new Error('QBO_AUTH_ERROR');
    throw new Error(`Item search failed (${searchRes.status})`);
  }

  const searchData = await searchRes.json() as { QueryResponse?: { Item?: { Id: string; Name: string }[] } };
  const existingItems = searchData.QueryResponse?.Item ?? [];
  const existingByName = Object.fromEntries(existingItems.map(i => [i.Name, i.Id]));

  // Find income account once (only needed if any items are missing)
  const missingKeys = (Object.keys(ITEM_NAMES) as (keyof ItemIds)[]).filter(
    k => !existingByName[ITEM_NAMES[k]]
  );

  let incomeAccountRef: { Id: string; Name: string } | null = null;
  if (missingKeys.length > 0) {
    const acctQuery = `SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 1`;
    const acctRes = await fetch(
      `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(acctQuery)}&minorversion=75`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!acctRes.ok) {
      if (acctRes.status === 401) throw new Error('QBO_AUTH_ERROR');
      const body = await acctRes.text().catch(() => '');
      console.error('QBO account lookup failed:', acctRes.status, body);
      throw new Error(`Account lookup failed (${acctRes.status})`);
    }
    const acctData = await acctRes.json() as { QueryResponse?: { Account?: { Id: string; Name: string }[] } };
    const acct = acctData.QueryResponse?.Account?.[0];
    if (!acct) throw new Error('No income account found in QuickBooks company.');
    incomeAccountRef = acct;
  }

  // Create any missing items
  const resolvedIds: Partial<ItemIds> = {};
  for (const key of Object.keys(ITEM_NAMES) as (keyof ItemIds)[]) {
    const name = ITEM_NAMES[key];
    if (existingByName[name]) {
      resolvedIds[key] = existingByName[name];
      continue;
    }
    const createRes = await fetch(
      `${base}/v3/company/${realmId}/item?minorversion=75`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          Name: name,
          Type: 'Service',
          IncomeAccountRef: { value: incomeAccountRef!.Id, name: incomeAccountRef!.Name },
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!createRes.ok) {
      if (createRes.status === 401) throw new Error('QBO_AUTH_ERROR');
      throw new Error(`Item creation failed for "${name}" (${createRes.status})`);
    }
    const createData = await createRes.json() as { Item?: { Id: string } };
    const newId = createData.Item?.Id;
    if (!newId) throw new Error(`Item "${name}" created but no Id returned.`);
    resolvedIds[key] = newId;
  }

  const itemIds = resolvedIds as ItemIds;

  // Cache all IDs as JSON
  await supabaseAdmin
    .from('bookkeeping_connections')
    .update({ qbo_item_id: JSON.stringify(itemIds), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('platform', 'quickbooks');

  return itemIds;
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

/** Format YYYY-MM-DD as DD/MM/YYYY for line item descriptions */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function buildDayLines(day: InvoiceDay, items: ItemIds, taxCode: string | null, detailed: boolean): QBOLine[] {
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
        `${li.description}${timeStr} | ${formatDate(day.work_date)}`,
        hourly ? li.hours! : 1,
        hourly ? li.rate! : li.total,
        hourly ? items.hours : items.days,
        taxCode,
      ));
    }
    for (const p of rj.penalties ?? []) {
      const hourly = isHourlyItem(p.hours, p.rate, p.total);
      lines.push(makeLine(
        `${p.description} | ${formatDate(day.work_date)}`,
        hourly ? p.hours! : 1,
        hourly ? p.rate! : p.total,
        items.penalty,
        taxCode,
      ));
    }
    if ((rj.travelPay ?? 0) > 0) {
      lines.push(makeLine(`Travel Pay | ${formatDate(day.work_date)}`, 1, rj.travelPay!, items.days, taxCode));
    }
    if ((rj.mileage ?? 0) > 0) {
      const milesStr = rj.mileageMiles ? ` (${rj.mileageMiles} miles)` : '';
      lines.push(makeLine(`Mileage${milesStr} | ${formatDate(day.work_date)}`, 1, rj.mileage!, items.expenses, taxCode));
    }
  } else {
    const dayTotal = day.grand_total - equipmentNet - expensesAmount;
    lines.push(makeLine(
      `${day.role_name} — ${day.day_type.replace(/_/g, ' ')} | ${formatDate(day.work_date)} | Call: ${day.call_time} Wrap: ${day.wrap_time}`,
      1,
      dayTotal,
      items.days,
      taxCode,
    ));
  }

  if (equipmentNet > 0) {
    lines.push(makeLine(`Equipment | ${formatDate(day.work_date)}`, 1, equipmentNet, items.equipment, taxCode));
  }
  if (expensesAmount > 0) {
    const expDesc = day.expenses_notes
      ? `Expenses — ${day.expenses_notes} | ${formatDate(day.work_date)}`
      : `Expenses | ${formatDate(day.work_date)}`;
    lines.push(makeLine(expDesc, 1, expensesAmount, items.expenses, taxCode));
  }

  return lines;
}

// ── Invoice creation ──────────────────────────────────────────────────────────

async function createInvoice(
  accessToken: string,
  realmId: string,
  customerId: string,
  items: ItemIds,
  payload: {
    invoiceNumber: string;
    projectName: string;
    jobReference: string | null;
    days: InvoiceDay[];
    vatRegistered: boolean;
    clientOutsideUK: boolean;
    detailed: boolean;
  }
): Promise<string> {
  const base = getQBOBaseUrl();
  const taxCode = (payload.vatRegistered && !payload.clientOutsideUK) ? 'TAX' : 'NON';

  const privateNote = [payload.invoiceNumber, payload.projectName, payload.jobReference]
    .filter(Boolean)
    .join(' | ');

  const lines = payload.days.flatMap(day => buildDayLines(day, items, taxCode, payload.detailed));

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
        CustomerMemo: { value: 'Calculation made with CrewDock.app' },
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

  const baseAppUrl = process.env.QBO_SANDBOX === 'true'
    ? 'https://app.sandbox.qbo.intuit.com'
    : 'https://app.qbo.intuit.com';
  return `${baseAppUrl}/app/invoice?txnId=${invoiceId}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { userId, clientName, projectName, jobReference, invoiceNumber, days, vatRegistered, clientOutsideUK, detailed } = req.body;

  if (!userId || !clientName || !days?.length) {
    return res.status(400).json({ error: 'missing_required_fields' });
  }

  try {
    const { accessToken, realmId, itemIds } = await getValidToken(userId);

    // ensureServiceItems handles lookup + creation of all 5 items, then caches them
    const items = itemIds ?? await ensureServiceItems(accessToken, realmId, userId);

    const customerId = await findOrCreateCustomer(accessToken, realmId, clientName);
    const invoiceUrl = await createInvoice(accessToken, realmId, customerId, items, {
      invoiceNumber, projectName, jobReference, days, vatRegistered, clientOutsideUK, detailed,
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
