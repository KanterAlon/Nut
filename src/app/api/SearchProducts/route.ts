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
  if (!trimmed || trimmed.toLowerCase() === 'undefined') return null;
  const compact = trimmed.replace(/\s+/g, '');
  if (!/^\d{4,20}$/.test(compact)) return null;
  return compact;
};

const extractCodeFromUrl = (url: string | null | undefined) => {
  if (!url) return null;
  const match = /\/product\/(\d+)/i.exec(url);
  if (!match) return null;
  return sanitizeCode(match[1]);
};

const resolveProductCode = (product: OffProductRaw) => {
  return sanitizeCode(product.code) ?? extractCodeFromUrl(product.url) ?? null;
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

  const productos = (result.products || [])
    .map((p) => ({
      code: resolveProductCode(p),
      name: typeof p.product_name === 'string' ? p.product_name.trim() : '',
      image: typeof p.image_url === 'string' ? p.image_url : '',
    }))
    .filter((p) => p.name && p.image);

  const map = new Map<string, { code: string; name: string; images: string[] }>();
  const withoutCode: Array<{ code: null; name: string; image: string }> = [];

  for (const prod of productos) {
    if (!prod.code) {
      withoutCode.push({ code: null, name: prod.name, image: prod.image });
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

  return [...withCode, ...withoutCode];
}
