import { kv } from './_lib/redis.js';
import { sendEmail } from './_lib/email.js';
import { getUserFromSession } from './_lib/auth.js';

const FREE_LIMIT = 2;

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
  try {
    // Check authentication
    const user = await getUserFromSession(request);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { url } = await request.json();
    const email = user.email; // Use authenticated user's email

    // Validate URL
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check how many free monitors this email has
    const emailKey = `email:${email.toLowerCase()}`;
    const existingMonitors = await kv.smembers(emailKey) || [];
    
    // Count only free (non-paid) monitors
    let freeCount = 0;
    for (const monitorId of existingMonitors) {
      const monitorData = await kv.get(`monitor:${monitorId}`);
      if (monitorData) {
        const monitor = typeof monitorData === 'string' ? JSON.parse(monitorData) : monitorData;
        if (!monitor.paid && monitor.active) {
          freeCount++;
        }
      }
    }

    if (freeCount >= FREE_LIMIT) {
      return new Response(JSON.stringify({ 
        error: 'Free limit reached',
        requiresPayment: true,
        freeUsed: freeCount,
        freeLimit: FREE_LIMIT
      }), {
        status: 402, // Payment Required
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create free monitor
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
      paid: false
    };

    // Store monitor
    await kv.set(`monitor:${id}`, monitor);
    
    // Add to active set
    await kv.sadd('monitors:active', id);
    
    // Track by email
    await kv.sadd(emailKey, id);

    console.log(`Free monitor created: ${id} for ${url} (${email})`);

    // Fetch page info and send welcome email
    const pageInfo = await fetchPageInfo(url);
    
    const emailBody = `You're now monitoring this page!

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
      console.log(`Welcome email sent to ${email}`);
    } catch (emailErr) {
      console.error('Failed to send welcome email:', emailErr.message);
      // Don't fail the request if email fails
    }

    return new Response(JSON.stringify({ 
      success: true,
      id,
      freeUsed: freeCount + 1,
      freeLimit: FREE_LIMIT
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Add monitor error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create monitor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Check free usage for an email (requires auth)
export async function GET(request) {
  try {
    // Check authentication
    const user = await getUserFromSession(request);
    if (!user) {
      return new Response(JSON.stringify({ 
        freeUsed: 0,
        freeLimit: FREE_LIMIT,
        canAddFree: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const email = user.email;
    const emailKey = `email:${email.toLowerCase()}`;
    const existingMonitors = await kv.smembers(emailKey) || [];
    
    let freeCount = 0;
    for (const monitorId of existingMonitors) {
      const monitorData = await kv.get(`monitor:${monitorId}`);
      if (monitorData) {
        const monitor = typeof monitorData === 'string' ? JSON.parse(monitorData) : monitorData;
        if (!monitor.paid && monitor.active) {
          freeCount++;
        }
      }
    }

    return new Response(JSON.stringify({ 
      freeUsed: freeCount,
      freeLimit: FREE_LIMIT,
      canAddFree: freeCount < FREE_LIMIT
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Check usage error:', err);
    return new Response(JSON.stringify({ error: 'Failed to check usage' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
