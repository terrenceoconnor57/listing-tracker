import Stripe from 'stripe';
import { kv } from '@vercel/kv';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    const url = session.metadata?.url;
    const email = session.metadata?.email;

    if (!url || !email) {
      console.error('Missing metadata in session:', session.id);
      return new Response('Missing metadata', { status: 400 });
    }

    try {
      // Generate unique ID
      const id = crypto.randomUUID();
      const now = Date.now();

      // Create monitor object
      const monitor = {
        id,
        url,
        email,
        lastHash: '',
        lastNotifiedAt: 0,
        createdAt: now,
        active: true
      };

      // Store monitor data
      await kv.set(`monitor:${id}`, JSON.stringify(monitor));

      // Add to active monitors set
      await kv.sadd('monitors:active', id);

      console.log(`Monitor created: ${id} for ${url}`);

    } catch (err) {
      console.error('Failed to create monitor:', err);
      return new Response('Failed to create monitor', { status: 500 });
    }
  }

  return new Response('OK', { status: 200 });
}
