const CACHE_THRESHOLD = parseInt(process.env.CACHE_THRESHOLD || '3', 10);
const CACHE_TTL = 86400 * 1000; // 24 horas en ms

const store = new Map<string, { value: unknown; expires: number }>();
const freqMap = new Map<string, number>();

export async function readCache(key: string) {
  const freq = (freqMap.get(key) ?? 0) + 1;
  freqMap.set(key, freq);
  const entry = store.get(key);
  if (entry && entry.expires > Date.now()) {
    return { data: entry.value, source: 'cache', freq } as const;
  }
  return { data: null, source: 'openfoodfacts', freq } as const;
}

export async function writeCache(key: string, value: unknown, freq: number) {
  if (freq < CACHE_THRESHOLD) return;
  store.set(key, { value, expires: Date.now() + CACHE_TTL });
}
