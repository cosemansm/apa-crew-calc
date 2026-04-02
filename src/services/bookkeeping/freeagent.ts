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
