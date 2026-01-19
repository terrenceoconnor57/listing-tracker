import { kv } from './_lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cookies = req.cookies || {};
    const sessionId = cookies.session;
    
    if (!sessionId) {
      return res.status(200).json({ authenticated: false });
    }

    const session = await kv.get(`session:${sessionId}`);
    if (!session || session.expiresAt < Date.now()) {
      return res.status(200).json({ authenticated: false });
    }

    const user = await kv.get(`user:${session.userId}`);
    if (!user) {
      return res.status(200).json({ authenticated: false });
    }

    return res.status(200).json({ authenticated: true, email: user.email });

  } catch (err) {
    console.error('Me error:', err);
    return res.status(200).json({ authenticated: false });
  }
}
