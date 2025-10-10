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
  const bypassCache = devCookie === 'true' || process.env.DEV_DISABLE_CACHE === 'true';

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
  code: string;
  product_name: string;
  image_url: string;
}

interface OffResponse {
  products: OffProductRaw[];
}

async function fetchProducts(query: string) {
  const searchParams = new URLSearchParams({
    search_terms: query,
    page_size: '20',
    fields: 'code,product_name,image_url',
    search_simple: '1',
    action: 'process',
    json: '1',
  });

  const res = await fetch(`${OFF_SEARCH_URL}?${searchParams}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const result: OffResponse = await res.json();

  const productos = (result.products || [])
    .filter((p) => p.product_name && p.image_url && p.code)
    .map((p) => ({ code: p.code, name: p.product_name.trim(), image: p.image_url }));

  const map = new Map<string, { code: string; name: string; images: string[] }>();
  for (const prod of productos) {
    const existing = map.get(prod.code);
    if (!existing) {
      map.set(prod.code, { code: prod.code, name: prod.name, images: [prod.image] });
      continue;
    }
    existing.images.push(prod.image);
  }

  return Array.from(map.values()).map((p) => ({
    code: p.code,
    name: p.name,
    image: p.images.find(Boolean) || '',
  }));
}
