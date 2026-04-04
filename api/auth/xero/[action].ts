// Vercel Serverless Function — handles all Xero OAuth actions in one function
// Routes: /api/auth/xero/start  /api/auth/xero/callback  /api/auth/xero/refresh
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64URLEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Start ─────────────────────────────────────────────────────────────────────

function handleStart(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'xero_not_configured' });
  }

  const userId = req.query.userId as string;
  if (!userId || !UUID_RE.test(userId)) {
    return res.status(400).json({ error: 'missing_or_invalid_user_id' });
  }

  // PKCE S256 — no cookies needed; verifier travels in state alongside userId
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );

  // Encode both userId and codeVerifier in state as base64url JSON
  const state = Buffer.from(JSON.stringify({ userId, codeVerifier })).toString('base64url');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email accounting.transactions accounting.contacts offline_access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  res.redirect(`https://login.xero.com/identity/connect/authorize?${params}`);
}

// ── Callback ──────────────────────────────────────────────────────────────────

async function handleCallback(req: VercelRequest, res: VercelResponse) {
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

  // Decode state to extract userId and codeVerifier (encoded by start handler)
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

// ── Refresh ───────────────────────────────────────────────────────────────────

async function handleRefresh(req: VercelRequest, res: VercelResponse) {
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

  // Xero issues a new refresh token on each refresh — always store the latest one
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
