/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const OFF_PROD_URL =
  process.env.OPENFOODFACTS_PRODUCT_URL ||
  'https://world.openfoodfacts.org/api/v2/product';
const OFF_SEARCH_URL =
  process.env.OPENFOODFACTS_SEARCH_URL ||
  'https://world.openfoodfacts.org/cgi/search.pl';

const visionClient = new ImageAnnotatorClient();
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function searchOFF(terms: string) {
  try {
    const params = new URLSearchParams({
      search_terms: terms,
      search_simple: '1',
      action: 'process',
      json: '1',
    });
    const res = await fetch(`${OFF_SEARCH_URL}?${params}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.count > 0 ? data : null;
  } catch (err) {
    console.error('Error al conectar con OpenFoodFacts:', (err as Error).message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const image = formData.get('image');
  if (!image || !(image instanceof File)) {
    return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400 });
  }

  const arrayBuffer = await image.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start: async (controller) => {
      try {
        // 1) Localizar objetos
        let objResp: any;
        try {
          [objResp] = await visionClient.annotateImage({
            image: { content: buffer },
            features: [{ type: 'OBJECT_LOCALIZATION', maxResults: 100 }],
          });
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ error: 'Google Vision: ' + (err as Error).message }) +
                '\n',
            ),
          );
          controller.close();
          return;
        }

        const { width = 0, height = 0 } = await sharp(buffer).metadata();
        const objects = objResp.localizedObjectAnnotations || [];
        const regions =
          objects.length > 0
            ? objects.map((o: any) => {
                const verts = o.boundingPoly.normalizedVertices || [];
                const xs = verts.map((v: any) => (v.x || 0) * width);
                const ys = verts.map((v: any) => (v.y || 0) * height);
                let left = Math.max(0, Math.min(...xs));
                let top = Math.max(0, Math.min(...ys));
                let right = Math.min(width, Math.max(...xs));
                let bottom = Math.min(height, Math.max(...ys));

                const padX = Math.floor((right - left) * 0.1);
                const padY = Math.floor((bottom - top) * 0.1);
                left = Math.max(0, left - padX);
                top = Math.max(0, top - padY);
                right = Math.min(width, right + padX);
                bottom = Math.min(height, bottom + padY);

                return {
                  left: Math.floor(left),
                  top: Math.floor(top),
                  width: Math.floor(right - left),
                  height: Math.floor(bottom - top),
                };
              })
            : [{ left: 0, top: 0, width, height }];

        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: 'count', count: regions.length }) + '\n',
          ),
        );

        for (let idx = 0; idx < regions.length; idx++) {
          const region = regions[idx];
          let cropBuffer: Buffer;
          try {
            cropBuffer = await sharp(buffer).extract(region).toBuffer();
          } catch {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'product',
                  index: idx,
                  aiResponse: 'error',
                  title: 'Error',
                  offImage: null,
                  offLink: null,
                }) + '\n',
              ),
            );
            continue;
          }

          // 2) Analizar recorte
          let vResp: any;
          try {
            [vResp] = await visionClient.annotateImage({
              image: { content: cropBuffer },
              features: [
                { type: 'BARCODE_DETECTION' },
                { type: 'LOGO_DETECTION', maxResults: 5 },
                { type: 'DOCUMENT_TEXT_DETECTION' },
                { type: 'WEB_DETECTION', maxResults: 5 },
                { type: 'LABEL_DETECTION', maxResults: 10 },
                { type: 'OBJECT_LOCALIZATION' },
              ],
            });
          } catch (err) {
            console.error('Error Vision en recorte:', (err as Error).message);
            continue;
          }

          // 3) Parsear resultados de Vision
          const barcodes = (vResp.barcodeAnnotations || []).map((b: any) => b.rawValue);
          const logos = (vResp.logoAnnotations || []).map((l: any) => ({
            name: l.description,
            score: l.score,
          }));
          const text = vResp.fullTextAnnotation?.text?.trim() || '';
          const webEnts = (vResp.webDetection?.webEntities || []).map((e: any) => ({
            desc: e.description,
            score: e.score,
          }));
          const labels = (vResp.labelAnnotations || []).map((l: any) => ({
            desc: l.description,
            score: l.score,
          }));
          const objs = (vResp.localizedObjectAnnotations || []).map((o: any) => o.name);

          const visionData = { barcodes, logos, text, webEnts, labels, objects: objs };

          // 4) Prompt para OpenAI
          let aiResponse = '';
          if (openai) {
            const prompt = `
    Eres un asistente en ESPAÑOL experto en productos alimenticios. Recibes un JSON con datos de Google Vision sobre un envase.
Tu tarea es devolver SOLO el término de búsqueda más corto y útil para buscar ese producto en OpenFoodFacts.

    ✅ REGLAS CLARAS:
    1. Usa el texto OCR (\`text\`) como fuente PRINCIPAL para identificar el nombre genérico.
       - Si hay varias líneas, elige la más descriptiva en ESPAÑOL que indique qué es el producto.
       - Omite frases de marketing, ingredientes o instrucciones.
    2. Solo incluye la marca si aparece en \`logos\`.
    3. El resultado debe estar en SINGULAR, sin sabores, variantes ni cantidades.
    4. Si el nombre genérico está en otro idioma, TRADÚCELO al español.
    5. Usa \`webEnts\` y \`labels\` solo como APOYO para confirmar el OCR, NUNCA como reemplazo.
    6. No inventes datos. Si no está claro, deja fuera esa parte.
    7. Devuelve SOLO el término limpio, sin comillas ni explicaciones.

    ✅ EJEMPLOS:
    - "Barritas Íntegra de Proteína con Arándanos y Semillas" → Barrita Íntegra
    - "Font Vella Agua Mineral Natural" (con logo Font Vella) → Font Vella Agua Mineral
    - "Nestlé Chocolate KitKat 4 barras" (con logo KitKat) → KitKat

    Ahora, procesa este JSON y devuelve SOLO la línea con el término final (sin comillas ni nada más):

    \`\`\`json
    ${JSON.stringify(visionData, null, 2)}
    \`\`\`
    `.trim();

            try {
              const aiRes = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content:
                      'Eres un asistente que genera términos de búsqueda para OpenFoodFacts, en español y con marcas reales.',
                  },
                  { role: 'user', content: prompt },
                ],
                temperature: 0.2,
                max_tokens: 32,
              });
              aiResponse = aiRes.choices[0].message?.content?.trim() || '';
            } catch (err) {
              console.error('Error al conectar con OpenAI:', err);
            }
          }

          // 5) Consultar OpenFoodFacts
          let offData: any = null;
          for (const code of barcodes) {
            try {
              const byCodeRes = await fetch(
                `${OFF_PROD_URL}/${encodeURIComponent(code)}.json`,
              );
              if (byCodeRes.ok) {
                const byCode = await byCodeRes.json();
                if (byCode.status === 1) {
                  offData = byCode.product;
                  break;
                }
              }
            } catch (err) {
              console.error(
                'Error en OpenFoodFacts por código de barras:',
                (err as Error).message,
              );
            }
          }

          if (!offData && aiResponse) {
            const offSearch = await searchOFF(aiResponse);
            if (offSearch) {
              offData = offSearch.products?.[0] || offSearch;
            }
          }

          const offLink =
            offData?.url || (offData?.code ? `${OFF_PROD_URL}/${offData.code}` : null);
          const offImage = offData?.image_url || offData?.image_front_url || null;
          const title = offData?.product_name || aiResponse;

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'product',
                index: idx,
                aiResponse,
                title,
                offImage,
                offLink,
              }) + '\n',
            ),
          );
        }

        controller.enqueue(
          encoder.encode(JSON.stringify({ type: 'done' }) + '\n'),
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ error: (err as Error).message || 'Internal error' }) +
              '\n',
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

