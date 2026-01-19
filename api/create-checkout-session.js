import Stripe from 'stripe';
import { kv } from './_lib/redis.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getUser(req) {
  const cookies = req.cookies || {};
  const sessionId = cookies.session;
  
  if (!sessionId) return null;

  const session = await kv.get(`session:${sessionId}`);
  if (!session || session.expiresAt < Date.now()) return null;

  const user = await kv.get(`user:${session.userId}`);
  return user;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await getUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { url } = req.body;
    const email = user.email;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const origin = req.headers.origin || `https://${req.headers.host}` || 'https://listing-tracker.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      metadata: {
        url,
        email
      },
      customer_email: email,
      success_url: `${origin}/success.html`,
      cancel_url: `${origin}/cancel.html`
    });

    return res.status(200).json({ checkoutUrl: session.url });

  } catch (err) {
    console.error('Checkout session error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
