import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { kv } from './redis.js';

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Hash password with salt using SHA-256
 */
export function hashPassword(password, salt = null) {
  salt = salt || randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(password + salt).digest('hex');
  return { hash, salt };
}

/**
 * Verify password against stored hash
 */
export function verifyPassword(password, storedHash, salt) {
  const { hash } = hashPassword(password, salt);
  const hashBuffer = Buffer.from(hash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');
  return timingSafeEqual(hashBuffer, storedBuffer);
}

/**
 * Generate a random token
 */
export function generateToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Create a session for a user
 */
export async function createSession(userId) {
  const sessionId = generateToken();
  const session = {
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL
  };
  await kv.set(`session:${sessionId}`, session);
  return sessionId;
}

/**
 * Get session from request cookies
 */
export async function getSession(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );
  
  const sessionId = cookies['session'];
  if (!sessionId) return null;
  
  const session = await kv.get(`session:${sessionId}`);
  if (!session) return null;
  
  if (session.expiresAt < Date.now()) {
    await kv.del(`session:${sessionId}`);
    return null;
  }
  
  return { ...session, sessionId };
}

/**
 * Get user from session
 */
export async function getUserFromSession(request) {
  const session = await getSession(request);
  if (!session) return null;
  
  const user = await kv.get(`user:${session.userId}`);
  if (!user) return null;
  
  return { ...user, sessionId: session.sessionId };
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId) {
  await kv.del(`session:${sessionId}`);
}

/**
 * Create session cookie header
 */
export function sessionCookie(sessionId, maxAge = SESSION_TTL / 1000) {
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Clear session cookie header
 */
export function clearSessionCookie() {
  return `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
