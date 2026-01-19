import { getSession, deleteSession, clearSessionCookie } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cookies = req.cookies || {};
    const sessionId = cookies.session;
    
    if (sessionId) {
      await deleteSession(sessionId);
    }

    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Logout failed' });
  }
}
