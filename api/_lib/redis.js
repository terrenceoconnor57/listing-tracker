import Redis from 'ioredis';

let client = null;

function getRedis() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL);
  }
  return client;
}

// Helper functions to match simple KV API
export const kv = {
  async get(key) {
    const redis = getRedis();
    const value = await redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },

  async set(key, value) {
    const redis = getRedis();
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    return redis.set(key, stringValue);
  },

  async del(key) {
    const redis = getRedis();
    return redis.del(key);
  },

  async smembers(key) {
    const redis = getRedis();
    return redis.smembers(key);
  },

  async sadd(key, ...members) {
    const redis = getRedis();
    return redis.sadd(key, ...members);
  },

  async srem(key, ...members) {
    const redis = getRedis();
    return redis.srem(key, ...members);
  }
};
