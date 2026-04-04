// Vercel Serverless Function — handles all FreeAgent OAuth actions in one function
// Routes: /api/auth/freeagent/start  /api/auth/freeagent/callback  /api/auth/freeagent/refresh
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FA_TOKEN_URL = 'https://api.freeagent.com/v2/token_endpoint';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Start ─────────────────────────────────────────────────────────────────────

function handleStart(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.FREEAGENT_CLIENT_ID;
  const redirectUri = process.env.FREEAGENT_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'freeagent_not_configured' });
  }

  const userId = req.query.userId as string;
  if (!userId || !UUID_RE.test(userId)) {
    return res.status(400).json({ error: 'missing_or_invalid_user_id' });
  }

  // Encode state as base64url JSON — keeps userId opaque in the redirect URL
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  });

  const approveBase = process.env.FREEAGENT_SANDBOX === 'true'
    ? 'https://api.sandbox.freeagent.com/v2'
    : 'https://api.freeagent.com/v2';
  res.redirect(`${approveBase}/approve_app?${params}`);
}

// ── Callback ──────────────────────────────────────────────────────────────────

async function handleCallback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.FREEAGENT_CLIENT_ID;
  const clientSecret = process.env.FREEAGENT_CLIENT_SECRET;
  const redirectUri = process.env.FREEAGENT_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect(`/settings?error=freeagent_not_configured`);
  }

  const { code, state, error } = req.query;
  // Normalise string | string[] — take the first value if an array is passed
  const codeStr = Array.isArray(code) ? code[0] : code;
  const stateStr = Array.isArray(state) ? state[0] : state;

  if (error) return res.redirect(`/settings?error=freeagent_denied`);
  if (!codeStr || !stateStr) return res.redirect(`/settings?error=invalid_callback`);

  // Decode base64url JSON state to extract userId
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

  const tokenRes = await fetch(FA_TOKEN_URL, {
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

  if (!tokenRes.ok) {
    console.error('FreeAgent token exchange failed:', await tokenRes.text());
    return res.redirect(`/settings?error=freeagent_token_failed`);
  }

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    console.error('FreeAgent token response missing access_token:', tokens);
    return res.redirect(`/settings?error=freeagent_token_failed`);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: dbError } = await supabaseAdmin
    .from('bookkeeping_connections')
    .upsert(
      {
        user_id: userId,
        platform: 'freeagent',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    );

  if (dbError) {
    console.error('Failed to store FreeAgent tokens:', dbError);
    return res.redirect(`/settings?error=freeagent_db_failed`);
  }

  res.redirect(`/settings?connected=freeagent`);
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function handleRefresh(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const clientId = process.env.FREEAGENT_CLIENT_ID;
  const clientSecret = process.env.FREEAGENT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'freeagent_not_configured' });
  }

  const { refresh_token, user_id } = req.body as { refresh_token?: string; user_id?: string };
  if (!refresh_token || !user_id) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let tokenRes: Response;
  try {
    tokenRes = await fetch(FA_TOKEN_URL, {
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
    return res.status(503).json({ error: 'freeagent_unreachable' });
  }

  if (!tokenRes.ok) return res.status(401).json({ error: 'refresh_failed' });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return res.status(401).json({ error: 'refresh_failed' });
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // FreeAgent refresh tokens rotate — always store the new one
  const { error: dbError } = await supabaseAdmin
    .from('bookkeeping_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user_id)
    .eq('platform', 'freeagent');

  if (dbError) {
    console.error('Failed to update FreeAgent tokens:', dbError);
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
