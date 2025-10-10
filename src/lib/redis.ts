import { Redis } from '@upstash/redis';

type RedisClient = Redis;

const MAX_DISABLE_WINDOW_MS = 60_000;
const retryBackoff = (attempt: number) => Math.min(200 * 2 ** attempt, 2_000);

let cachedClient: RedisClient | null | undefined;
let disabledUntil = 0;

function createClient(): RedisClient | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Redis env vars missing: skipping cache layer');
    }
    return null;
  }

  try {
    return new Redis({
      url,
      token,
      retry: {
        retries: 3,
        backoff: retryBackoff,
      },
    });
  } catch (err) {
    console.error('Redis init error:', (err as Error).message);
    return null;
  }
}

export function getRedisClient(): RedisClient | null {
  if (process.env.DEV_DISABLE_CACHE === 'true') {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[redis] DEV_DISABLE_CACHE flag on');
    }
    return null;
  }

  if (disabledUntil > Date.now()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[redis] temporarily disabled');
    }
    return null;
  }

  if (cachedClient === null && disabledUntil <= Date.now()) {
    cachedClient = undefined;
  }

  if (cachedClient !== undefined) {
    return cachedClient;
  }

  cachedClient = createClient();
  if (!cachedClient) {
    disabledUntil = Date.now() + MAX_DISABLE_WINDOW_MS;
  }
  if (cachedClient) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[redis] client ready');
    }
    disabledUntil = 0;
  }

  return cachedClient;
}

export function markRedisFailure() {
  cachedClient = undefined;
  disabledUntil = Date.now() + MAX_DISABLE_WINDOW_MS;
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[redis] failure detected, cooling down');
  }
}
