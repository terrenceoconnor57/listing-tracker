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
    
    // Decode HTML entities
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

    // Extract title
    let title = null;
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = decode(titleMatch[1].trim()).substring(0, 150);
    }

    // Extract meta description
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

      // Create paid monitor object
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

      // Store monitor data
      await kv.set(`monitor:${id}`, monitor);

      // Add to active monitors set
      await kv.sadd('monitors:active', id);

      // Track by email
      const emailKey = `email:${email.toLowerCase()}`;
      await kv.sadd(emailKey, id);

      console.log(`Paid monitor created: ${id} for ${url}`);

      // Fetch page info and send welcome email
      const pageInfo = await fetchPageInfo(url);
      
      const emailBody = `Thanks for your purchase! You're now monitoring this job posting.

${pageInfo.title ? `📋 ${pageInfo.title}` : '📋 Job Posting'}

🔗 ${url}

${pageInfo.description ? `${pageInfo.description}\n\n` : ''}We'll check this page daily at 5am UTC and email you immediately if anything changes.

---
Job Posting Alert`;

      try {
        await sendEmail(
          email.toLowerCase(),
          pageInfo.title ? `Now monitoring: ${pageInfo.title.substring(0, 50)}` : 'Now monitoring your job posting',
          emailBody
        );
        console.log(`Welcome email sent to ${email}`);
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr.message);
      }

    } catch (err) {
      console.error('Failed to create monitor:', err);
      return new Response('Failed to create monitor', { status: 500 });
    }
  }

  return new Response('OK', { status: 200 });
}
