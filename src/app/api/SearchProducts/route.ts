import { NextRequest, NextResponse } from 'next/server';
import { readCache, writeCache } from '@/lib/cache';

const OFF_SEARCH_URL =
  process.env.OPENFOODFACTS_SEARCH_URL || 'https://world.openfoodfacts.org/cgi/search.pl';

const normalize = (str: string) =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query');
  if (!query) {
    return NextResponse.json({ success: false, message: 'Falta query' }, { status: 400 });
  }

  const normalizedQuery = normalize(query);
  const cacheKey = `search:${normalizedQuery}`;
  const startTime = Date.now();
  const devCookie = req.cookies.get('dev')?.value;
  const forceCache = process.env.FORCE_REDIS_CACHE === 'true';
  const bypassCache =
    !forceCache && (devCookie === 'true' || process.env.DEV_DISABLE_CACHE === 'true');

  if (process.env.NODE_ENV !== 'production') {
    console.log('[SearchProducts] cache lookup', {
      cacheKey,
      bypassCache,
      devCookie,
    });
  }

  const { data: cachedResults, source, freq } = await readCache(cacheKey, { bypass: bypassCache });
  if (cachedResults) {
    const elapsedTime = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SearchProducts] cache hit', { cacheKey, freq });
    }
    return NextResponse.json({ success: true, products: cachedResults, source, elapsedTime });
  }

  try {
    const products = await fetchProducts(query);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SearchProducts] cache miss - writing', { cacheKey, freq });
    }
    await writeCache(cacheKey, products, freq, { bypass: bypassCache });
    const elapsedTime = Date.now() - startTime;
    return NextResponse.json({ success: true, products, source, elapsedTime });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error en API OpenFood:', message);
    return NextResponse.json({ success: false, message: 'Error en API', products: [] }, { status: 200 });
  }
}

interface OffProductRaw {
  code?: string | null;
  product_name?: string | null;
  image_url?: string | null;
  url?: string | null;
}

interface OffResponse {
  products?: OffProductRaw[];
}

const sanitizeCode = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null') return null;
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 4 || digitsOnly.length > 20) return null;
  return digitsOnly;
};

const extractCodeFromUrl = (value: string | null | undefined) => {
  if (!value) return null;
  const matches = value.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const segments = [...new Set(matches)].sort((a, b) => b.length - a.length);
  for (const segment of segments) {
    const sanitized = sanitizeCode(segment);
    if (sanitized) return sanitized;
  }
  const combined = sanitizeCode(segments.join(''));
  return combined;
};

const resolveProductCode = (product: OffProductRaw) =>
  sanitizeCode(product.code) ||
  extractCodeFromUrl(product.url) ||
  extractCodeFromUrl(product.image_url) ||
  null;

const isNoiseTitle = (value: string) => /test\s*redis/i.test(value);

const lookupCodeByName = async (name: string, cache: Map<string, string | null>) => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (cache.has(trimmed)) {
    return cache.get(trimmed) ?? null;
  }

  const searchParams = new URLSearchParams({
    search_terms: trimmed,
    page_size: '10',
    fields: 'code,product_name,image_url,url',
    search_simple: '1',
    action: 'process',
    json: '1',
  });

  try {
    const res = await fetch(`${OFF_SEARCH_URL}?${searchParams}`, { cache: 'no-store' });
    if (!res.ok) {
      cache.set(trimmed, null);
      return null;
    }
    const response: OffResponse = await res.json();
    const productos = response.products || [];
    const normalizedTarget = normalize(trimmed);
    for (const candidate of productos) {
      const nameCandidate = typeof candidate.product_name === 'string' ? candidate.product_name : '';
      if (!nameCandidate) continue;
      if (isNoiseTitle(nameCandidate)) continue;
      if (normalize(nameCandidate) !== normalizedTarget) continue;
      const resolved = resolveProductCode(candidate);
      if (resolved) {
        cache.set(trimmed, resolved);
        return resolved;
      }
    }
    for (const candidate of productos) {
      const nameCandidate = typeof candidate.product_name === 'string' ? candidate.product_name : '';
      if (!nameCandidate) continue;
      if (isNoiseTitle(nameCandidate)) continue;
      const resolved = resolveProductCode(candidate);
      if (resolved) {
        cache.set(trimmed, resolved);
        return resolved;
      }
    }
  } catch (error) {
    console.error('lookupCodeByName failed', error);
  }

  cache.set(trimmed, null);
  return null;
};

async function fetchProducts(query: string) {
  const searchParams = new URLSearchParams({
    search_terms: query,
    page_size: '20',
    fields: 'code,product_name,image_url,url',
    search_simple: '1',
    action: 'process',
    json: '1',
  });

  const res = await fetch(`${OFF_SEARCH_URL}?${searchParams}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const result: OffResponse = await res.json();

  const productos = result.products || [];
  const normalizedProducts = new Map<string, { code: string; name: string; image: string }>();
  const missingCodes: Array<{ name: string; image: string }> = [];

  for (const product of productos) {
    const name = typeof product.product_name === 'string' ? product.product_name.trim() : '';
    const image = typeof product.image_url === 'string' ? product.image_url : '';
    if (!name || !image) continue;
    if (isNoiseTitle(name)) continue;

    const resolvedCode = resolveProductCode(product);
    if (resolvedCode) {
      if (!normalizedProducts.has(resolvedCode)) {
        normalizedProducts.set(resolvedCode, { code: resolvedCode, name, image });
      }
      continue;
    }

    missingCodes.push({ name, image });
  }

  const lookupCache = new Map<string, string | null>();
  for (const item of missingCodes) {
    const resolved = await lookupCodeByName(item.name, lookupCache);
    if (!resolved) continue;
    if (normalizedProducts.has(resolved)) continue;
    normalizedProducts.set(resolved, { code: resolved, name: item.name, image: item.image });
  }

  return Array.from(normalizedProducts.values());
}
