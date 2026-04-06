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

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

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
  if (!refresh_token || !user_id || !UUID_RE.test(user_id)) {
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

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

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
