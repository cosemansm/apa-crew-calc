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

export interface FreeAgentExportPayload {
  clientName: string;
  projectName: string;
  jobReference: string | null;
  invoiceNumber: string;
  days: InvoiceDay[];
  vatRegistered: boolean;
  detailed: boolean;
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
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error('FreeAgent session expired. Please reconnect in Settings.');

  interface RefreshResponse { access_token: string; expires_at: string; }
  const newTokens = await res.json() as RefreshResponse;
  if (!newTokens.access_token) throw new Error('FreeAgent token refresh returned no access token.');
  return newTokens.access_token;
}

// ── Contact lookup / creation ─────────────────────────────────────────────────

async function findOrCreateContact(
  accessToken: string,
  organisationName: string
): Promise<string> {
  type Contact = { organisation_name?: string; url: string };
  let page = 1;
  let match: Contact | undefined;
  while (!match) {
    const res = await fetch(`${BASE_URL}/contacts?view=all&per_page=100&page=${page}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Failed to fetch FreeAgent contacts (${res.status}): ${body}`);
    }
    const { contacts } = await res.json() as { contacts: Contact[] };
    const page_contacts: Contact[] = contacts ?? [];
    if (page_contacts.length === 0) break;
    match = page_contacts.find(
      (c) => c.organisation_name?.toLowerCase() === organisationName.toLowerCase()
    );
    page++;
  }
  if (match) return match.url;

  const createRes = await fetch(`${BASE_URL}/contacts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ contact: { organisation_name: organisationName } }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!createRes.ok) throw new Error('Failed to create FreeAgent contact.');

  const contactUrl = createRes.headers.get('Location');
  if (!contactUrl) throw new Error('FreeAgent contact created but no URL returned.');

  return contactUrl;
}

// ── Invoice item builder ───────────────────────────────────────────────────────

type InvoiceItem = {
  description: string;
  item_type: string;
  quantity: string;
  price: string;
  sales_tax_rate: string;
};

function buildDayItems(day: InvoiceDay, taxRate: string, detailed: boolean): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const rj = day.result_json ?? {};
  const equipmentNet = (rj.equipmentTotal ?? 0) - (rj.equipmentDiscount ?? 0);
  const expensesAmount = day.expenses_amount ?? 0;

  const hasDetailedData = (rj.lineItems?.length ?? 0) > 0;

  if (detailed && hasDetailedData) {
    // Individual line items — distinguish flat day-rate items from genuinely hourly ones.
    // Use a 5% relative tolerance to handle rounding in the calculator (e.g. 4.5h × £67
    // stored as £302 rather than £301.50). Day-rate items fail by hundreds of percent so
    // the 5% band correctly separates them.
    const isHourlyItem = (hours: number | undefined, rate: number | undefined, total: number) =>
      hours != null &&
      rate != null &&
      total > 0 &&
      Math.abs(hours * rate - total) / total < 0.05;

    for (const li of rj.lineItems ?? []) {
      const timeStr = li.timeFrom && li.timeTo ? ` | ${li.timeFrom}–${li.timeTo}` : '';
      const hourly = isHourlyItem(li.hours, li.rate, li.total);
      items.push({
        description: `${li.description}${timeStr} | ${day.work_date}`,
        item_type: hourly ? 'Hours' : 'Days',
        quantity: hourly ? li.hours!.toFixed(2) : '1.0',
        price: hourly ? li.rate!.toFixed(2) : li.total.toFixed(2),
        sales_tax_rate: taxRate,
      });
    }
    // Grace / penalty items — same logic
    for (const p of rj.penalties ?? []) {
      const hourly = isHourlyItem(p.hours, p.rate, p.total);
      items.push({
        description: `${p.description} | ${day.work_date}`,
        item_type: hourly ? 'Hours' : 'Days',
        quantity: hourly ? p.hours!.toFixed(2) : '1.0',
        price: hourly ? p.rate!.toFixed(2) : p.total.toFixed(2),
        sales_tax_rate: taxRate,
      });
    }
    // Travel pay
    if ((rj.travelPay ?? 0) > 0) {
      items.push({
        description: `Travel Pay | ${day.work_date}`,
        item_type: 'Days',
        quantity: '1.0',
        price: rj.travelPay!.toFixed(2),
        sales_tax_rate: taxRate,
      });
    }
    // Mileage
    if ((rj.mileage ?? 0) > 0) {
      const milesStr = rj.mileageMiles ? ` (${rj.mileageMiles} miles)` : '';
      items.push({
        description: `Mileage${milesStr} | ${day.work_date}`,
        item_type: 'Days',
        quantity: '1.0',
        price: rj.mileage!.toFixed(2),
        sales_tax_rate: taxRate,
      });
    }
  } else {
    // Basic: one item per day (day total minus equipment and expenses which are itemised below)
    const dayTotal = day.grand_total - equipmentNet - expensesAmount;
    items.push({
      description: `${day.role_name} — ${day.day_type.replace(/_/g, ' ')} | ${day.work_date} | Call: ${day.call_time} Wrap: ${day.wrap_time}`,
      item_type: 'Days',
      quantity: '1.0',
      price: dayTotal.toFixed(2),
      sales_tax_rate: taxRate,
    });
  }

  // Equipment — always a separate line item
  if (equipmentNet > 0) {
    items.push({
      description: `Equipment | ${day.work_date}`,
      item_type: 'Days',
      quantity: '1.0',
      price: equipmentNet.toFixed(2),
      sales_tax_rate: taxRate,
    });
  }

  // Expenses — always a separate line item, quantity=1 with no day/hour unit
  if (expensesAmount > 0) {
    const expDesc = day.expenses_notes
      ? `Expenses — ${day.expenses_notes} | ${day.work_date}`
      : `Expenses | ${day.work_date}`;
    items.push({
      description: expDesc,
      item_type: 'Expenses',
      quantity: '1.0',
      price: expensesAmount.toFixed(2),
      sales_tax_rate: taxRate,
    });
  }

  return items;
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

  const invoiceItems = payload.days.flatMap(day => buildDayItems(day, taxRate, payload.detailed));

  const body = {
    invoice: {
      contact: contactUrl,
      // No reference — let FreeAgent use its own numbering sequence
      status: 'Draft',
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
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create FreeAgent invoice: ${err}`);
  }

  const toWebUrl = (apiUrl: string) =>
    apiUrl.replace('https://api.freeagent.com/v2/', 'https://app.freeagent.com/');

  const locationHeader = res.headers.get('Location');
  if (locationHeader) return toWebUrl(locationHeader);

  // Fallback: FreeAgent sometimes returns the URL in the response body
  try {
    const data = await res.json() as { invoice?: { url?: string } };
    const bodyUrl = data?.invoice?.url;
    if (bodyUrl) return toWebUrl(bodyUrl);
  } catch { /* ignore parse errors */ }

  throw new Error('Invoice created but FreeAgent returned no URL.');
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
  const { error } = await supabase
    .from('bookkeeping_connections')
    .delete()
    .eq('user_id', userId)
    .eq('platform', 'freeagent');
  if (error) throw new Error('Failed to disconnect FreeAgent.');
}
