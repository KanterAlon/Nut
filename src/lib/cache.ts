import { Redis } from '@upstash/redis';

const CACHE_THRESHOLD = parseInt(process.env.CACHE_THRESHOLD || '3', 10);
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 horas

// Inicializamos Redis desde las variables de entorno. Si falla la conexión
// simplemente no se usará caché.
let redis: Redis | null = null;
try {
  redis = Redis.fromEnv();
} catch (err) {
  console.error('Redis init error:', (err as Error).message);
}

export async function readCache(key: string) {
  const freqKey = `freq:${key}`;

  if (!redis) {
    return { data: null, source: 'openfoodfacts', freq: 1 } as const;
  }

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
    return { data: null, source: 'openfoodfacts', freq: 1 } as const;
  }
}

export async function writeCache(key: string, value: unknown, freq: number) {
  if (freq < CACHE_THRESHOLD || !redis) return;

  try {
    await redis.set(key, value, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.error('Redis write error:', (err as Error).message);
  }
}

