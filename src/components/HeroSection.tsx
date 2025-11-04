'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiSearch, FiCamera } from 'react-icons/fi';
import {
  useCameraResults,
  CameraDetectedProduct,
  CameraResultsMeta,
  CameraBoundingBox,
} from '@/app/providers/CameraResultsProvider';
import CameraModal from './CameraModal';
import Loader from './Loader';

function clamp01(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function parseBoxes(payload: unknown, existing: CameraBoundingBox[]): CameraBoundingBox[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) return null;
      const record = entry as Record<string, unknown>;
      const dims = (record.box as Record<string, unknown>) || {};
      const width = clamp01(dims.width);
      const height = clamp01(dims.height);
      if (width <= 0 || height <= 0) return null;
      return {
        id: typeof record.id === 'string' ? record.id : `box-${existing.length + index}`,
        label: typeof record.label === 'string' ? record.label : 'producto',
        score: typeof record.score === 'number' ? record.score : 0,
        box: {
          x: clamp01(dims.x),
          y: clamp01(dims.y),
          width,
          height,
        },
      } satisfies CameraBoundingBox;
    })
    .filter((box): box is CameraBoundingBox => Boolean(box));
}

function parseBoundingBox(payload: unknown): CameraBoundingBox['box'] | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const width = clamp01(record.width);
  const height = clamp01(record.height);
  if (width <= 0 || height <= 0) return undefined;
  return {
    x: clamp01(record.x),
    y: clamp01(record.y),
    width,
    height,
  };
}

type ProductStatus = CameraDetectedProduct['status'];

type FocusPoint = { x: number; y: number };

function parseProductStatus(value: unknown, fallback: ProductStatus): ProductStatus {
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase() as ProductStatus;
  switch (normalized) {
    case 'pending':
    case 'processing':
    case 'ready':
    case 'no-match':
    case 'low-ocr':
    case 'error':
      return normalized;
    default:
      return fallback;
  }
}

const CAMERA_ERROR_MESSAGE =
  'No se detectaron productos. Intenta con otra foto o acerca la camara a los envases.';

export default function HeroSection() {
  const [query, setQuery] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCaptureRef = useRef<File | null>(null);
  const resultsRef = useRef<CameraDetectedProduct[]>([]);
  const metaRef = useRef<CameraResultsMeta | null>(null);
  const router = useRouter();
  const { showResults } = useCameraResults();
  const isMobile = typeof window !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOpenCamera = () => {
      if (isMobile && fileInputRef.current) {
        fileInputRef.current.click();
      } else {
        setShowCamera(true);
      }
    };

    window.addEventListener('nut:open-camera', handleOpenCamera);

    return () => {
      window.removeEventListener('nut:open-camera', handleOpenCamera);
    };
  }, [isMobile]);

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/search?query=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleCameraClick = () => {
    if (isMobile && fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      setShowCamera(true);
    }
  };

  async function consumeStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder();
    let bufferStr = '';
    const productMap = new Map<number, CameraDetectedProduct>();
    const boxes: CameraBoundingBox[] = [];
    let meta: CameraResultsMeta | null = null;
    let shouldStop = false;

    const mergeProduct = (index: number, patch: Partial<CameraDetectedProduct>) => {
      const previous = productMap.get(index) ?? { index, title: '' };
      const next: CameraDetectedProduct = {
        ...previous,
        ...patch,
        index,
        title: patch.title ?? previous.title ?? '',
      };
      productMap.set(index, next);
    };

    const syncResults = () => {
      const snapshot = Array.from(productMap.values()).sort((a, b) => a.index - b.index);
      const metaPayload: CameraResultsMeta | null = meta
        ? { ...meta, boxes: meta.boxes.length ? meta.boxes : [...boxes], onRefine: refineAt }
        : boxes.length
        ? {
            imageDataUrl: null,
            width: 0,
            height: 0,
            boxes: [...boxes],
            onRefine: refineAt,
          }
        : null;

      if (metaPayload) {
        metaPayload.onRefine = refineAt;
      }

      if (metaPayload || snapshot.length) {
        showResults(snapshot, metaPayload);
        resultsRef.current = snapshot;
        metaRef.current = metaPayload;
      }
    };

    while (!shouldStop) {
      const { value, done } = await reader.read();
      if (done) break;
      bufferStr += decoder.decode(value, { stream: true });
      const lines = bufferStr.split('\n');
      bufferStr = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const payload = JSON.parse(line);
        switch (payload.type) {
          case 'image': {
            meta = {
              imageDataUrl: typeof payload.image === 'string' ? payload.image : null,
              width: typeof payload.width === 'number' ? payload.width : 0,
              height: typeof payload.height === 'number' ? payload.height : 0,
              boxes: [],
              startedAt: Date.now(),
              status: 'processing',
              onRefine: refineAt,
            };
            syncResults();
            break;
          }
          case 'boxes': {
            const parsed = parseBoxes(payload.boxes, boxes);
            boxes.push(...parsed);
            const previousMeta: CameraResultsMeta =
              meta ?? {
                imageDataUrl: null,
                width: 0,
                height: 0,
                boxes: [],
                startedAt: Date.now(),
              };
            meta = {
              ...previousMeta,
              boxes: parsed,
              minScore:
                typeof payload.minScore === 'number'
                  ? clamp01(payload.minScore)
                  : previousMeta.minScore,
              detectionCount:
                typeof payload.detectionCount === 'number'
                  ? payload.detectionCount
                  : previousMeta.detectionCount ?? parsed.length,
              onRefine: refineAt,
            };
            syncResults();
            break;
          }
          case 'product-progress': {
            if (typeof payload.index !== 'number') break;
            mergeProduct(payload.index, {
              status: parseProductStatus(payload.status, 'processing'),
              prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined,
              score: typeof payload.score === 'number' ? payload.score : undefined,
              boxId: typeof payload.boxId === 'string' ? payload.boxId : undefined,
              boundingBox: parseBoundingBox(payload.boundingBox),
            });
            syncResults();
            break;
          }
          case 'product': {
            if (typeof payload.index !== 'number') break;
            const alternatives = Array.isArray(payload.offAlternatives)
              ? (payload.offAlternatives as Array<Record<string, unknown>>).map((alt) => ({
                  code: typeof alt.code === 'string' ? alt.code : null,
                  name: typeof alt.name === 'string' ? alt.name : null,
                  brands: typeof alt.brands === 'string' ? alt.brands : null,
                  link: typeof alt.link === 'string' ? alt.link : null,
                }))
              : undefined;
            const keywords = Array.isArray(payload.keywords)
              ? (payload.keywords as unknown[]).filter((item): item is string => typeof item === 'string')
              : undefined;
            const attributes = Array.isArray(payload.attributes)
              ? (payload.attributes as unknown[]).filter((item): item is string => typeof item === 'string')
              : undefined;
            const searchCandidates = Array.isArray(payload.searchCandidates)
              ? (payload.searchCandidates as unknown[]).filter((item): item is string => typeof item === 'string')
              : undefined;
            const offSource =
              typeof payload.offSource === 'string' && (payload.offSource === 'barcode' || payload.offSource === 'search')
                ? payload.offSource
                : undefined;

            mergeProduct(payload.index, {
              title: typeof payload.title === 'string' ? payload.title : undefined,
              aiResponse: typeof payload.aiResponse === 'string' ? payload.aiResponse : undefined,
              offImage:
                'offImage' in payload
                  ? typeof payload.offImage === 'string'
                    ? payload.offImage
                    : null
                  : undefined,
              offLink:
                'offLink' in payload
                  ? typeof payload.offLink === 'string'
                    ? payload.offLink
                    : null
                  : undefined,
              code:
                'code' in payload
                  ? typeof payload.code === 'string'
                    ? payload.code
                    : null
                  : undefined,
              searchQuery:
                'searchQuery' in payload && typeof payload.searchQuery === 'string'
                  ? payload.searchQuery
                  : undefined,
              score: typeof payload.score === 'number' ? payload.score : undefined,
              prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined,
              boxId: typeof payload.boxId === 'string' ? payload.boxId : undefined,
              boundingBox: parseBoundingBox(payload.boundingBox),
              status: parseProductStatus(payload.status, 'ready'),
              message: typeof payload.message === 'string' ? payload.message : undefined,
              offConfidence: typeof payload.offConfidence === 'number' ? payload.offConfidence : undefined,
              offSource,
              offAlternatives: alternatives,
              brandCandidate:
                'brandCandidate' in payload
                  ? typeof payload.brandCandidate === 'string'
                    ? payload.brandCandidate
                    : null
                  : undefined,
              productCandidate:
                'productCandidate' in payload
                  ? typeof payload.productCandidate === 'string'
                    ? payload.productCandidate
                    : null
                  : undefined,
              keywords,
              attributes,
              barcode:
                'barcode' in payload
                  ? typeof payload.barcode === 'string'
                    ? payload.barcode
                    : null
                  : undefined,
              searchCandidates,
            });
            syncResults();
            break;
          }
          case 'no-products': {
            const message =
              typeof payload.message === 'string' && payload.message.trim()
                ? payload.message.trim()
                : CAMERA_ERROR_MESSAGE;
            meta = {
              ...(meta ?? {
                imageDataUrl: null,
                width: 0,
                height: 0,
                boxes: [...boxes],
                startedAt: Date.now(),
              }),
              status: 'no-products',
              statusMessage: message,
              onRefine: refineAt,
            };
            syncResults();
            shouldStop = true;
            await reader.cancel();
            break;
          }
          case 'error': {
            console.error('Camera stream error', payload.message);
            break;
          }
          case 'done': {
            shouldStop = true;
            await reader.cancel();
            break;
          }
          default:
            break;
        }
        if (shouldStop) break;
      }
    }

    const finalProducts = Array.from(productMap.values()).sort((a, b) => a.index - b.index);
    let finalMeta: CameraResultsMeta | null = meta
      ? { ...meta, boxes: meta.boxes.length ? meta.boxes : [...boxes], onRefine: refineAt }
      : boxes.length
      ? {
          imageDataUrl: null,
          width: 0,
          height: 0,
          boxes: [...boxes],
          onRefine: refineAt,
        }
      : null;

    if (finalMeta && finalProducts.length > 0 && finalMeta.status === 'processing') {
      finalMeta = { ...finalMeta, status: undefined };
    }

    showResults(finalProducts, finalMeta);
    resultsRef.current = finalProducts;
    metaRef.current = finalMeta;
  }

  async function processFormData(
    formData: FormData,
    options: { fromRefine?: boolean } = {},
  ) {
    const { fromRefine = false } = options;
    try {
      setLoading(true);
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiBase}/api/camera/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.body) throw new Error('No response body');
      await consumeStream(res.body.getReader());
    } catch (err) {
      console.error('Camera search error', err);
      alert('Ocurrio un error procesando la imagen. Intenta nuevamente.');
    } finally {
      setLoading(false);
      if (!fromRefine) {
        setShowCamera(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  }

  async function refineAt(point: FocusPoint) {
    const capture = lastCaptureRef.current;
    if (!capture || loading) return;
    const sanitized = {
      x: clamp01(point.x),
      y: clamp01(point.y),
    };

    const currentMeta = metaRef.current;
    if (currentMeta) {
      const pendingMeta: CameraResultsMeta = {
        ...currentMeta,
        status: 'processing',
        onRefine: refineAt,
      };
      showResults(resultsRef.current, pendingMeta);
      metaRef.current = pendingMeta;
    }

    const formData = new FormData();
    const filename = capture.name || 'capture.jpg';
    formData.append('image', capture, filename);
    formData.append('focus', JSON.stringify([sanitized]));
    await processFormData(formData, { fromRefine: true });
  }

  const handleCapture = async (source: React.ChangeEvent<HTMLInputElement> | Blob) => {
    let file: File | Blob | null = null;
    if (source instanceof Blob) {
      file = source;
    } else if (source.target.files && source.target.files[0]) {
      file = source.target.files[0];
    }
    if (!file) return;

    const captureFile =
      file instanceof File
        ? file
        : new File([file], 'capture.jpg', { type: (file as Blob).type || 'image/jpeg' });

    lastCaptureRef.current = captureFile;

    const formData = new FormData();
    formData.append('image', captureFile, captureFile.name || 'capture.jpg');

    await processFormData(formData);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <section className="page">
      <div className="inner">
        <div className="evaluation-content">
          <h1>EVALUA TU PRODUCTO</h1>
          <h3>Aqui encontraras toda la informacion nutricional 100% simplificada</h3>

          <div className="search-bar">
            <div className="search-wrapper">
              <button
                className="search-button search-icon-button"
                onClick={handleSearch}
              >
                <FiSearch size={20} />
              </button>
              <input
                type="text"
                className="search-input"
                placeholder="Ej: Fideos Matarazzo"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <button
                type="button"
                className="search-button camera-icon-button"
                onClick={handleCameraClick}
              >
                <FiCamera size={20} />
              </button>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleCapture}
              />
              <CameraModal
                isOpen={showCamera}
                onClose={() => setShowCamera(false)}
                onCapture={handleCapture}
              />
            </div>
          </div>
          <div className="search-hint">Presiona Enter o la lupa para buscar</div>
        </div>
      </div>
      {loading && (
        <div className="page-loader">
          <Loader />
        </div>
      )}
    </section>
  );
}

