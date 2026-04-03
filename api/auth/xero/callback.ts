// Vercel Serverless Function — completes Xero OAuth flow and stores tokens
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

  // Decode state to extract userId and codeVerifier (encoded by start.ts)
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

  // Exchange code + PKCE verifier for tokens using HTTP Basic Auth
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
