import Redis from 'ioredis';

let redis: Redis | undefined;
let redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

if (!redisUrl && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const url = new URL(
    process.env.UPSTASH_REDIS_REST_URL.replace(/^https?:\/\//, 'rediss://')
  );
  url.username = 'default';
  url.password = process.env.UPSTASH_REDIS_REST_TOKEN;
  redisUrl = url.toString();
}

if (redisUrl) {
  redis = new Redis(redisUrl);
  redis.on('connect', () => console.log('✅ Redis conectado'));
  redis.on('error', (err) => console.error('Redis connection error:', err.message));
} else {
  console.log('⚠️ REDIS_URL no configurado, cache deshabilitado');
}

export default redis;
