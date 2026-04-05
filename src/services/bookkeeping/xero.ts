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

// ── Public API ────────────────────────────────────────────────────────────────

// Delegates to a serverless function to avoid CORS restrictions —
// Xero's API does not allow direct browser-side requests.
export async function exportToXero(
  userId: string,
  payload: XeroExportPayload
): Promise<{ invoiceUrl: string }> {
  const res = await fetch('/api/xero/export-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...payload }),
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 401) throw new XeroAuthError();

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Export failed (${res.status})`);
  }

  const data = await res.json() as { invoiceUrl: string };
  return { invoiceUrl: data.invoiceUrl };
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
