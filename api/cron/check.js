import { kv } from '../_lib/redis.js';
import { cleanHtmlToText, sha256 } from '../_lib/hash.js';
import { sendEmail } from '../_lib/email.js';

const FETCH_TIMEOUT_MS = 15000;
const MAX_MONITORS_PER_RUN = 25;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret
  const cronSecret = req.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn('Invalid or missing x-cron-secret header');
    return res.status(401).send('Unauthorized');
  }

  const results = {
    checked: 0,
    changed: 0,
    errors: 0
  };

  try {
    const activeIds = await kv.smembers('monitors:active');
    
    if (!activeIds || activeIds.length === 0) {
      return res.status(200).json({ ...results, message: 'No active monitors' });
    }

    const idsToCheck = activeIds.slice(0, MAX_MONITORS_PER_RUN);

    for (const id of idsToCheck) {
      try {
        const monitorData = await kv.get(`monitor:${id}`);
        
        if (!monitorData) {
          console.warn(`Monitor ${id} not found in KV`);
          continue;
        }

        const monitor = typeof monitorData === 'string' 
          ? JSON.parse(monitorData) 
          : monitorData;

        if (!monitor.active) {
          continue;
        }

        results.checked++;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        let html;
        try {
          const fetchRes = await fetch(monitor.url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; JobAlertBot/1.0)'
            }
          });
          clearTimeout(timeoutId);

          if (!fetchRes.ok) {
            console.error(`Failed to fetch ${monitor.url}: ${fetchRes.status}`);
            results.errors++;
            continue;
          }

          html = await fetchRes.text();
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          console.error(`Fetch error for ${monitor.url}:`, fetchErr.message);
          results.errors++;
          continue;
        }

        const cleanedText = cleanHtmlToText(html);
        const newHash = sha256(cleanedText);

        if (!monitor.lastHash) {
          monitor.lastHash = newHash;
          await kv.set(`monitor:${id}`, monitor);
          console.log(`Initial hash set for ${id}`);
          continue;
        }

        if (newHash !== monitor.lastHash) {
          results.changed++;

          const now = Date.now();
          monitor.lastHash = newHash;
          monitor.lastNotifiedAt = now;

          await kv.set(`monitor:${id}`, monitor);

          const snippet = cleanedText.substring(0, 600);
          const timestamp = new Date(now).toISOString();

          const emailBody = `The page you're tracking has changed!

URL: ${monitor.url}

Detected at: ${timestamp}

Content preview:
${snippet}${cleanedText.length > 600 ? '...' : ''}

---
Competitor Tracker`;

          try {
            await sendEmail(monitor.email, 'Page changed', emailBody);
            console.log(`Email sent to ${monitor.email} for ${monitor.url}`);
          } catch (emailErr) {
            console.error(`Failed to send email to ${monitor.email}:`, emailErr.message);
            results.errors++;
          }
        }

      } catch (monitorErr) {
        console.error(`Error processing monitor ${id}:`, monitorErr.message);
        results.errors++;
      }
    }

  } catch (err) {
    console.error('Cron check error:', err);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json(results);
}
