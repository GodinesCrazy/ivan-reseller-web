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

// Only create real Redis client if REDIS_URL is configured
export const redis = REDIS_URL 
  ? new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    })
  : new MockRedis() as any;

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
