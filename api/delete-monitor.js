import { kv } from './_lib/redis.js';
import { getUserFromSession } from './_lib/auth.js';

export async function POST(request) {
  try {
    // Check authentication
    const user = await getUserFromSession(request);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { monitorId } = await request.json();

    if (!monitorId || typeof monitorId !== 'string') {
      return new Response(JSON.stringify({ error: 'Monitor ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get the monitor
    const monitorData = await kv.get(`monitor:${monitorId}`);
    if (!monitorData) {
      return new Response(JSON.stringify({ error: 'Monitor not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const monitor = typeof monitorData === 'string' ? JSON.parse(monitorData) : monitorData;

    // Verify ownership
    if (monitor.email.toLowerCase() !== user.email.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Not authorized to delete this monitor' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove from active monitors set
    await kv.srem('monitors:active', monitorId);

    // Remove from user's email set
    const emailKey = `email:${user.email.toLowerCase()}`;
    await kv.srem(emailKey, monitorId);

    // Delete the monitor data
    await kv.del(`monitor:${monitorId}`);

    console.log(`Monitor deleted: ${monitorId} by ${user.email}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Delete monitor error:', err);
    return new Response(JSON.stringify({ error: 'Failed to delete monitor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
