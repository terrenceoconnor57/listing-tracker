import { kv } from './_lib/redis.js';
import { sendEmail } from './_lib/email.js';
import { hashPassword, generateToken } from './_lib/auth.js';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    // Validate email
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate password
    if (!password || typeof password !== 'string' || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedEmail = email.toLowerCase();
    const userKey = `user:${normalizedEmail}`;

    // Check if user already exists
    const existingUser = await kv.get(userKey);
    if (existingUser && existingUser.verified) {
      return new Response(JSON.stringify({ error: 'An account with this email already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash password
    const { hash, salt } = hashPassword(password);

    // Generate verification token
    const verifyToken = generateToken();
    const now = Date.now();

    // Create user object
    const user = {
      email: normalizedEmail,
      passwordHash: hash,
      passwordSalt: salt,
      verified: false,
      verifyToken,
      verifyTokenExpires: now + 24 * 60 * 60 * 1000, // 24 hours
      createdAt: now
    };

    // Store user
    await kv.set(userKey, user);

    // Send verification email
    const origin = request.headers.get('origin') || 'https://listing-tracker.vercel.app';
    const verifyUrl = `${origin}/verify.html?token=${verifyToken}&email=${encodeURIComponent(normalizedEmail)}`;

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
      // Still return success - user can request resend
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Check your email to verify your account'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Signup error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create account' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
