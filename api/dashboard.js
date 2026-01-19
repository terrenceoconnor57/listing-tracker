import { kv } from './_lib/redis.js';
import { getUserFromSession } from './_lib/auth.js';

export async function GET(request) {
  try {
    // Check authentication
    const user = await getUserFromSession(request);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user's monitor IDs
    const emailKey = `email:${user.email}`;
    const monitorIds = await kv.smembers(emailKey) || [];

    // Fetch all monitors
    const monitors = [];
    for (const id of monitorIds) {
      const monitorData = await kv.get(`monitor:${id}`);
      if (monitorData) {
        const monitor = typeof monitorData === 'string' ? JSON.parse(monitorData) : monitorData;
        monitors.push({
          id: monitor.id,
          url: monitor.url,
          active: monitor.active,
          paid: monitor.paid,
          createdAt: monitor.createdAt,
          lastNotifiedAt: monitor.lastNotifiedAt,
          hasHash: !!monitor.lastHash
        });
      }
    }

    // Sort by createdAt descending
    monitors.sort((a, b) => b.createdAt - a.createdAt);

    return new Response(JSON.stringify({ 
      email: user.email,
      monitors,
      schedule: 'Daily at 5:00 AM UTC'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    return new Response(JSON.stringify({ error: 'Failed to load dashboard' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
