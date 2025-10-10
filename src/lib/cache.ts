import { getRedisClient, markRedisFailure } from './redis';

const CACHE_THRESHOLD = parseInt(process.env.CACHE_THRESHOLD || '3', 10);
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 horas

export async function readCache(
  key: string,
  options?: { bypass?: boolean },
) {
  if (options?.bypass) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[cache] bypass enabled', { key });
    }
    return { data: null, source: 'openfoodfacts', freq: 1 } as const;
  }

  const freqKey = `freq:${key}`;
  const client = getRedisClient();

  if (!client) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[cache] client unavailable', { key });
    }
    return { data: null, source: 'openfoodfacts', freq: 1 } as const;
  }

  let freq = 1;
  try {
    freq = await client.incr(freqKey);
    if (freq === 1) await client.expire(freqKey, CACHE_TTL_SECONDS);
    const cached = await client.get<unknown>(key);
    if (cached !== null) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[cache] hit', { key, freq });
      }
      return { data: cached, source: 'cache', freq } as const;
    }
  } catch (err) {
    markRedisFailure();
    console.error('Redis read error:', (err as Error).message);
  }
  return { data: null, source: 'openfoodfacts', freq } as const;
}

export async function writeCache(
  key: string,
  value: unknown,
  freq: number,
  options?: { bypass?: boolean },
) {
  if (options?.bypass) return;

  const client = getRedisClient();
  if (freq < CACHE_THRESHOLD || !client) return;

  try {
    await client.set(key, value, { ex: CACHE_TTL_SECONDS });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[cache] write', { key, freq, ttl: CACHE_TTL_SECONDS });
    }
  } catch (err) {
    markRedisFailure();
    console.error('Redis write error:', (err as Error).message);
  }
}
