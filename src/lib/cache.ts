import { Redis } from '@upstash/redis';

const CACHE_THRESHOLD = parseInt(process.env.CACHE_THRESHOLD || '3', 10);
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 horas

// Instancia del cliente de Redis. Se espera que las variables de entorno
// `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` estén definidas.
// Si faltan, `Redis.fromEnv()` lanzará un error y las funciones de lectura
// y escritura capturarán las excepciones.
const redis = Redis.fromEnv();

export async function readCache(key: string) {
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

export async function writeCache(key: string, value: unknown, freq: number) {
  if (freq < CACHE_THRESHOLD) return;
  try {
    await redis.set(key, value, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.error('Redis write error:', (err as Error).message);
  }
}

