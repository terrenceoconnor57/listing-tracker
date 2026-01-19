import { kv } from './_lib/redis.js';
import { sendEmail } from './_lib/email.js';

const FREE_LIMIT = 2;

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
  if (req.method === 'GET') {
    try {
      const user = await getUser(req);
      if (!user) {
        return res.status(200).json({ freeUsed: 0, freeLimit: FREE_LIMIT, canAddFree: true });
      }

      const emailKey = `email:${user.email.toLowerCase()}`;
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

      return res.status(200).json({ 
        freeUsed: freeCount,
        freeLimit: FREE_LIMIT,
        canAddFree: freeCount < FREE_LIMIT
      });

    } catch (err) {
      console.error('Check usage error:', err);
      return res.status(500).json({ error: 'Failed to check usage' });
    }
  }

  if (req.method === 'POST') {
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

      if (freeCount >= FREE_LIMIT) {
        return res.status(402).json({ 
          error: 'Free limit reached',
          requiresPayment: true,
          freeUsed: freeCount,
          freeLimit: FREE_LIMIT
        });
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
        paid: false
      };

      await kv.set(`monitor:${id}`, monitor);
      await kv.sadd('monitors:active', id);
      await kv.sadd(emailKey, id);

      console.log(`Free monitor created: ${id} for ${url} (${email})`);

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
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr.message);
      }

      return res.status(200).json({ 
        success: true,
        id,
        freeUsed: freeCount + 1,
        freeLimit: FREE_LIMIT
      });

    } catch (err) {
      console.error('Add monitor error:', err);
      return res.status(500).json({ error: 'Failed to create monitor' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
