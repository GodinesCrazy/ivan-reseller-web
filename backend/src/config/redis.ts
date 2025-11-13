import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

// Mock Redis client for when Redis is not available
class MockRedis {
  async get() { return null; }
  async set() { return 'OK'; }
  async del() { return 1; }
  async exists() { return 0; }
  async expire() { return 1; }
  async ttl() { return -1; }
  async keys() { return []; }
  async flushall() { return 'OK'; }
  async ping() { return 'PONG'; }
  async quit() { return 'OK'; }
  async disconnect() { return; }
  on() { return this; }
  once() { return this; }
}

/**
 * Redis client para uso general (cache, etc.)
 * maxRetriesPerRequest: 3 - permite reintentos para operaciones no bloqueantes
 */
export const redis = REDIS_URL 
  ? new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    })
  : new MockRedis() as any;

/**
 * Redis connection para BullMQ (Workers y Queues)
 * BullMQ requiere maxRetriesPerRequest: null para operaciones bloqueantes
 */
export const getBullMQRedisConnection = () => {
  if (!REDIS_URL) {
    return null;
  }
  
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ requiere null para operaciones bloqueantes
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });
};

export const isRedisAvailable = !!REDIS_URL;

if (REDIS_URL) {
  redis.on('connect', () => {
    console.log('✅ Redis connected');
  });

  redis.on('error', (err) => {
    console.error('❌ Redis error:', err);
  });
} else {
  console.log('⚠️  Redis not configured - using mock client');
}

export default redis;
