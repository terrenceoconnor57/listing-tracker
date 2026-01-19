import { kv } from './_lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cookies = req.cookies || {};
    const sessionId = cookies.session;
    
    if (!sessionId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const session = await kv.get(`session:${sessionId}`);
    if (!session || session.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await kv.get(`user:${session.userId}`);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const emailKey = `email:${user.email}`;
    const monitorIds = await kv.smembers(emailKey) || [];

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

    monitors.sort((a, b) => b.createdAt - a.createdAt);

    return res.status(200).json({ 
      email: user.email,
      monitors,
      schedule: 'Daily at 5:00 AM UTC'
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
}
