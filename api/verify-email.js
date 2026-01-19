import { kv } from './_lib/redis.js';
import { createSession, sessionCookie } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, token } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const normalizedEmail = email.toLowerCase();
    const userKey = `user:${normalizedEmail}`;

    const user = await kv.get(userKey);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.verified) {
      return res.status(200).json({ success: true, message: 'Email already verified' });
    }

    if (user.verifyToken !== token) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    if (user.verifyTokenExpires < Date.now()) {
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    user.verified = true;
    user.verifyToken = null;
    user.verifyTokenExpires = null;
    user.verifiedAt = Date.now();

    await kv.set(userKey, user);

    const sessionId = await createSession(normalizedEmail);

    res.setHeader('Set-Cookie', sessionCookie(sessionId));
    return res.status(200).json({ success: true, message: 'Email verified successfully' });

  } catch (err) {
    console.error('Verify email error:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
}
