import Stripe from 'stripe';
import { kv } from './_lib/redis.js';
import { sendEmail } from './_lib/email.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Fetch page info and extract title/description
async function fetchPageInfo(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobAlertBot/1.0)',
        'Accept': 'text/html'
      }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { title: null, description: null };
    }

    const html = await res.text();
    
    const decode = (str) => str
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
      .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\\'/g, "'");

    let title = null;
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = decode(titleMatch[1].trim()).substring(0, 150);
    }

    let description = null;
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (descMatch) {
      description = decode(descMatch[1].trim()).substring(0, 300);
    }

    return { title, description };
  } catch (err) {
    console.log('Failed to fetch page info:', err.message);
    return { title: null, description: null };
  }
}

// Disable body parsing for Stripe signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to read raw body
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Stripe webhook endpoint');
  }

  try {
    const buf = await buffer(req);
    const rawBody = buf.toString('utf8');
    const sig = req.headers['stripe-signature'];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      const url = session.metadata?.url;
      const email = session.metadata?.email;

      if (!url || !email) {
        console.error('Missing metadata in session:', session.id);
        return res.status(400).send('Missing metadata');
      }

      const id = crypto.randomUUID();
      const now = Date.now();

      const monitor = {
        id,
        url,
        email: email.toLowerCase(),
        lastHash: '',
        lastNotifiedAt: 0,
        createdAt: now,
        active: true,
        paid: true
      };

      await kv.set(`monitor:${id}`, monitor);
      await kv.sadd('monitors:active', id);
      await kv.sadd(`email:${email.toLowerCase()}`, id);

      console.log(`Paid monitor created: ${id} for ${url}`);

      const pageInfo = await fetchPageInfo(url);
      
      const emailBody = `Thanks for your purchase! You're now monitoring this page.

${pageInfo.title ? `📋 ${pageInfo.title}` : '📋 Page'}

🔗 ${url}

${pageInfo.description ? `${pageInfo.description}\n\n` : ''}We'll check this page daily at 5am UTC and email you immediately if anything changes.

---
Competitor Tracker`;

      try {
        await sendEmail(
          email.toLowerCase(),
          pageInfo.title ? `Now monitoring: ${pageInfo.title.substring(0, 50)}` : 'Now monitoring your page',
          emailBody
        );
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr.message);
      }
    }

    return res.status(200).send('OK');
    
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).send('Internal error');
  }
}
