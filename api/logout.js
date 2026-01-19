import { getSession, deleteSession, clearSessionCookie } from './_lib/auth.js';

export async function POST(request) {
  try {
    const session = await getSession(request);
    
    if (session) {
      await deleteSession(session.sessionId);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie()
      }
    });

  } catch (err) {
    console.error('Logout error:', err);
    return new Response(JSON.stringify({ error: 'Logout failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
