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
  clientOutsideUK: boolean;
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
