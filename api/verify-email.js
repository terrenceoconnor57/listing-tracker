import { kv } from './_lib/redis.js';
import { createSession, sessionCookie } from './_lib/auth.js';

export async function POST(request) {
  try {
    const { email, token } = await request.json();

    // Validate inputs
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!token || typeof token !== 'string') {
      return new Response(JSON.stringify({ error: 'Verification token is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedEmail = email.toLowerCase();
    const userKey = `user:${normalizedEmail}`;

    // Get user
    const user = await kv.get(userKey);
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Already verified
    if (user.verified) {
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Email already verified'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check token
    if (user.verifyToken !== token) {
      return new Response(JSON.stringify({ error: 'Invalid verification token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check expiration
    if (user.verifyTokenExpires < Date.now()) {
      return new Response(JSON.stringify({ error: 'Verification token has expired' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update user as verified
    user.verified = true;
    user.verifyToken = null;
    user.verifyTokenExpires = null;
    user.verifiedAt = Date.now();

    await kv.set(userKey, user);

    // Create session and log user in
    const sessionId = await createSession(normalizedEmail);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Email verified successfully'
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookie(sessionId)
      }
    });

  } catch (err) {
    console.error('Verify email error:', err);
    return new Response(JSON.stringify({ error: 'Verification failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
