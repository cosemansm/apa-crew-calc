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
