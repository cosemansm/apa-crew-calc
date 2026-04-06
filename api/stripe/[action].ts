// Vercel Serverless Function — Stripe actions
// POST /api/stripe/create-checkout
// POST /api/stripe/create-portal
// POST /api/stripe/extend-trial

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || 'https://app.crewdock.app';

const sbHeaders = () => ({
  apikey: SUPABASE_SERVICE_ROLE_KEY!,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.query;

  // ── create-checkout ───────────────────────────────────────────────────────

  if (action === 'create-checkout') {
    const { priceId, userId, userEmail } = req.body;
    if (!priceId || !userId || !userEmail) {
      return res.status(400).json({ error: 'Missing priceId, userId, or userEmail' });
    }

    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id,status`,
      { headers: sbHeaders() }
    );
    const rows = await subRes.json();
    const existingRow = rows?.[0];
    let customerId: string = existingRow?.stripe_customer_id;

    if (existingRow?.status === 'active' && customerId) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${APP_URL}/settings`,
      });
      return res.status(200).json({ url: portalSession.url });
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ stripe_customer_id: customerId }),
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/settings?stripe=success`,
      cancel_url: `${APP_URL}/settings`,
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });
  }

  // ── create-portal ─────────────────────────────────────────────────────────

  if (action === 'create-portal') {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id`,
      { headers: sbHeaders() }
    );
    const rows = await subRes.json();
    const customerId = rows?.[0]?.stripe_customer_id;

    if (!customerId) {
      return res.status(404).json({ error: 'No Stripe customer found for this user' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/settings`,
    });

    return res.status(200).json({ url: portalSession.url });
  }

  // ── extend-trial ──────────────────────────────────────────────────────────

  if (action === 'extend-trial') {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Server not configured' });
    }

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=trial_extended`,
      { headers: sbHeaders() }
    );

    if (!getRes.ok) {
      const errText = await getRes.text();
      return res.status(500).json({ error: `Supabase error (${getRes.status}): ${errText}` });
    }

    const rows = await getRes.json();
    if (!Array.isArray(rows)) {
      return res.status(500).json({ error: `Unexpected response from database: ${JSON.stringify(rows)}` });
    }
    if (rows.length === 0) {
      return res.status(404).json({ error: `No subscription row found for user ${userId}` });
    }
    if (rows[0].trial_extended === true) {
      return res.status(409).json({ error: 'Review extension already used' });
    }

    const newTrialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ trial_ends_at: newTrialEnd, trial_extended: true }),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.text();
      return res.status(500).json({ error: `Failed to extend trial: ${err}` });
    }

    return res.status(200).json({ success: true, trial_ends_at: newTrialEnd });
  }

  return res.status(404).json({ error: 'Unknown action' });
}
