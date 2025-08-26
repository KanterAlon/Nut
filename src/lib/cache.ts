import { Redis } from '@upstash/redis';

const CACHE_THRESHOLD = parseInt(process.env.CACHE_THRESHOLD || '3', 10);
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 horas

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  try {
    redis = Redis.fromEnv();
  } catch (err) {
    console.error('Redis init error:', (err as Error).message);
    redis = null;
  }
  return redis;
}

export async function readCache(key: string) {
  const client = getRedis();
  const freqKey = `freq:${key}`;

  if (!client) {
    return { data: null, source: 'openfoodfacts', freq: 1 } as const;
  }

  let freq = 1;
  try {
    freq = await client.incr(freqKey);
    if (freq === 1) await client.expire(freqKey, CACHE_TTL_SECONDS);
    const cached = await client.get<unknown>(key);
    if (cached !== null) {
      return { data: cached, source: 'cache', freq } as const;
    }
  } catch (err) {
    console.error('Redis read error:', (err as Error).message);
  }
  return { data: null, source: 'openfoodfacts', freq } as const;
}

export async function writeCache(key: string, value: unknown, freq: number) {
  const client = getRedis();
  if (freq < CACHE_THRESHOLD || !client) return;

  try {
    await client.set(key, value, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.error('Redis write error:', (err as Error).message);
  }
}

