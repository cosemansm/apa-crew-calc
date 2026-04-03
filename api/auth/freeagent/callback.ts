// Vercel Serverless Function — completes FreeAgent OAuth flow and stores tokens
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FA_TOKEN_URL = 'https://api.freeagent.com/v2/token_endpoint';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
