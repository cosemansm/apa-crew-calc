// Vercel Serverless Function — creates a Xero contact + draft invoice server-side
// Called by src/services/bookkeeping/xero.ts to avoid browser CORS restrictions
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const XERO_BASE_URL = 'https://api.xero.com/api.xro/2.0';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_ACCOUNT_CODE = '200';

// ── Token helpers ─────────────────────────────────────────────────────────────

async function getValidToken(userId: string): Promise<{ accessToken: string; tenantId: string }> {
  const { data, error } = await supabaseAdmin
    .from('bookkeeping_connections')
    .select('access_token, refresh_token, expires_at, tenant_id')
    .eq('user_id', userId)
    .eq('platform', 'xero')
    .single();

  if (error || !data) throw new Error('Xero not connected.');
  if (!data.tenant_id) throw new Error('No Xero organisation found. Please reconnect in Settings.');

  const isExpired = Date.now() > new Date(data.expires_at).getTime() - 60_000;
  if (!isExpired) return { accessToken: data.access_token, tenantId: data.tenant_id };

  // Refresh the token directly here (no HTTP round-trip needed — we're already server-side)
  const clientId = process.env.XERO_CLIENT_ID!;
  const clientSecret = process.env.XERO_CLIENT_SECRET!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenRes = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!tokenRes.ok) throw new Error('XERO_AUTH_ERROR');

  const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };
  if (!tokens.access_token) throw new Error('XERO_AUTH_ERROR');

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
    .eq('platform', 'xero');

  return { accessToken: tokens.access_token, tenantId: data.tenant_id };
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
  };

  const searchRes = await fetch(
    `${XERO_BASE_URL}/Contacts?searchTerm=${encodeURIComponent(name)}`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );

  if (!searchRes.ok) {
    if (searchRes.status === 401) throw new Error('XERO_AUTH_ERROR');
    throw new Error(`Failed to fetch Xero contacts (${searchRes.status})`);
  }

  type XeroContact = { ContactID: string; Name: string };
  const { Contacts } = await searchRes.json() as { Contacts: XeroContact[] };
  const match = (Contacts ?? []).find((c) => c.Name?.toLowerCase() === name.toLowerCase());
  if (match) return match.ContactID;

  const createRes = await fetch(`${XERO_BASE_URL}/Contacts`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Contacts: [{ Name: name }] }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!createRes.ok) {
    if (createRes.status === 401) throw new Error('XERO_AUTH_ERROR');
    throw new Error(`Failed to create Xero contact (${createRes.status})`);
  }

  const data = await createRes.json() as { Contacts: XeroContact[] };
  const contactId = data?.Contacts?.[0]?.ContactID;
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

function buildDayLineItems(day: InvoiceDay, taxType: string, detailed: boolean): XeroLineItem[] {
  const items: XeroLineItem[] = [];
  const rj = day.result_json ?? {};
  const equipmentNet = (rj.equipmentTotal ?? 0) - (rj.equipmentDiscount ?? 0);
  const expensesAmount = day.expenses_amount ?? 0;

  const hasDetailedData = (rj.lineItems?.length ?? 0) > 0;

  const isHourlyItem = (hours: number | undefined, rate: number | undefined, total: number) =>
    hours != null && rate != null && total > 0 && Math.abs(hours * rate - total) / total < 0.05;

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
      items.push({ Description: `Travel Pay | ${day.work_date}`, Quantity: 1, UnitAmount: rj.travelPay!, AccountCode: XERO_ACCOUNT_CODE, TaxType: taxType });
    }
    if ((rj.mileage ?? 0) > 0) {
      const milesStr = rj.mileageMiles ? ` (${rj.mileageMiles} miles)` : '';
      items.push({ Description: `Mileage${milesStr} | ${day.work_date}`, Quantity: 1, UnitAmount: rj.mileage!, AccountCode: XERO_ACCOUNT_CODE, TaxType: taxType });
    }
  } else {
    const dayTotal = day.grand_total - equipmentNet - expensesAmount;
    items.push({
      Description: `${day.role_name} — ${day.day_type.replace(/_/g, ' ')} | ${day.work_date} | Call: ${day.call_time} Wrap: ${day.wrap_time}`,
      Quantity: 1,
      UnitAmount: dayTotal,
      AccountCode: XERO_ACCOUNT_CODE,
      TaxType: taxType,
    });
  }

  if (equipmentNet > 0) {
    items.push({ Description: `Equipment | ${day.work_date}`, Quantity: 1, UnitAmount: equipmentNet, AccountCode: XERO_ACCOUNT_CODE, TaxType: taxType });
  }

  if (expensesAmount > 0) {
    const expDesc = day.expenses_notes
      ? `Expenses — ${day.expenses_notes} | ${day.work_date}`
      : `Expenses | ${day.work_date}`;
    items.push({ Description: expDesc, Quantity: 1, UnitAmount: expensesAmount, AccountCode: XERO_ACCOUNT_CODE, TaxType: taxType });
  }

  return items;
}

// ── Invoice creation ──────────────────────────────────────────────────────────

async function createInvoice(
  accessToken: string,
  tenantId: string,
  contactId: string,
  payload: {
    clientName: string;
    projectName: string;
    jobReference: string | null;
    invoiceNumber: string;
    days: InvoiceDay[];
    vatRegistered: boolean;
    clientOutsideUK: boolean;
    detailed: boolean;
  }
): Promise<string> {
  const taxType = !payload.vatRegistered
    ? 'NONE'
    : payload.clientOutsideUK
      ? 'ZERORATEDOUTPUT'
      : 'OUTPUT2';
  const today = new Date().toISOString().split('T')[0];
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const reference = [payload.invoiceNumber, payload.projectName, payload.jobReference]
    .filter(Boolean)
    .join(' | ');

  const lineItems = payload.days.flatMap(day => buildDayLineItems(day, taxType, payload.detailed));

  const res = await fetch(`${XERO_BASE_URL}/Invoices`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      Invoices: [{
        Type: 'ACCREC',
        Contact: { ContactID: contactId },
        Reference: reference,
        Status: 'DRAFT',
        DateString: today,
        DueDateString: dueDate.toISOString().split('T')[0],
        CurrencyCode: 'GBP',
        LineItems: lineItems,
      }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('XERO_AUTH_ERROR');
    const err = await res.text().catch(() => '');
    throw new Error(`Failed to create Xero invoice: ${err}`);
  }

  const data = await res.json() as { Invoices: { InvoiceID: string }[] };
  const invoiceId = data?.Invoices?.[0]?.InvoiceID;
  if (!invoiceId) throw new Error('Invoice created but Xero returned no InvoiceID.');

  return `https://go.xero.com/AccountsReceivable/Edit.aspx?InvoiceID=${invoiceId}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { userId, clientName, projectName, jobReference, invoiceNumber, days, vatRegistered, clientOutsideUK, detailed } = req.body;

  if (!userId || !clientName || !days?.length) {
    return res.status(400).json({ error: 'missing_required_fields' });
  }

  try {
    const { accessToken, tenantId } = await getValidToken(userId);
    const contactId = await findOrCreateContact(accessToken, tenantId, clientName);
    const invoiceUrl = await createInvoice(accessToken, tenantId, contactId, {
      clientName, projectName, jobReference, invoiceNumber, days, vatRegistered, clientOutsideUK, detailed,
    });
    return res.status(200).json({ invoiceUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'XERO_AUTH_ERROR') {
      return res.status(401).json({ error: 'XERO_AUTH_ERROR' });
    }
    console.error('Xero export error:', message);
    return res.status(500).json({ error: message });
  }
}
