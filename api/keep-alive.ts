// Vercel Cron — runs every 6 days to keep Supabase free-tier DB active

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: any, res: any) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?select=user_id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    return res.status(500).json({ error: `Supabase error (${response.status}): ${errText}` });
  }

  return res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
}
