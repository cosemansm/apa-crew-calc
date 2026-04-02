import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'missing_user_id' });

  // CSRF nonce + userId encoded together in state
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = `${nonce}:${userId}`;

  res.setHeader(
    'Set-Cookie',
    `fa_oauth_nonce=${nonce}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
  );

  const params = new URLSearchParams({
    client_id: process.env.FREEAGENT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.FREEAGENT_REDIRECT_URI!,
    state,
  });

  res.redirect(`https://api.freeagent.com/v2/approve_app?${params}`);
}
