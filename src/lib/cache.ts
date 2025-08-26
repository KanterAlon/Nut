import { Redis } from '@upstash/redis';

const CACHE_THRESHOLD = parseInt(process.env.CACHE_THRESHOLD || '3', 10);
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 horas

// Intentamos conectar a Redis solo si las variables de entorno existen.
// Si la conexión falla, se usará un mapa en memoria como respaldo.
let redis: Redis | null = null;
try {
  redis = Redis.fromEnv();
} catch (err) {
  console.error('Redis init error:', (err as Error).message);
}

const memory = new Map<string, { value: unknown; expires: number }>();
const freqMemory = new Map<string, { value: number; expires: number }>();

export async function readCache(key: string) {
  const freqKey = `freq:${key}`;

  try {
    if (redis) {
      const freq = await redis.incr(freqKey);
      if (freq === 1) await redis.expire(freqKey, CACHE_TTL_SECONDS);
      const cached = await redis.get<unknown>(key);
      if (cached !== null) {
        return { data: cached, source: 'cache', freq } as const;
      }
      return { data: null, source: 'openfoodfacts', freq } as const;
    }

    // Respaldo en memoria
    const now = Date.now();
    let freq = 1;
    const freqEntry = freqMemory.get(freqKey);
    if (freqEntry && freqEntry.expires > now) {
      freq = ++freqEntry.value;
    }
    freqMemory.set(freqKey, { value: freq, expires: now + CACHE_TTL_SECONDS * 1000 });

    const cached = memory.get(key);
    if (cached && cached.expires > now) {
      return { data: cached.value, source: 'cache', freq } as const;
    }
    return { data: null, source: 'openfoodfacts', freq } as const;
  } catch (err) {
    console.error('Redis read error:', (err as Error).message);
    return { data: null, source: 'openfoodfacts', freq: 0 } as const;
  }
}

export async function writeCache(key: string, value: unknown, freq: number) {
  if (freq < CACHE_THRESHOLD) return;
  try {
    if (redis) {
      await redis.set(key, value, { ex: CACHE_TTL_SECONDS });
      return;
    }
    // Respaldo en memoria
    memory.set(key, { value, expires: Date.now() + CACHE_TTL_SECONDS * 1000 });
  } catch (err) {
    console.error('Redis write error:', (err as Error).message);
  }
}

