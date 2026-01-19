import { kv } from './_lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cookies = req.cookies || {};
    const sessionId = cookies.session;
    
    if (!sessionId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const session = await kv.get(`session:${sessionId}`);
    if (!session || session.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await kv.get(`user:${session.userId}`);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { monitorId } = req.body;

    if (!monitorId || typeof monitorId !== 'string') {
      return res.status(400).json({ error: 'Monitor ID is required' });
    }

    const monitorData = await kv.get(`monitor:${monitorId}`);
    if (!monitorData) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    const monitor = typeof monitorData === 'string' ? JSON.parse(monitorData) : monitorData;

    if (monitor.email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized to delete this monitor' });
    }

    await kv.srem('monitors:active', monitorId);
    await kv.srem(`email:${user.email.toLowerCase()}`, monitorId);
    await kv.del(`monitor:${monitorId}`);

    console.log(`Monitor deleted: ${monitorId} by ${user.email}`);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Delete monitor error:', err);
    return res.status(500).json({ error: 'Failed to delete monitor' });
  }
}
