import redis from './redis';

const CACHE_THRESHOLD = parseInt(process.env.CACHE_THRESHOLD || '3', 10);
const CACHE_TTL = 15778800; // 24 hours

export async function readCache(key: string) {
  if (!redis) {
    return { data: null, source: 'openfoodfacts', freq: 0 } as const;
  }
  const freqKey = `freq:${key}`;
  try {
    const freq = await redis.incr(freqKey);
    if (freq === 1) await redis.expire(freqKey, CACHE_TTL);
    console.log('📦 Revisando cache para', key);
    const cached = await redis.get(key);
    if (cached) {
      console.log('✅ Cache hit para', key);
      return { data: JSON.parse(cached), source: 'cache', freq } as const;
    }
    console.log('❌ Cache miss para', key);
    return { data: null, source: 'openfoodfacts', freq } as const;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Redis read error:', message);
    return { data: null, source: 'openfoodfacts', freq: 0 } as const;
  }
}

export async function writeCache(key: string, value: unknown, freq: number) {
  if (!redis || freq < CACHE_THRESHOLD) return;
  try {
    console.log('💾 Guardando en cache para', key);
    await redis.setex(key, CACHE_TTL, JSON.stringify(value));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Redis write error:', message);
  }
}
