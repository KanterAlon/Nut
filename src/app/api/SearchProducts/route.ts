import { NextRequest, NextResponse } from 'next/server';
import { readCache, writeCache } from '@/lib/cache';

const OFF_SEARCH_URL = process.env.OPENFOODFACTS_SEARCH_URL || 'https://world.openfoodfacts.org/cgi/search.pl';

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

  const startTime = Date.now();
  const normalizedQuery = normalize(query);
  const cacheKey = `search:${normalizedQuery}`;

  const { data: cachedResults, source, freq } = await readCache(cacheKey);
  if (cachedResults) {
    const elapsedTime = Date.now() - startTime;
    return NextResponse.json({ success: true, products: cachedResults, source, elapsedTime });
  }

  try {
    const searchParams = new URLSearchParams({
      search_terms: query,
      page_size: '20',
      fields: 'code,product_name,image_url',
      search_simple: '1',
      action: 'process',
      json: '1',
    });

    interface OffProductRaw { code: string; product_name: string; image_url: string }
    interface OffResponse { products: OffProductRaw[] }
    const res = await fetch(`${OFF_SEARCH_URL}?${searchParams}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const result: OffResponse = await res.json();

    const productos = (result.products || [])
      .filter((p) => p.product_name && p.image_url && p.code)
      .map((p) => ({ code: p.code, name: p.product_name.trim(), image: p.image_url }));

    const map = new Map<string, { code: string; name: string; images: string[] }>();
    for (const prod of productos) {
      if (!map.has(prod.code)) {
        map.set(prod.code, { code: prod.code, name: prod.name, images: [prod.image] });
      } else {
        map.get(prod.code)!.images.push(prod.image);
      }
    }

    const uniqueProducts = Array.from(map.values()).map((p) => ({
      code: p.code,
      name: p.name,
      image: p.images.find(Boolean) || '',
    }));

    await writeCache(cacheKey, uniqueProducts, freq);
    const elapsedTime = Date.now() - startTime;
    return NextResponse.json({ success: true, products: uniqueProducts, source, elapsedTime });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('🔴 Error en API OpenFood:', message);
    return NextResponse.json({ success: false, message: 'Error en API' }, { status: 500 });
  }
}
