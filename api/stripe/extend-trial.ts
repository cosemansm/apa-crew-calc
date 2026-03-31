// Vercel Serverless Function — grants 14-day review extension (one-time, honour system)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  // Fetch current subscription via service role
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=trial_extended`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await getRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  if (rows[0].trial_extended === true) {
    return res.status(409).json({ error: 'Review extension already used' });
  }

  // Grant extension: +14 days from now, mark as used
  const newTrialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        trial_ends_at: newTrialEnd,
        trial_extended: true,
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return res.status(500).json({ error: `Failed to extend trial: ${err}` });
  }

  return res.status(200).json({ success: true, trial_ends_at: newTrialEnd });
}
