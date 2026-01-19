import { kv } from './_lib/redis.js';
import { sendEmail } from './_lib/email.js';
import { hashPassword, generateToken } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = email.toLowerCase();
    const userKey = `user:${normalizedEmail}`;

    const existingUser = await kv.get(userKey);
    if (existingUser && existingUser.verified) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const { hash, salt } = hashPassword(password);
    const verifyToken = generateToken();
    const now = Date.now();

    const user = {
      email: normalizedEmail,
      passwordHash: hash,
      passwordSalt: salt,
      verified: false,
      verifyToken,
      verifyTokenExpires: now + 24 * 60 * 60 * 1000,
      createdAt: now
    };

    await kv.set(userKey, user);

    const origin = req.headers.origin || req.headers.host || 'https://listing-tracker.vercel.app';
    const protocol = origin.startsWith('http') ? '' : 'https://';
    const verifyUrl = `${protocol}${origin}/verify.html?token=${verifyToken}&email=${encodeURIComponent(normalizedEmail)}`;

    const emailBody = `Welcome to Competitor Tracker!

Please verify your email by clicking the link below:

${verifyUrl}

This link expires in 24 hours.

If you didn't create this account, you can ignore this email.

---
Competitor Tracker`;

    try {
      await sendEmail(normalizedEmail, 'Verify your email', emailBody);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr.message);
    }

    return res.status(200).json({ success: true, message: 'Check your email to verify your account' });

  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Failed to create account' });
  }
}
