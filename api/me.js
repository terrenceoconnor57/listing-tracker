import { getUserFromSession } from './_lib/auth.js';

export async function GET(request) {
  try {
    const user = await getUserFromSession(request);
    
    if (!user) {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      authenticated: true,
      email: user.email
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Me error:', err);
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
