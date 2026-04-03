// Vercel Serverless Function — initiates FreeAgent OAuth flow
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function handler(req: VercelRequest, res: VercelResponse) {
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

  const nonce = crypto.randomBytes(16).toString('hex');
  // Encode state as base64url JSON — keeps userId opaque in the redirect URL
  const state = Buffer.from(JSON.stringify({ nonce, userId })).toString('base64url');

  res.setHeader(
    'Set-Cookie',
    `fa_oauth_nonce=${nonce}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );

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
