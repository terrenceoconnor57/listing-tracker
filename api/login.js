import { kv } from './_lib/redis.js';
import { verifyPassword, createSession, sessionCookie } from './_lib/auth.js';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    // Validate inputs
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!password || typeof password !== 'string') {
      return new Response(JSON.stringify({ error: 'Password is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedEmail = email.toLowerCase();
    const userKey = `user:${normalizedEmail}`;

    // Get user
    const user = await kv.get(userKey);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if verified
    if (!user.verified) {
      return new Response(JSON.stringify({ error: 'Please verify your email first' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify password
    const valid = verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create session
    const sessionId = await createSession(normalizedEmail);

    return new Response(JSON.stringify({ 
      success: true,
      email: normalizedEmail
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookie(sessionId)
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return new Response(JSON.stringify({ error: 'Login failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
