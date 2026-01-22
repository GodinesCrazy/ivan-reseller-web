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

// ✅ P0: Lazy Redis connection - NO conectar en import-time si SAFE_BOOT=true
let redisInstance: Redis | MockRedis | null = null;

/**
 * Get Redis client (lazy initialization)
 * NO conecta si SAFE_BOOT=true
 */
function getRedisInstance(): Redis | MockRedis {
  if (redisInstance) {
    return redisInstance;
  }
  
  // ✅ P0: Check SAFE_BOOT before connecting
  const safeBoot = process.env.SAFE_BOOT === 'true' || (process.env.SAFE_BOOT !== 'false' && process.env.NODE_ENV === 'production');
  
  if (safeBoot) {
    console.log('🛡️  SAFE_BOOT: skipping Redis connection');
    redisInstance = new MockRedis() as any;
    return redisInstance;
  }
  
  if (!REDIS_URL) {
    redisInstance = new MockRedis() as any;
    return redisInstance;
  }
  
  redisInstance = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });
  
  redisInstance.on('connect', () => {
    console.log('✅ Redis connected');
  });

  redisInstance.on('error', (err) => {
    console.error('❌ Redis error:', err);
  });
  
  return redisInstance;
}

/**
 * Redis client para uso general (cache, etc.)
 * maxRetriesPerRequest: 3 - permite reintentos para operaciones no bloqueantes
 * ✅ P0: Lazy - solo conecta cuando se accede, NO en import-time
 */
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const instance = getRedisInstance();
    const value = (instance as any)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});

/**
 * Redis connection para BullMQ (Workers y Queues)
 * BullMQ requiere maxRetriesPerRequest: null para operaciones bloqueantes
 * ✅ P0: NO retorna conexión si SAFE_BOOT=true
 */
export const getBullMQRedisConnection = () => {
  // ✅ P0: Check SAFE_BOOT before creating connection
  const safeBoot = process.env.SAFE_BOOT === 'true' || (process.env.SAFE_BOOT !== 'false' && process.env.NODE_ENV === 'production');
  
  if (safeBoot) {
    console.log('🛡️  SAFE_BOOT: skipping BullMQ Redis connection');
    return null;
  }
  
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

export const isRedisAvailable = !!REDIS_URL && !(process.env.SAFE_BOOT === 'true' || (process.env.SAFE_BOOT !== 'false' && process.env.NODE_ENV === 'production'));

export default redis;
