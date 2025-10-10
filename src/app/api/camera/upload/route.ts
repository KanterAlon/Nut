/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import OpenAI from 'openai';
import fs from 'fs';

export const runtime = 'nodejs';

const OFF_PROD_URL =
  process.env.OPENFOODFACTS_PRODUCT_URL ||
  'https://world.openfoodfacts.org/api/v2/product';
const OFF_SEARCH_URL =
  process.env.OPENFOODFACTS_SEARCH_URL ||
  'https://world.openfoodfacts.org/cgi/search.pl';

type ServiceAccount = Record<string, unknown> & {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

function parseServiceAccount(): ServiceAccount | null {
  const inlineCredentials = process.env.GOOGLE_VISION_CREDENTIALS;
  if (inlineCredentials) {
    try {
      const json = Buffer.from(inlineCredentials, 'base64').toString('utf-8');
      return JSON.parse(json);
    } catch {
      try {
        return JSON.parse(inlineCredentials);
      } catch (err) {
        console.error('No se pudo parsear GOOGLE_VISION_CREDENTIALS:', err);
        return null;
      }
    }
  }

  const clientEmail = process.env.GOOGLE_VISION_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_VISION_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
      project_id: process.env.GOOGLE_VISION_PROJECT_ID,
    };
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath && fs.existsSync(credentialsPath)) {
    try {
      const file = fs.readFileSync(credentialsPath, 'utf-8');
      return JSON.parse(file);
    } catch (err) {
      console.error('No se pudo leer GOOGLE_APPLICATION_CREDENTIALS:', err);
    }
  }

  return null;
}

let visionClient: ImageAnnotatorClient | null = null;
let visionInitError: Error | null = null;

function ensureVisionClient(): ImageAnnotatorClient | null {
  if (visionClient || visionInitError) return visionClient;

  try {
    const credentials = parseServiceAccount();
    if (credentials) {
      visionClient = new ImageAnnotatorClient({ credentials });
      return visionClient;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT) {
      visionClient = new ImageAnnotatorClient();
      return visionClient;
    }

    visionInitError = new Error(
      'Google Vision no esta configurado. Define GOOGLE_VISION_CREDENTIALS o GOOGLE_APPLICATION_CREDENTIALS.',
    );
    return null;
  } catch (err) {
    visionInitError = err as Error;
    console.error('Error al inicializar Google Vision:', visionInitError.message);
    return null;
  }

  return visionClient;
}

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type SharpRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function verticesToRect(
  vertices: Array<{ x?: number; y?: number }> | undefined,
  normalizedVertices: Array<{ x?: number; y?: number }> | undefined,
  width: number,
  height: number,
): Rect | null {
  const verts = normalizedVertices && normalizedVertices.length
    ? normalizedVertices.map((v) => ({
      x: clamp((v.x ?? 0) * width, 0, width),
      y: clamp((v.y ?? 0) * height, 0, height),
    }))
    : vertices;

  if (!verts || verts.length === 0) return null;

  const xs = verts.map((v) => clamp(v.x ?? 0, 0, width));
  const ys = verts.map((v) => clamp(v.y ?? 0, 0, height));
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  if (right - left <= 2 || bottom - top <= 2) return null;

  return { left, top, right, bottom };
}

function expandRect(rect: Rect, width: number, height: number, factor: number) {
  const dx = (rect.right - rect.left) * factor;
  const dy = (rect.bottom - rect.top) * factor;
  return {
    left: clamp(rect.left - dx, 0, width),
    top: clamp(rect.top - dy, 0, height),
    right: clamp(rect.right + dx, 0, width),
    bottom: clamp(rect.bottom + dy, 0, height),
  };
}

function rectArea(rect: Rect) {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

function intersectionArea(a: Rect, b: Rect) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function iou(a: Rect, b: Rect) {
  const inter = intersectionArea(a, b);
  if (inter <= 0) return 0;
  const union = rectArea(a) + rectArea(b) - inter;
  if (union <= 0) return 0;
  return inter / union;
}

function shouldMerge(a: Rect, b: Rect, threshold: number) {
  return iou(a, b) >= threshold;
}

function mergeRects(rects: Rect[], threshold: number) {
  const result: Rect[] = [];

  for (const rect of rects) {
    let merged = { ...rect };

    for (let i = 0; i < result.length; i += 1) {
      const candidate = result[i];
      if (shouldMerge(merged, candidate, threshold)) {
        merged = {
          left: Math.min(merged.left, candidate.left),
          top: Math.min(merged.top, candidate.top),
          right: Math.max(merged.right, candidate.right),
          bottom: Math.max(merged.bottom, candidate.bottom),
        };
        result.splice(i, 1);
        i -= 1;
      }
    }

    result.push(merged);
  }

  return result;
}

function rectToRegion(rect: Rect, width: number, height: number): SharpRegion | null {
  const left = clamp(Math.floor(rect.left), 0, width);
  const top = clamp(Math.floor(rect.top), 0, height);
  const right = clamp(Math.ceil(rect.right), 0, width);
  const bottom = clamp(Math.ceil(rect.bottom), 0, height);
  const regionWidth = Math.max(1, right - left);
  const regionHeight = Math.max(1, bottom - top);

  if (regionWidth <= 4 || regionHeight <= 4) return null;

  return {
    left,
    top,
    width: regionWidth,
    height: regionHeight,
  };
}

function collectCandidateRects(objResp: any, width: number, height: number) {
  const boxes: Rect[] = [];

  const objects = objResp.localizedObjectAnnotations || [];
  for (const object of objects) {
    if (typeof object.score === 'number' && object.score < 0.45) continue;
    const rect = verticesToRect(
      object.boundingPoly?.vertices,
      object.boundingPoly?.normalizedVertices,
      width,
      height,
    );
    if (rect) boxes.push(expandRect(rect, width, height, 0.08));
  }

  const logos = objResp.logoAnnotations || [];
  for (const logo of logos) {
    if (typeof logo.score === 'number' && logo.score < 0.4) continue;
    const rect = verticesToRect(
      logo.boundingPoly?.vertices,
      logo.boundingPoly?.normalizedVertices,
      width,
      height,
    );
    if (rect) boxes.push(expandRect(rect, width, height, 0.25));
  }

  const barcodes = objResp.barcodeAnnotations || [];
  for (const barcode of barcodes) {
    const rect = verticesToRect(
      barcode.boundingBox?.vertices,
      barcode.boundingBox?.normalizedVertices,
      width,
      height,
    );
    if (rect) boxes.push(expandRect(rect, width, height, 0.2));
  }

  const cropHints = objResp.cropHintsAnnotation?.cropHints || [];

  for (const hint of cropHints) {
    const rect = verticesToRect(
      hint.boundingPoly?.vertices,
      hint.boundingPoly?.normalizedVertices,
      width,
      height,
    );
    if (rect) boxes.push(expandRect(rect, width, height, 0.05));
  }

  const textBlocks =
    objResp.fullTextAnnotation?.pages?.flatMap(
      (page: any) => page.blocks?.map((block: any) => block.boundingBox) || [],
    ) || [];

  for (const block of textBlocks) {
    const rect = verticesToRect(block?.vertices, block?.normalizedVertices, width, height);
    if (rect) boxes.push(expandRect(rect, width, height, 0.15));
  }

  return boxes;
}

function buildRegions(objResp: any, width: number, height: number): SharpRegion[] {
  const minArea = width * height * 0.005;
  const minDim = Math.min(width, height) * 0.1;

  const rawRects = collectCandidateRects(objResp, width, height);
  const candidateRects = rawRects.filter((rect, idx, arr) => {
    const area = rectArea(rect);
    return !arr.some((other, jdx) => {
      if (idx === jdx) return false;
      const overlap = intersectionArea(rect, other);
      const otherArea = rectArea(other);
      return overlap > 0 && (overlap / area >= 0.9 || overlap / otherArea >= 0.9);
    });
  });

  if (candidateRects.length === 0) {
    const fallback = rectToRegion({ left: 0, top: 0, right: width, bottom: height }, width, height);
    return fallback ? [fallback] : [];
  }

  const merged = mergeRects(candidateRects, 0.5)
    .map((rect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    }))
    .filter((rect) => {
      const area = rectArea(rect);
      const w = rect.right - rect.left;
      const h = rect.bottom - rect.top;
      return area >= minArea && w >= minDim && h >= minDim;
    })
    .sort((a, b) => rectArea(b) - rectArea(a));

  const regions = merged
    .map((rect) => rectToRegion(rect, width, height))
    .filter((region): region is SharpRegion => Boolean(region))
    .slice(0, 8);

  if (regions.length === 0) {
    const fallback = rectToRegion({ left: 0, top: 0, right: width, bottom: height }, width, height);
    return fallback ? [fallback] : [];
  }

  return regions.sort((a, b) => a.left - b.left);
}

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

  const client = ensureVisionClient();
  if (!client) {
    const message =
      visionInitError?.message ||
      'Google Vision no esta configurado. Configura las credenciales para usar la camara.';
    return new Response(JSON.stringify({ error: message }), { status: 503 });
  }

  const stream = new ReadableStream({
    start: async (controller) => {
      try {
        // 1) Localizar objetos
        let objResp: any;
        try {
          [objResp] = await client.annotateImage({
            image: { content: buffer },
            features: [
              { type: 'OBJECT_LOCALIZATION', maxResults: 50 },
              { type: 'LOGO_DETECTION', maxResults: 15 },
              { type: 'DOCUMENT_TEXT_DETECTION' },
              { type: 'BARCODE_DETECTION', maxResults: 15 },
              { type: 'CROP_HINTS', maxResults: 8 },
            ],
          });
        } catch (err) {
          const error = err as Error;
          visionInitError = error;
          const message = error.message.includes('Could not load the default credentials')
            ? 'Google Vision no tiene credenciales configuradas. Revisa las variables de entorno.'
            : `Google Vision: ${error.message}`;
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ error: message }) + '\n',
            ),
          );
          controller.close();
          return;
        }

        const { width = 0, height = 0 } = await sharp(buffer).metadata();
        const regions = buildRegions(objResp, width, height);

        if (process.env.NODE_ENV !== 'production') {
          console.log('[camera] regions detected', regions.length);
        }

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
                  code: null,
                }) + '\n',
              ),
            );
            continue;
          }

          // 2) Analizar recorte
          let vResp: any;
          try {
            [vResp] = await client.annotateImage({
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
            const error = err as Error;
            if (error.message.includes('Could not load the default credentials')) {
              visionInitError = error;
            }
            console.error('Error Vision en recorte:', error.message);
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
    Eres un asistente en ESPAÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“OL experto en productos alimenticios. Recibes un JSON con datos de Google Vision sobre un envase.
Tu tarea es devolver SOLO el tÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rmino de bÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âºsqueda mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡s corto y ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âºtil para buscar ese producto en OpenFoodFacts.

    ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ REGLAS CLARAS:
    1. Usa el texto OCR (\`text\`) como fuente PRINCIPAL para identificar el nombre genÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rico.
       - Si hay varias lÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­neas, elige la mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡s descriptiva en ESPAÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“OL que indique quÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© es el producto.
       - Omite frases de marketing, ingredientes o instrucciones.
    2. Solo incluye la marca si aparece en \`logos\`.
    3. El resultado debe estar en SINGULAR, sin sabores, variantes ni cantidades.
    4. Si el nombre genÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rico estÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ en otro idioma, TRADÃƒÆ’Ã†â€™Ãƒâ€¦Ã‚Â¡CELO al espaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â±ol.
    5. Usa \`webEnts\` y \`labels\` solo como APOYO para confirmar el OCR, NUNCA como reemplazo.
    6. No inventes datos. Si no estÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ claro, deja fuera esa parte.
    7. Devuelve SOLO el tÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rmino limpio, sin comillas ni explicaciones.

    ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ EJEMPLOS:
    - "Barritas ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Ântegra de ProteÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­na con ArÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ndanos y Semillas" ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Barrita ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Ântegra
    - "Font Vella Agua Mineral Natural" (con logo Font Vella) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Font Vella Agua Mineral
    - "NestlÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© Chocolate KitKat 4 barras" (con logo KitKat) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ KitKat

    Ahora, procesa este JSON y devuelve SOLO la lÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­nea con el tÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rmino final (sin comillas ni nada mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡s):

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
                      'Eres un asistente que genera tÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rminos de bÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âºsqueda para OpenFoodFacts, en espaÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â±ol y con marcas reales.',
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
                'Error en OpenFoodFacts por cÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³digo de barras:',
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
          const code =
            typeof offData?.code === 'string' && offData.code.trim().length > 0
              ? offData.code
              : barcodes.find(Boolean) || null;

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'product',
                index: idx,
                aiResponse,
                title,
                offImage,
                offLink,
                code,
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



