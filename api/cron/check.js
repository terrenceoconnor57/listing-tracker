import { kv } from '@vercel/kv';
import { cleanHtmlToText, sha256 } from '../_lib/hash.js';
import { sendEmail } from '../_lib/email.js';

const FETCH_TIMEOUT_MS = 15000;
const MAX_MONITORS_PER_RUN = 25;

export async function GET(request) {
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn('Invalid or missing x-cron-secret header');
    return new Response('Unauthorized', { status: 401 });
  }

  // Optional: log if user-agent check (don't hard fail)
  const userAgent = request.headers.get('user-agent') || '';
  if (!userAgent.includes('vercel-cron/1.0')) {
    console.log('Note: user-agent does not include vercel-cron/1.0:', userAgent);
  }

  const results = {
    checked: 0,
    changed: 0,
    errors: 0
  };

  try {
    // Get active monitor IDs
    const activeIds = await kv.smembers('monitors:active');
    
    if (!activeIds || activeIds.length === 0) {
      return new Response(JSON.stringify({ ...results, message: 'No active monitors' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Limit monitors per run
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

        // Fetch the URL with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        let html;
        try {
          const res = await fetch(monitor.url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; JobAlertBot/1.0)'
            }
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            console.error(`Failed to fetch ${monitor.url}: ${res.status}`);
            results.errors++;
            continue;
          }

          html = await res.text();
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          console.error(`Fetch error for ${monitor.url}:`, fetchErr.message);
          results.errors++;
          continue;
        }

        // Clean and hash
        const cleanedText = cleanHtmlToText(html);
        const newHash = sha256(cleanedText);

        // First check - just set hash, don't notify
        if (!monitor.lastHash) {
          monitor.lastHash = newHash;
          await kv.set(`monitor:${id}`, JSON.stringify(monitor));
          console.log(`Initial hash set for ${id}`);
          continue;
        }

        // Check if changed
        if (newHash !== monitor.lastHash) {
          results.changed++;

          const now = Date.now();
          monitor.lastHash = newHash;
          monitor.lastNotifiedAt = now;

          // Update in KV
          await kv.set(`monitor:${id}`, JSON.stringify(monitor));

          // Send email notification
          const snippet = cleanedText.substring(0, 600);
          const timestamp = new Date(now).toISOString();

          const emailBody = `The job posting you're tracking has changed!

URL: ${monitor.url}

Detected at: ${timestamp}

Content preview:
${snippet}${cleanedText.length > 600 ? '...' : ''}

---
Job Posting Alert`;

          try {
            await sendEmail(monitor.email, 'Job posting changed', emailBody);
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
