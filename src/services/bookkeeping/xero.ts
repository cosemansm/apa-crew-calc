import { supabase } from '@/lib/supabase';

const BASE_URL = 'https://api.xero.com/api.xro/2.0';

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

// Thrown when Xero rejects the token — signals the UI to prompt reconnect
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
  if (!isExpired) return { accessToken: data.access_token, tenantId: data.tenant_id };

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
  };

  const searchRes = await fetch(
    `${BASE_URL}/Contacts?searchTerm=${encodeURIComponent(name)}`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );

  if (!searchRes.ok) {
    if (searchRes.status === 401) throw new XeroAuthError();
    const body = await searchRes.text().catch(() => '');
    throw new Error(`Failed to fetch Xero contacts (${searchRes.status}): ${body}`);
  }

  type XeroContact = { ContactID: string; Name: string };
  const { Contacts } = await searchRes.json() as { Contacts: XeroContact[] };
  const match = (Contacts ?? []).find(
    (c) => c.Name?.toLowerCase() === name.toLowerCase()
  );
  if (match) return match.ContactID;

  const createRes = await fetch(`${BASE_URL}/Contacts`, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ Contacts: [{ Name: name }] }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!createRes.ok) {
    if (createRes.status === 401) throw new XeroAuthError();
    const body = await createRes.text().catch(() => '');
    throw new Error(`Failed to create Xero contact: ${body}`);
  }

  const data = await createRes.json() as { Contacts: XeroContact[] };
  const contactId = data?.Contacts?.[0]?.ContactID;
  if (!contactId) throw new Error('Xero contact created but no ContactID returned.');
  return contactId;
}

// ── Invoice item builder ───────────────────────────────────────────────────────

type XeroLineItem = {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  AccountCode: string;
  TaxType: string;
};

const XERO_ACCOUNT_CODE = '200';

function buildXeroDayLineItems(day: InvoiceDay, taxType: string, detailed: boolean): XeroLineItem[] {
  const items: XeroLineItem[] = [];
  const rj = day.result_json ?? {};
  const equipmentNet = (rj.equipmentTotal ?? 0) - (rj.equipmentDiscount ?? 0);
  const expensesAmount = day.expenses_amount ?? 0;

  const hasDetailedData = (rj.lineItems?.length ?? 0) > 0;

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
    // Grace / penalty items — same logic
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
    // Travel pay
    if ((rj.travelPay ?? 0) > 0) {
      items.push({
        Description: `Travel Pay | ${day.work_date}`,
        Quantity: 1,
        UnitAmount: rj.travelPay!,
        AccountCode: XERO_ACCOUNT_CODE,
        TaxType: taxType,
      });
    }
    // Mileage
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
    // Basic: one item per day (day total minus equipment and expenses which are itemised below)
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
  const taxType = payload.vatRegistered ? 'OUTPUT2' : 'NONE';

  const today = new Date().toISOString().split('T')[0];
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  const reference = [payload.invoiceNumber, payload.projectName, payload.jobReference]
    .filter(Boolean)
    .join(' | ');

  const lineItems = payload.days.flatMap(day => buildXeroDayLineItems(day, taxType, payload.detailed));

  const body = {
    Invoices: [{
      Type: 'ACCREC',
      Contact: { ContactID: contactId },
      Reference: reference,
      Status: 'DRAFT',
      DateString: today,
      DueDateString: dueDateStr,
      CurrencyCode: 'GBP',
      LineItems: lineItems,
    }],
  };

  const res = await fetch(`${BASE_URL}/Invoices`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    if (res.status === 401) throw new XeroAuthError();
    const err = await res.text().catch(() => '');
    throw new Error(`Failed to create Xero invoice: ${err}`);
  }

  const data = await res.json() as { Invoices: { InvoiceID: string }[] };
  const invoiceId = data?.Invoices?.[0]?.InvoiceID;
  if (!invoiceId) throw new Error('Invoice created but Xero returned no InvoiceID.');

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
