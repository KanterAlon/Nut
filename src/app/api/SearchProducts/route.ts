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
  products: OffProductRaw[];
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

const extractCodeFromUrl = (url: string | null | undefined) => {
  if (!url) return null;
  const segments = url.match(/\d+/g);
  if (!segments || segments.length === 0) return null;
  const joined = segments.join('');
  const candidate = sanitizeCode(joined);
  if (candidate) return candidate;
  for (const segment of segments) {
    const resolved = sanitizeCode(segment);
    if (resolved) return resolved;
  }
  return null;
};

const extractCodeFromImageUrl = (url: string | null | undefined) => {
  if (!url) return null;
  const segments = url.match(/\d+/g);
  if (!segments || segments.length === 0) return null;
  const joined = segments.join('');
  const candidate = sanitizeCode(joined);
  if (candidate) return candidate;
  for (const segment of segments) {
    const resolved = sanitizeCode(segment);
    if (resolved) return resolved;
  }
  return null;
};

const resolveProductCode = (product: OffProductRaw) => {
  return (
    sanitizeCode(product.code) ??
    extractCodeFromUrl(product.url) ??
    extractCodeFromImageUrl(product.image_url) ??
    null
  );
};

const lookupCodeByName = async (name: string): Promise<string | null> => {
  const trimmed = name.trim();
  if (!trimmed) return null;

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
    if (!res.ok) return null;
    const response: OffResponse = await res.json();
    const productos = response.products || [];
    const normalizedTarget = normalize(trimmed);

    for (const candidate of productos) {
      const candidateName =
        typeof candidate.product_name === 'string' ? candidate.product_name.trim() : '';
      if (!candidateName || isNoiseTitle(candidateName)) continue;
      if (normalize(candidateName) !== normalizedTarget) continue;
      const resolved = resolveProductCode(candidate);
      if (resolved) return resolved;
    }

    for (const candidate of productos) {
      const candidateName =
        typeof candidate.product_name === 'string' ? candidate.product_name.trim() : '';
      if (!candidateName || isNoiseTitle(candidateName)) continue;
      const resolved = resolveProductCode(candidate);
      if (resolved) return resolved;
    }
  } catch (error) {
    console.error('lookupCodeByName failed', error);
  }

  return null;
};

const isNoiseTitle = (value: string) => /test\s*redis/i.test(value);

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

  const productos = (result.products || [])
    .map((p) => ({
      code: resolveProductCode(p),
      name: typeof p.product_name === 'string' ? p.product_name.trim() : '',
      image: typeof p.image_url === 'string' ? p.image_url : '',
    }))
    .filter((p) => p.name && p.image && !isNoiseTitle(p.name));

  const map = new Map<string, { code: string; name: string; images: string[] }>();
  const withoutCode: Array<{ name: string; image: string }> = [];

  for (const prod of productos) {
    if (!prod.code) {
      withoutCode.push({ name: prod.name, image: prod.image });
      continue;
    }

    const existing = map.get(prod.code);
    if (!existing) {
      map.set(prod.code, { code: prod.code, name: prod.name, images: [prod.image] });
      continue;
    }
    existing.images.push(prod.image);
  }

  const withCode = Array.from(map.values()).map((p) => ({
    code: p.code,
    name: p.name,
    image: p.images.find(Boolean) || '',
  }));

  const resolvedWithoutCode: Array<{ code: string; name: string; image: string }> = [];
  const lookupCache = new Map<string, string | null>();

  for (const item of withoutCode) {
    let resolvedCode: string | null;
    if (lookupCache.has(item.name)) {
      resolvedCode = lookupCache.get(item.name) ?? null;
    } else {
      resolvedCode = await lookupCodeByName(item.name);
      lookupCache.set(item.name, resolvedCode);
    }
    if (!resolvedCode) continue;
    if (map.has(resolvedCode)) continue;
    map.set(resolvedCode, { code: resolvedCode, name: item.name, images: [item.image] });
    resolvedWithoutCode.push({ code: resolvedCode, name: item.name, image: item.image });
  }

  return [...withCode, ...resolvedWithoutCode];
}
