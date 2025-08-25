import { Redis } from '@upstash/redis';

const CACHE_THRESHOLD = parseInt(process.env.CACHE_THRESHOLD || '3', 10);
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 horas
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;

let redis: Redis | null = null;
try {
  redis = Redis.fromEnv();
} catch {
  redis = null;
}

const store = new Map<string, { value: unknown; expires: number }>();
const freqMap = new Map<string, number>();

export async function readCache(key: string) {
  if (redis) {
    const freqKey = `freq:${key}`;
    try {
      const freq = await redis.incr(freqKey);
      if (freq === 1) await redis.expire(freqKey, CACHE_TTL_SECONDS);
      const cached = await redis.get<unknown>(key);
      if (cached !== null) {
        return { data: cached, source: 'cache', freq } as const;
      }
      return { data: null, source: 'openfoodfacts', freq } as const;
    } catch (err) {
      console.error('Redis read error:', (err as Error).message);
      return { data: null, source: 'openfoodfacts', freq: 0 } as const;
    }
  }

  const freq = (freqMap.get(key) ?? 0) + 1;
  freqMap.set(key, freq);
  const entry = store.get(key);
  if (entry && entry.expires > Date.now()) {
    return { data: entry.value, source: 'cache', freq } as const;
  }
  return { data: null, source: 'openfoodfacts', freq } as const;
}

export async function writeCache(key: string, value: unknown, freq: number) {
  if (redis) {
    if (freq < CACHE_THRESHOLD) return;
    try {
      await redis.set(key, value, { ex: CACHE_TTL_SECONDS });
    } catch (err) {
      console.error('Redis write error:', (err as Error).message);
    }
    return;
  }

  if (freq < CACHE_THRESHOLD) return;
  store.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}
