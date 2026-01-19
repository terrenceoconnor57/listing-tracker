import { kv } from './_lib/redis.js';
import { verifyPassword, createSession, sessionCookie } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    const normalizedEmail = email.toLowerCase();
    const userKey = `user:${normalizedEmail}`;

    const user = await kv.get(userKey);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.verified) {
      return res.status(401).json({ error: 'Please verify your email first' });
    }

    const valid = verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sessionId = await createSession(normalizedEmail);

    res.setHeader('Set-Cookie', sessionCookie(sessionId));
    return res.status(200).json({ success: true, email: normalizedEmail });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
}
