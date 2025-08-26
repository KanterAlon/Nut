import { NextRequest, NextResponse } from 'next/server';
import { readCache, writeCache } from '@/lib/cache';

const OFF_PROD_URL =
  process.env.OPENFOODFACTS_PRODUCT_URL || 'https://world.openfoodfacts.org/api/v2/product';
const OFF_SEARCH_URL =
  process.env.OPENFOODFACTS_SEARCH_URL || 'https://world.openfoodfacts.org/cgi/search.pl';

const normalize = (str: string) =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

interface OffProduct {
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query');
  if (!query) {
    return NextResponse.json({ error: 'Falta query' }, { status: 400 });
  }

  const startTime = Date.now();
  const isEAN = /^\d{8,13}$/.test(query);
  const normalized = isEAN ? query : normalize(query);
  const cacheKey = `product:${normalized}`;

  const { data: cachedProduct, source, freq } = await readCache(cacheKey);
  let product: OffProduct | null = (cachedProduct as OffProduct) ?? null;

  if (!product) {
    try {
      if (isEAN) {
        const productRes = await fetch(
          `${OFF_PROD_URL}/${encodeURIComponent(query)}.json`,
          { cache: 'no-store' },
        );
        if (!productRes.ok) throw new Error(`status ${productRes.status}`);
        const prodJson: { status: number; product: OffProduct } = await productRes.json();
        if (prodJson.status !== 1) {
          return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
        }
        product = prodJson.product;
      } else {
        const searchParams = new URLSearchParams({
          search_terms: query,
          search_simple: '1',
          action: 'process',
          json: '1',
        });
        const searchRes = await fetch(`${OFF_SEARCH_URL}?${searchParams}`, { cache: 'no-store' });
        if (!searchRes.ok) throw new Error(`status ${searchRes.status}`);
        const searchJson: { products?: OffProduct[] } = await searchRes.json();
        const productos = searchJson.products;
        if (!productos || productos.length === 0) {
          return NextResponse.json({ error: 'No hay resultados' }, { status: 404 });
        }
        product = productos[0];
      }

      await writeCache(cacheKey, product, freq);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error en API product:', message);
      return NextResponse.json({ error: 'Error en API' }, { status: 500 });
    }
  }

  const elapsedTime = Date.now() - startTime;
  return NextResponse.json({ ...product, source, elapsedTime });
}

