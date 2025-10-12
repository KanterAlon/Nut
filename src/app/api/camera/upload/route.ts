/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import sharp, { type Sharp } from 'sharp';
import vision from '@google-cloud/vision';

export const runtime = 'nodejs';

const DETECTION_PROMPTS = [
  'food product',
  'food package',
  'packaged food',
  'snack',
  'drink',
  'bottle',
  'can',
  'box',
  'bag of chips',
  'cookies',
  'cereal',
  'yogurt',
  'milk carton',
  'juice',
  'soda',
  'producto',
  'bebida',
] as const;

const MAX_DETECTIONS = 10;
const MERGE_IOU_THRESHOLD = 0.45;
const MAX_DETECTION_SIDE = 1280;
const DETECTION_CONFIG = { minScore: 0.3, topK: 60 };
const FALLBACK_LABEL = 'food product';
const FOCUS_DETECTION_MIN_SCORE = 0.22;
const FOCUS_REGION_SCALE = 0.55;

const MAX_OCR_CONCURRENCY = 3;
const OCR_MIN_TOTAL_CHARS = 8;
const OCR_MIN_LINE_LENGTH = 3;
const OFF_CONFIDENCE_THRESHOLD = 0.35;
const OFF_MAX_CANDIDATES = 3;

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type NormalizedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DetectionRegion = {
  id: string;
  label: string;
  score: number;
  rect: Rect;
  normalized: NormalizedBox;
};

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  url?: string;
};

type FocusPoint = {
  x: number;
  y: number;
};

const HF_DETECTION_URL =
  process.env.HF_DETECTION_URL ?? 'https://api-inference.huggingface.co/models/google/owlvit-base-patch32';
const HF_API_TOKEN = process.env.HF_API_TOKEN ?? process.env.HUGGINGFACEHUB_API_TOKEN ?? '';

const offBarcodeCache = new Map<string, OffProduct | null>();
const offSearchCache = new Map<string, OffProduct[]>();

const visionClient = new vision.ImageAnnotatorClient();

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLangs(input: unknown, fallback = 'eng') {
  const langs: string[] = [];

  const collect = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (value instanceof File) return;
    const text = String(value).trim();
    if (!text) return;
    text
      .split(/[+,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => langs.push(part));
  };

  collect(input);

  if (!langs.length) {
    langs.push(fallback);
  }

  return langs;
}

function toLanguageHints(langs: string[]) {
  const mapping: Record<string, string> = {
    eng: 'en',
    en: 'en',
    spa: 'es',
    es: 'es',
    esp: 'es',
    fra: 'fr',
    fr: 'fr',
    deu: 'de',
    ger: 'de',
    ita: 'it',
  };
  const hints: string[] = [];
  for (const lang of langs) {
    const lower = lang.toLowerCase();
    const mapped = mapping[lower] ?? lower.slice(0, 2);
    if (!hints.includes(mapped)) {
      hints.push(mapped);
    }
  }
  return hints.slice(0, 4);
}

function parseFocusPoints(value: unknown): FocusPoint[] {
  if (!value) return [];
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return [];
        }
      })()
    : [];
  if (!Array.isArray(raw)) return [];
  const points: FocusPoint[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
    });
  }
  return points.slice(0, 6);
}

async function prepareDetectionInput(image: Sharp, originalBuffer: Buffer, width: number, height: number) {
  const maxSide = Math.max(width, height);
  if (maxSide <= 0) {
    return {
      buffer: originalBuffer,
      width,
      height,
      scaleX: 1,
      scaleY: 1,
    };
  }
  if (maxSide <= MAX_DETECTION_SIDE) {
    return {
      buffer: originalBuffer,
      width,
      height,
      scaleX: 1,
      scaleY: 1,
    };
  }

  const scale = MAX_DETECTION_SIDE / maxSide;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const resized = await image
    .clone()
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();

  return {
    buffer: resized,
    width: targetWidth,
    height: targetHeight,
    scaleX: width / targetWidth,
    scaleY: height / targetHeight,
  };
}

async function preprocessForOcr(buffer: Buffer) {
  try {
    return await sharp(buffer)
      .removeAlpha()
      .trim()
      .greyscale()
      .normalise()
      .sharpen({ sigma: 1 })
      .toBuffer();
  } catch (err) {
    console.error('OCR preprocess error', (err as Error).message);
    return buffer;
  }
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

function toRect(
  box: { xmin: number; ymin: number; xmax: number; ymax: number },
  width: number,
  height: number,
): Rect {
  let { xmin, ymin, xmax, ymax } = box;
  if (xmin <= 1 && xmax <= 1 && ymin <= 1 && ymax <= 1) {
    xmin *= width;
    xmax *= width;
    ymin *= height;
    ymax *= height;
  }
  const left = clamp(xmin, 0, width);
  const right = clamp(xmax, 0, width);
  const top = clamp(ymin, 0, height);
  const bottom = clamp(ymax, 0, height);
  return {
    left: Math.min(left, right - 1),
    right: Math.max(right, left + 1),
    top: Math.min(top, bottom - 1),
    bottom: Math.max(bottom, top + 1),
  };
}

function toNormalized(rect: Rect, width: number, height: number): NormalizedBox {
  return {
    x: rect.left / width,
    y: rect.top / height,
    width: (rect.right - rect.left) / width,
    height: (rect.bottom - rect.top) / height,
  };
}

function applyPerLabelNms(regions: DetectionRegion[]) {
  const buckets = new Map<string, DetectionRegion[]>();
  for (const region of regions) {
    const key = region.label || 'unknown';
    const list = buckets.get(key);
    if (list) {
      list.push(region);
    } else {
      buckets.set(key, [region]);
    }
  }

  const results: DetectionRegion[] = [];
  for (const [, items] of buckets) {
    const sorted = [...items].sort((a, b) => b.score - a.score);
    const kept: DetectionRegion[] = [];
    for (const candidate of sorted) {
      const overlaps = kept.some((existing) => iou(existing.rect, candidate.rect) >= MERGE_IOU_THRESHOLD);
      if (!overlaps) {
        kept.push(candidate);
      }
    }
    results.push(...kept);
  }

  return results.sort((a, b) => b.score - a.score).slice(0, MAX_DETECTIONS);
}

function rectContains(inner: Rect, outer: Rect, cushion = 4) {
  return (
    inner.left >= outer.left - cushion &&
    inner.top >= outer.top - cushion &&
    inner.right <= outer.right + cushion &&
    inner.bottom <= outer.bottom + cushion
  );
}

function removeNestedDetections(regions: DetectionRegion[]) {
  const sorted = [...regions].sort((a, b) => b.score - a.score);
  const filtered: DetectionRegion[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const candidate = sorted[i];
    const isNested = filtered.some((keeper) => rectContains(candidate.rect, keeper.rect));
    const wrapsExisting = filtered.some((keeper) => rectContains(keeper.rect, candidate.rect));
    if (!isNested && !wrapsExisting) {
      filtered.push(candidate);
    }
  }
  return filtered;
}

async function detectFocusRegions(
  image: Sharp,
  points: FocusPoint[],
  width: number,
  height: number,
) {
  const aggregated: DetectionRegion[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const focusX = clamp(point.x, 0, 1) * width;
    const focusY = clamp(point.y, 0, 1) * height;
    const baseSize = Math.round(Math.min(width, height) * FOCUS_REGION_SCALE);
    const half = Math.max(40, Math.round(baseSize / 2));
    const left = clamp(Math.round(focusX - half), 0, width - 1);
    const top = clamp(Math.round(focusY - half), 0, height - 1);
    const right = clamp(Math.round(focusX + half), left + 1, width);
    const bottom = clamp(Math.round(focusY + half), top + 1, height);
    const cropWidth = clamp(right - left, 1, width - left);
    const cropHeight = clamp(bottom - top, 1, height - top);

    try {
      const cropBuffer = await image
        .clone()
        .extract({
          left,
          top,
          width: cropWidth,
          height: cropHeight,
        })
        .toBuffer();

      const cropSharp = sharp(cropBuffer);
      const cropInput = await prepareDetectionInput(cropSharp, cropBuffer, cropWidth, cropHeight);
      const focusDetections = await detectRegions(
        cropInput.buffer,
        cropInput.width,
        cropInput.height,
        cropWidth,
        cropHeight,
        cropInput.scaleX,
        cropInput.scaleY,
        FOCUS_DETECTION_MIN_SCORE,
        false,
      );

      for (const detection of focusDetections) {
        const offsetRect: Rect = {
          left: detection.rect.left + left,
          top: detection.rect.top + top,
          right: detection.rect.right + left,
          bottom: detection.rect.bottom + top,
        };
        aggregated.push({
          ...detection,
          id: `${detection.id}-focus-${index}`,
          rect: offsetRect,
          normalized: toNormalized(offsetRect, width, height),
        });
      }
    } catch (err) {
      console.error('Focus detection error', (err as Error).message);
    }
  }

  return aggregated;
}

type HfDetection = {
  score: number;
  label: string;
  box?: { xmin: number; ymin: number; xmax: number; ymax: number };
  bounding_box?: { x_min: number; y_min: number; x_max: number; y_max: number };
};

type LocalizedObjectAnnotation = vision.protos.google.cloud.vision.v1.ILocalizedObjectAnnotation;

async function callExternalDetection(
  imageBuffer: Buffer,
  prompts: readonly string[],
  topK: number,
  attempt = 0,
): Promise<HfDetection[]> {
  const body = JSON.stringify({
    inputs: imageBuffer.toString('base64'),
    parameters: {
      candidate_labels: prompts,
      max_detections: topK,
      top_k: topK,
    },
    options: {
      wait_for_model: true,
    },
  });

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (HF_API_TOKEN) {
    headers.Authorization = `Bearer ${HF_API_TOKEN}`;
  }

  const response = await fetch(HF_DETECTION_URL, {
    method: 'POST',
    headers,
    body,
  });

  if (response.status === 503 && attempt < 2) {
    try {
      const error = (await response.json()) as { estimated_time?: number };
      const waitSeconds = Number(error?.estimated_time) || 2;
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return callExternalDetection(imageBuffer, prompts, topK, attempt + 1);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HF detection failed (${response.status}): ${message}`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    return [];
  }

  const detections: HfDetection[] = [];
  for (const entry of data) {
    if (Array.isArray(entry)) {
      entry.forEach((item) => {
        if (item && typeof item === 'object') detections.push(item as HfDetection);
      });
    } else if (entry && typeof entry === 'object') {
      detections.push(entry as HfDetection);
    }
  }
  return detections;
}

function mapHfDetections(
  detections: HfDetection[],
  detectorWidth: number,
  detectorHeight: number,
  scaleX: number,
  scaleY: number,
  originalWidth: number,
  originalHeight: number,
) {
  const sx = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : originalWidth / detectorWidth;
  const sy = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : originalHeight / detectorHeight;

  return detections
    .filter((det) => typeof det.score === 'number' && typeof det.label === 'string')
    .map((det, index) => {
      const box =
        det.box ??
        (det.bounding_box
          ? {
              xmin: det.bounding_box.x_min,
              ymin: det.bounding_box.y_min,
              xmax: det.bounding_box.x_max,
              ymax: det.bounding_box.y_max,
            }
          : null);
      if (!box) {
        return null;
      }
      const rect = toRect(box, detectorWidth, detectorHeight);
      const scaledRect: Rect = {
        left: rect.left * sx,
        top: rect.top * sy,
        right: rect.right * sx,
        bottom: rect.bottom * sy,
      };
      return {
        id: `owl-${index}`,
        label: det.label,
        score: det.score ?? 0,
        rect: scaledRect,
        normalized: toNormalized(scaledRect, originalWidth, originalHeight),
      };
    })
    .filter((region): region is DetectionRegion => Boolean(region));
}

function mapVisionDetections(
  detections: LocalizedObjectAnnotation[],
  detectorWidth: number,
  detectorHeight: number,
  scaleX: number,
  scaleY: number,
  originalWidth: number,
  originalHeight: number,
  minScore: number,
) {
  const sx = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : originalWidth / detectorWidth;
  const sy = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : originalHeight / detectorHeight;

  return detections
    .map((det, index) => {
      const vertices = det.boundingPoly?.normalizedVertices ?? [];
      if (!vertices.length) {
        return null;
      }

      const xs = vertices
        .map((vertex) => clamp(Number(vertex?.x ?? 0), 0, 1))
        .filter((value) => Number.isFinite(value));
      const ys = vertices
        .map((vertex) => clamp(Number(vertex?.y ?? 0), 0, 1))
        .filter((value) => Number.isFinite(value));

      if (!xs.length || !ys.length) {
        return null;
      }

      const xmin = Math.min(...xs) * detectorWidth;
      const xmax = Math.max(...xs) * detectorWidth;
      const ymin = Math.min(...ys) * detectorHeight;
      const ymax = Math.max(...ys) * detectorHeight;

      if (xmax - xmin < 2 || ymax - ymin < 2) {
        return null;
      }

      const rect = toRect({ xmin, ymin, xmax, ymax }, detectorWidth, detectorHeight);
      const scaledRect: Rect = {
        left: rect.left * sx,
        top: rect.top * sy,
        right: rect.right * sx,
        bottom: rect.bottom * sy,
      };

      const score = Number(det.score ?? 0);
      if (!Number.isFinite(score) || score < minScore) {
        return null;
      }

      const label = det.name?.trim() || FALLBACK_LABEL;

      return {
        id: `vision-${index}`,
        label,
        score,
        rect: scaledRect,
        normalized: toNormalized(scaledRect, originalWidth, originalHeight),
      } satisfies DetectionRegion;
    })
    .filter((region): region is DetectionRegion => Boolean(region));
}

async function detectWithVision(
  imageBuffer: Buffer,
  detectorWidth: number,
  detectorHeight: number,
  originalWidth: number,
  originalHeight: number,
  scaleX: number,
  scaleY: number,
  minScore: number,
) {
  if (!detectorWidth || !detectorHeight || !originalWidth || !originalHeight) {
    return [];
  }

  try {
    const [result] = await visionClient.objectLocalization({
      image: { content: imageBuffer },
    });
    const annotations = result.localizedObjectAnnotations ?? [];
    if (!annotations.length) {
      return [];
    }
    const mapped = mapVisionDetections(
      annotations,
      detectorWidth,
      detectorHeight,
      scaleX,
      scaleY,
      originalWidth,
      originalHeight,
      Math.max(minScore * 0.75, 0.2),
    );
    return mapped;
  } catch (err) {
    console.error('Vision detection error', (err as Error).message);
    return [];
  }
}

async function detectRegions(
  imageBuffer: Buffer,
  detectorWidth: number,
  detectorHeight: number,
  originalWidth: number,
  originalHeight: number,
  scaleX: number,
  scaleY: number,
  minScore: number,
  allowFallback = true,
) {
  if (!detectorWidth || !detectorHeight || !originalWidth || !originalHeight) {
    return [];
  }

  let detections: DetectionRegion[] = [];
  try {
    const hfDetections = await callExternalDetection(imageBuffer, DETECTION_PROMPTS, DETECTION_CONFIG.topK);
    detections = mapHfDetections(
      hfDetections,
      detectorWidth,
      detectorHeight,
      scaleX,
      scaleY,
      originalWidth,
      originalHeight,
    ).filter((det) => det.score >= minScore);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (allowFallback) {
      console.warn('External detection unavailable, using fallback:', message);
    } else {
      console.error('External detection error', message);
    }
  }

  if (detections.length < 2) {
    const visionDetections = await detectWithVision(
      imageBuffer,
      detectorWidth,
      detectorHeight,
      originalWidth,
      originalHeight,
      scaleX,
      scaleY,
      minScore,
    );
    if (visionDetections.length) {
      detections = [...detections, ...visionDetections];
    }
  }

  if (detections.length < 2) {
    const visionDetections = await detectWithVision(
      imageBuffer,
      detectorWidth,
      detectorHeight,
      originalWidth,
      originalHeight,
      scaleX,
      scaleY,
      minScore,
    );
    if (visionDetections.length) {
      detections = [...detections, ...visionDetections];
    }
  }

  const deduped = applyPerLabelNms(detections);
  const cleaned = removeNestedDetections(deduped);
  if (cleaned.length > 0) {
    return cleaned;
  }

  if (!allowFallback) {
    return [];
  }

  const fallbackRect: Rect = { left: 0, top: 0, right: originalWidth, bottom: originalHeight };
  return [
    {
      id: 'owl-fallback',
      label: FALLBACK_LABEL,
      score: 1,
      rect: fallbackRect,
      normalized: toNormalized(fallbackRect, originalWidth, originalHeight),
    },
  ];
}

function cleanLines(text: string) {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const sanitized = rawLine.replace(/[^\w\s./-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!sanitized) continue;
    const alnum = sanitized.replace(/[^a-z0-9]/gi, '');
    if (alnum.length < OCR_MIN_LINE_LENGTH) continue;
    if (/^([a-z0-9])\1{2,}$/i.test(alnum)) continue;
    const key = sanitized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(sanitized);
    if (lines.length >= 8) break;
  }

  return lines;
}

function evaluateOcrQuality(lines: string[]) {
  const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
  if (!lines.length || totalChars < OCR_MIN_TOTAL_CHARS) {
    return {
      quality: 'low' as const,
      message: 'Texto insuficiente. Sube una foto mas nitida o acerca la camara al empaque.',
    };
  }
  return { quality: 'good' as const, message: null };
}

function extractBarcode(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/\b\d{8,14}\b/);
    if (match) {
      const value = match[0];
      if (value.length === 12 || value.length === 13 || value.length === 14) {
        return value;
      }
    }
  }
  return null;
}

const KEYWORD_PATTERNS = [
  { regex: /\bchips?\b/i, keyword: 'chips' },
  { regex: /\bpapas?\b/i, keyword: 'chips' },
  { regex: /\bgalletas?\b/i, keyword: 'cookies' },
  { regex: /\bcookies?\b/i, keyword: 'cookies' },
  { regex: /\bbiscuits?\b/i, keyword: 'cookies' },
  { regex: /\bcereal(?:es)?\b/i, keyword: 'cereal' },
  { regex: /\byogur?t\b/i, keyword: 'yogurt' },
  { regex: /\bleche\b/i, keyword: 'milk' },
  { regex: /\bmilk\b/i, keyword: 'milk' },
  { regex: /\bchocolate\b/i, keyword: 'chocolate' },
  { regex: /\bfresa\b/i, keyword: 'strawberry' },
  { regex: /\bstrawberry\b/i, keyword: 'strawberry' },
  { regex: /\bvainilla\b/i, keyword: 'vanilla' },
  { regex: /\bvanilla\b/i, keyword: 'vanilla' },
  { regex: /\bjuice\b/i, keyword: 'juice' },
  { regex: /\bjugo\b/i, keyword: 'juice' },
  { regex: /\bsoda\b/i, keyword: 'soda' },
  { regex: /\bbebida\b/i, keyword: 'drink' },
  { regex: /\bbebidas?\b/i, keyword: 'drink' },
] as const;

type ParsedOcrInfo = {
  brand: string | null;
  productName: string | null;
  keywords: string[];
  attributes: string[];
};

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

function computeTokenOverlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let matches = 0;
  for (const token of a) {
    if (setB.has(token)) matches += 1;
  }
  return matches / Math.max(a.length, b.length);
}

function parseOcrInfo(lines: string[]): ParsedOcrInfo {
  if (!lines.length) {
    return { brand: null, productName: null, keywords: [], attributes: [] };
  }

  const [firstLine = '', secondLine = ''] = lines;
  let brand: string | null = null;
  let productName: string | null = null;

  const firstTokens = firstLine.split(/\s+/);
  const uppercaseLetters = firstLine.replace(/[^A-Z]/g, '').length;
  const letters = firstLine.replace(/[^A-Za-z]/g, '').length;
  const uppercaseRatio = letters > 0 ? uppercaseLetters / letters : 0;
  if (firstTokens.length <= 3 && uppercaseRatio >= 0.6) {
    brand = firstLine;
  } else if (firstTokens.length <= 2 && firstLine.length <= 15) {
    brand = firstLine;
  }

  if (brand) {
    productName = [secondLine, lines[2] ?? ''].filter(Boolean).join(' ').trim() || null;
  } else {
    productName = lines.slice(0, 2).join(' ').trim() || null;
    if (firstTokens.length <= 2) {
      brand = firstLine;
    }
  }

  const keywordsSet = new Set<string>();
  const attributesSet = new Set<string>();

  for (const line of lines) {
    for (const { regex, keyword } of KEYWORD_PATTERNS) {
      if (regex.test(line)) {
        keywordsSet.add(keyword);
      }
    }
    const attrMatches = line.match(/\b\d{2,4}\s?(?:g|gr|kg|ml|l|oz|%|cal(?:orias)?)\b/gi);
    if (attrMatches) {
      attrMatches.forEach((match) => attributesSet.add(match.toLowerCase()));
    }
  }

  return {
    brand,
    productName,
    keywords: Array.from(keywordsSet),
    attributes: Array.from(attributesSet),
  };
}

function buildSearchCandidates(lines: string[], parsed: ParsedOcrInfo) {
  const candidates = new Set<string>();

  const joinTop = (count: number) => lines.slice(0, count).join(' ').trim();
  const topTwo = joinTop(2);
  const topThree = joinTop(3);
  if (topTwo) candidates.add(topTwo);
  if (topThree) candidates.add(topThree);

  if (parsed.brand && parsed.productName) {
    candidates.add(`${parsed.brand} ${parsed.productName}`);
  }
  if (parsed.productName) {
    candidates.add(parsed.productName);
  }
  if (parsed.brand) {
    candidates.add(parsed.brand);
  }

  for (const keyword of parsed.keywords) {
    if (parsed.brand) candidates.add(`${parsed.brand} ${keyword}`);
    if (parsed.productName) candidates.add(`${parsed.productName} ${keyword}`);
    candidates.add(keyword);
  }

  for (const attribute of parsed.attributes) {
    if (parsed.productName) candidates.add(`${parsed.productName} ${attribute}`);
    candidates.add(attribute);
  }

  return Array.from(candidates).map((candidate) => candidate.trim()).filter(Boolean);
}

async function lookupByBarcode(barcode: string) {
  if (!barcode) return null;
  const cached = offBarcodeCache.get(barcode);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const base = process.env.OPENFOODFACTS_PRODUCT_URL || 'https://world.openfoodfacts.org/api/v2/product';
    const res = await fetch(`${base}/${encodeURIComponent(barcode)}.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: number; product?: OffProduct };
    if (data.status === 1 && data.product) {
      offBarcodeCache.set(barcode, data.product);
      return data.product;
    }
  } catch (err) {
    console.error('OpenFoodFacts barcode error', (err as Error).message);
  }
  offBarcodeCache.set(barcode, null);
  return null;
}

async function searchOpenFoodFacts(query: string): Promise<OffProduct[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const cacheKey = trimmed.toLowerCase();
  const cached = offSearchCache.get(cacheKey);
  if (cached) return cached;
  try {
    const base = process.env.OPENFOODFACTS_SEARCH_URL || 'https://world.openfoodfacts.org/cgi/search.pl';
    const params = new URLSearchParams({
      search_terms: trimmed,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '20',
      fields: 'code,product_name,brands,image_url,image_front_url,url,categories_tags,generic_name',
    });
    const res = await fetch(`${base}?${params}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    const products = Array.isArray(data.products) ? (data.products as OffProduct[]) : [];
    offSearchCache.set(cacheKey, products);
    return products;
  } catch (err) {
    console.error('OpenFoodFacts search error', (err as Error).message);
    return [];
  }
}

type OffMatchResult = {
  product: OffProduct | null;
  confidence: number;
  source: 'barcode' | 'search' | null;
  usedQuery: string | null;
  alternatives: OffProduct[];
};

function scoreOffProduct(product: OffProduct, parsed: ParsedOcrInfo, lines: string[]) {
  let score = 0;
  const productNameTokens = tokenize(product.product_name ?? '');
  const ocrNameTokens = parsed.productName ? tokenize(parsed.productName) : tokenize(lines.join(' '));
  const brandTokens = tokenize(product.brands ?? '');
  const ocrBrandTokens = parsed.brand ? tokenize(parsed.brand) : [];

  if (ocrNameTokens.length && productNameTokens.length) {
    score += computeTokenOverlap(ocrNameTokens, productNameTokens) * 0.6;
  }

  if (ocrBrandTokens.length && brandTokens.length) {
    score += computeTokenOverlap(ocrBrandTokens, brandTokens) * 0.3;
  }

  if (parsed.keywords.length) {
    const categories = Array.isArray((product as any).categories_tags)
      ? ((product as any).categories_tags as string[])
      : typeof (product as any).categories_tags === 'string'
      ? [(product as any).categories_tags as string]
      : [];
    const keywordMatches = parsed.keywords.filter((keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      return (
        productNameTokens.includes(normalizedKeyword) ||
        brandTokens.includes(normalizedKeyword) ||
        categories.some((cat) => normalizeText(cat).includes(normalizedKeyword))
      );
    });
    if (keywordMatches.length) {
      score += (keywordMatches.length / parsed.keywords.length) * 0.1;
    }
  }

  return Math.min(1, score);
}

async function resolveOffProduct(
  lines: string[],
  barcode: string | null,
  parsed: ParsedOcrInfo,
  candidates: string[],
): Promise<OffMatchResult> {
  if (barcode) {
    const product = await lookupByBarcode(barcode);
    if (product) {
      return {
        product,
        confidence: 0.95,
        source: 'barcode',
        usedQuery: `barcode:${barcode}`,
        alternatives: [],
      };
    }
  }

  const seen = new Map<string, { product: OffProduct; score: number; query: string }>();

  for (const candidate of candidates) {
    const products = await searchOpenFoodFacts(candidate);
    if (!products.length) continue;

    for (const product of products) {
      const codeKey = product.code ?? `${product.product_name ?? ''}-${product.brands ?? ''}`;
      const normalizedKey = codeKey.toLowerCase();
      const score = scoreOffProduct(product, parsed, lines);
      const previous = seen.get(normalizedKey);
      if (!previous || score > previous.score) {
        seen.set(normalizedKey, { product, score, query: candidate });
      }
    }

    const bestCandidate = [...seen.values()].sort((a, b) => b.score - a.score)[0];
    if (bestCandidate && bestCandidate.score >= OFF_CONFIDENCE_THRESHOLD) {
      break;
    }
  }

  if (!seen.size) {
    return {
      product: null,
      confidence: 0,
      source: null,
      usedQuery: null,
      alternatives: [],
    };
  }

  const ranked = [...seen.values()].sort((a, b) => b.score - a.score);
  const [best, ...rest] = ranked;
  const alternatives = rest.slice(0, OFF_MAX_CANDIDATES).map((item) => item.product);

  return {
    product: best.product,
    confidence: Math.min(1, best.score),
    source: 'search',
    usedQuery: best.query,
    alternatives,
  };
}

function buildTitle(product: OffProduct | null, lines: string[]) {
  if (product?.product_name) return product.product_name;
  if (lines.length >= 2) return `${lines[0]} ${lines[1]}`.trim();
  if (lines.length === 1) return lines[0];
  return 'Producto detectado';
}

async function recogniseText(buffer: Buffer, languageHints: string[]) {
  try {
    const prepared = await preprocessForOcr(buffer);
    const hints = toLanguageHints(languageHints);
    const [result] = await visionClient.documentTextDetection({
      image: { content: prepared },
      imageContext: hints.length ? { languageHints: hints } : undefined,
    });
    const text =
      result.fullTextAnnotation?.text ??
      (result.textAnnotations && result.textAnnotations.length > 0 ? result.textAnnotations[0]?.description : '') ??
      '';
    return text;
  } catch (err) {
    console.error('Google Vision OCR error', (err as Error).message);
    return '';
  }
}

function encodeEvent(payload: Record<string, unknown>) {
  return `${JSON.stringify(payload)}\n`;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const imageFile = formData.get('image');
  if (!imageFile || !(imageFile instanceof File)) {
    return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400 });
  }

  const incomingLang = formData.get('lang') ?? process.env.OCR_LANGS ?? 'spa+eng';
  const languages = normalizeLangs(incomingLang, 'spa+eng');
  const languageHints = languages.length ? languages : ['spa', 'eng'];
  const focusRaw = formData.get('focus');
  const focusPoints = parseFocusPoints(focusRaw);

  const arrayBuffer = await imageFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const image = sharp(buffer);
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    return new Response(JSON.stringify({ error: 'Invalid image' }), { status: 400 });
  }

  const detectionInput = await prepareDetectionInput(image, buffer, width, height);

  const mimeType = meta.format === 'png' ? 'image/png' : 'image/jpeg';
  const imageDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        controller.enqueue(
          encoder.encode(
            encodeEvent({
              type: 'image',
              image: imageDataUrl,
              width,
              height,
            }),
          ),
        );

        let regions = await detectRegions(
          detectionInput.buffer,
          detectionInput.width,
          detectionInput.height,
          width,
          height,
          detectionInput.scaleX,
          detectionInput.scaleY,
          DETECTION_CONFIG.minScore,
          true,
        );

        if (regions.length <= 1) {
          const relaxedDetections = await detectRegions(
            detectionInput.buffer,
            detectionInput.width,
            detectionInput.height,
            width,
            height,
            detectionInput.scaleX,
            detectionInput.scaleY,
            FOCUS_DETECTION_MIN_SCORE,
            false,
          );
          if (relaxedDetections.length) {
            regions = removeNestedDetections(applyPerLabelNms([...regions, ...relaxedDetections]));
          }
        }

        if (focusPoints.length) {
          const focusDetections = await detectFocusRegions(image, focusPoints, width, height);
          if (focusDetections.length) {
            regions = removeNestedDetections(applyPerLabelNms([...regions, ...focusDetections]));
          }
        }

        controller.enqueue(
          encoder.encode(
            encodeEvent({
              type: 'boxes',
              boxes: regions.map((region) => ({
                id: region.id,
                label: region.label,
                score: region.score,
                box: region.normalized,
              })),
              minScore: DETECTION_CONFIG.minScore,
              focusCount: focusPoints.length,
              detectionCount: regions.length,
            }),
          ),
        );

        if (!regions.length) {
          controller.enqueue(
            encoder.encode(
              encodeEvent({
                type: 'no-products',
                message:
                  'No se detectaron productos en la imagen. Intenta acercar la camara o mejorar la iluminacion.',
              }),
            ),
          );
          controller.enqueue(encoder.encode(encodeEvent({ type: 'done' })));
          return;
        }

        regions.forEach((region, index) => {
          controller.enqueue(
            encoder.encode(
              encodeEvent({
                type: 'product-progress',
                index,
                status: 'pending',
                score: region.score,
                prompt: region.label,
                boxId: region.id,
                boundingBox: region.normalized,
              }),
            ),
          );
        });

        const handleRegion = async (region: DetectionRegion, index: number) => {
          controller.enqueue(
            encoder.encode(
              encodeEvent({
                type: 'product-progress',
                index,
                status: 'processing',
                score: region.score,
                prompt: region.label,
                boxId: region.id,
                boundingBox: region.normalized,
              }),
            ),
          );

          try {
            const cropBuffer = await image
              .clone()
              .extract({
                left: Math.max(0, Math.floor(region.rect.left)),
                top: Math.max(0, Math.floor(region.rect.top)),
                width: Math.max(1, Math.floor(region.rect.right - region.rect.left)),
                height: Math.max(1, Math.floor(region.rect.bottom - region.rect.top)),
              })
              .toBuffer();

            const rawText = await recogniseText(cropBuffer, languageHints);
            const lines = cleanLines(rawText);
            const quality = evaluateOcrQuality(lines);
            const barcode = extractBarcode(lines);
            const parsedInfo = parseOcrInfo(lines);
            const candidates = buildSearchCandidates(lines, parsedInfo);
            const candidateQueries =
              candidates.length > 0 ? candidates : lines.length ? [lines.join(' ')] : [];

            if (quality.quality === 'low') {
              controller.enqueue(
                encoder.encode(
                  encodeEvent({
                    type: 'product',
                    index,
                    status: 'low-ocr',
                    aiResponse: lines.join('\n') || undefined,
                    message: quality.message,
                    barcode: barcode ?? null,
                    brandCandidate: parsedInfo.brand,
                    productCandidate: parsedInfo.productName,
                    keywords: parsedInfo.keywords,
                    attributes: parsedInfo.attributes,
                    searchCandidates: candidateQueries,
                    searchQuery: candidateQueries[0] ?? null,
                    score: region.score,
                    prompt: region.label,
                    boxId: region.id,
                    boundingBox: region.normalized,
                  }),
                ),
              );
              return;
            }

            const offResult = await resolveOffProduct(lines, barcode, parsedInfo, candidateQueries);
            const title = buildTitle(offResult.product, lines);
            const alternatives =
              offResult.alternatives.slice(0, OFF_MAX_CANDIDATES).map((item) => ({
                code: item.code ?? null,
                name: item.product_name ?? null,
                brands: item.brands ?? null,
                link: item.url ?? null,
              })) ?? [];

            controller.enqueue(
              encoder.encode(
                encodeEvent({
                  type: 'product',
                  index,
                  status: offResult.product ? 'ready' : 'no-match',
                  title,
                  aiResponse: lines.join('\n') || undefined,
                  offImage: offResult.product?.image_url || offResult.product?.image_front_url || null,
                  offLink: offResult.product?.url || null,
                  code: offResult.product?.code || barcode || null,
                  barcode: barcode ?? null,
                  searchQuery: offResult.usedQuery ?? candidateQueries[0] ?? null,
                  offConfidence: offResult.confidence,
                  offSource: offResult.source,
                  offAlternatives: alternatives,
                  brandCandidate: parsedInfo.brand,
                  productCandidate: parsedInfo.productName,
                  keywords: parsedInfo.keywords,
                  attributes: parsedInfo.attributes,
                  searchCandidates: candidateQueries,
                  score: region.score,
                  prompt: region.label,
                  boxId: region.id,
                  boundingBox: region.normalized,
                }),
              ),
            );
          } catch (regionErr) {
            console.error('Camera product error', (regionErr as Error).message);
            controller.enqueue(
              encoder.encode(
                encodeEvent({
                  type: 'product',
                  index,
                  status: 'error',
                  message: (regionErr as Error).message ?? 'Error analizando el producto',
                  brandCandidate: null,
                  productCandidate: null,
                  keywords: [],
                  attributes: [],
                  searchCandidates: [],
                  score: region.score,
                  prompt: region.label,
                  boxId: region.id,
                  boundingBox: region.normalized,
                }),
              ),
            );
          }
        };

        let cursor = 0;
        const workerCount = Math.min(MAX_OCR_CONCURRENCY, regions.length);
        await Promise.all(
          Array.from({ length: workerCount }).map(async () => {
            while (true) {
              const current = cursor;
              if (current >= regions.length) break;
              cursor += 1;
              const region = regions[current];
              await handleRegion(region, current);
            }
          }),
        );

        controller.enqueue(encoder.encode(encodeEvent({ type: 'done' })));
      } catch (err) {
        console.error('Camera pipeline error', err);
        controller.enqueue(
          encoder.encode(
            encodeEvent({ type: 'error', message: (err as Error).message ?? 'Unexpected error' }),
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
