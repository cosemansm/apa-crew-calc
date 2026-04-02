// Vercel Serverless Function — handles Stripe webhook events
// bodyParser must be disabled to allow raw body access for signature verification

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const config = { api: { bodyParser: false } };

async function getRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function updateSubscription(customerId: string, patch: Record<string, unknown>) {
  // First try matching by stripe_customer_id (fast path)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?stripe_customer_id=eq.${customerId}&select=id`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await res.json();

  let filter = `stripe_customer_id=eq.${customerId}`;

  // Fallback: customer ID not stored yet — look up via Stripe customer metadata
  if (!Array.isArray(rows) || rows.length === 0) {
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const userId = customer.metadata?.supabase_user_id;
    if (!userId) return; // can't identify the user
    // Also store the customer ID so future events match the fast path
    filter = `user_id=eq.${userId}`;
    patch = { ...patch, stripe_customer_id: customerId };
  }

  await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?${filter}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${String(err)}` });
  }

  const object = event.data.object as any;
  const customerId: string = object.customer;

  // API version 2026-03-25.dahlia moved current_period_end into items.data[0]
  const periodEndTs: number | undefined =
    object.current_period_end ?? object.items?.data?.[0]?.current_period_end;
  const periodEndIso = periodEndTs ? new Date(periodEndTs * 1000).toISOString() : null;

  switch (event.type) {
    case 'customer.subscription.created':
      await updateSubscription(customerId, {
        stripe_subscription_id: object.id,
        status: 'active',
        current_period_end: periodEndIso,
      });
      break;

    case 'customer.subscription.updated':
      await updateSubscription(customerId, {
        status: object.status === 'trialing' ? 'active' : object.status,
        current_period_end: periodEndIso,
      });
      break;

    case 'customer.subscription.deleted':
      await updateSubscription(customerId, {
        status: 'canceled',
        current_period_end: null,
      });
      break;

    case 'invoice.payment_failed':
      await updateSubscription(customerId, { status: 'past_due' });
      break;

    default:
      // Unhandled event type — ignore
      break;
  }

  return res.status(200).json({ received: true });
}
