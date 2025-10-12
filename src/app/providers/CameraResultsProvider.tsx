'use client';

/* eslint-disable @next/next/no-img-element */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FaTimes } from 'react-icons/fa';

export interface CameraBoundingBox {
  id: string;
  label: string;
  score: number;
  box: { x: number; y: number; width: number; height: number };
}

export interface CameraResultsMeta {
  imageDataUrl: string | null;
  width: number;
  height: number;
  boxes: CameraBoundingBox[];
  status?: 'no-products' | 'processing';
  statusMessage?: string | null;
  minScore?: number;
  detectionCount?: number;
  onRefine?: (point: { x: number; y: number }) => void;
  startedAt?: number;
}

export interface CameraDetectedProduct {
  index: number;
  title: string;
  aiResponse?: string;
  offImage?: string | null;
  offLink?: string | null;
  code?: string | null;
  searchQuery?: string | null;
  score?: number;
  prompt?: string;
  boxId?: string;
  boundingBox?: CameraBoundingBox['box'];
  status?: 'pending' | 'processing' | 'ready' | 'no-match' | 'low-ocr' | 'error';
  message?: string | null;
  offConfidence?: number | null;
  offSource?: 'barcode' | 'search' | null;
  offAlternatives?: Array<{ code: string | null; name: string | null; brands: string | null; link: string | null }>;
  brandCandidate?: string | null;
  productCandidate?: string | null;
  keywords?: string[];
  attributes?: string[];
  barcode?: string | null;
  searchCandidates?: string[];
  manualOverride?: ManualProductOverride | null;
}

export interface ManualProductOverride {
  code: string | null;
  name: string;
  image?: string | null;
  brand?: string | null;
  link?: string | null;
}

type ComparisonItem = {
  type: 'code' | 'query';
  value: string;
  label: string;
};

export type ManualProductSelection = {
  code: string | null;
  name: string;
  image: string | null;
  brand?: string | null;
  link?: string | null;
  message?: string | null;
};

type ReplacementTarget = {
  index: number;
  returnPath: string;
  productSnapshot: CameraDetectedProduct | null;
};

export type AddToComparisonResult = {
  success: boolean;
  message?: string;
};

function resolveProductQuery(product: CameraDetectedProduct): string | null {
  const querySources = [
    product.manualOverride?.name,
    product.searchQuery,
    product.searchCandidates?.find((candidate) => Boolean(candidate?.trim())),
    product.brandCandidate,
    product.productCandidate,
    product.title,
    product.aiResponse,
  ];

  return querySources.find((value) => Boolean(value && value.trim()))?.trim() ?? null;
}

function buildComparisonItem(product: CameraDetectedProduct): ComparisonItem | null {
  const manual = product.manualOverride;
  const code = manual?.code?.trim() || product.code?.trim() || product.barcode?.trim();

  const labelSources = [
    manual?.name,
    product.title,
    product.aiResponse,
    manual?.brand,
    product.brandCandidate,
    product.productCandidate,
  ];
  const labelFallback = `Producto ${product.index + 1}`;
  const label = labelSources.find((value) => Boolean(value && value.trim()))?.trim() ?? labelFallback;

  if (code) {
    return { type: 'code', value: code, label } satisfies ComparisonItem;
  }

  const query = resolveProductQuery(product);
  if (!query) return null;

  return { type: 'query', value: query, label } satisfies ComparisonItem;
}

function clamp01(value: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

type PreviewBox = {
  id: string;
  label: string;
  score?: number | null;
  style: CSSProperties;
};

interface CameraResultsContextValue {
  open: boolean;
  results: CameraDetectedProduct[];
  meta: CameraResultsMeta | null;
  showResults: (items: CameraDetectedProduct[], meta: CameraResultsMeta | null) => void;
  dismissResults: () => void;
  prepareForNavigation: () => void;
  addToComparison: (product: CameraDetectedProduct) => AddToComparisonResult;
  isInComparison: (product: CameraDetectedProduct) => boolean;
  comparisonItems: ComparisonItem[];
  getComparisonUrl: () => string | null;
  beginReplacement: (index: number) => string | null;
  completeReplacement: (selection: ManualProductSelection) => boolean;
  cancelReplacement: () => void;
  replacementTarget: ReplacementTarget | null;
}

const CameraResultsContext = createContext<CameraResultsContextValue | undefined>(undefined);

export function CameraResultsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [results, setResults] = useState<CameraDetectedProduct[]>([]);
  const [meta, setMeta] = useState<CameraResultsMeta | null>(null);
  const [open, setOpen] = useState(false);
  const [shouldRestore, setShouldRestore] = useState(false);
  const [originPath, setOriginPath] = useState<string | null>(null);
  const [comparisonItems, setComparisonItems] = useState<ComparisonItem[]>([]);
  const [replacementTarget, setReplacementTarget] = useState<ReplacementTarget | null>(null);
  const lastPathRef = useRef(pathname);
  const resultsRef = useRef<CameraDetectedProduct[]>(results);
  const comparisonItemsRef = useRef<ComparisonItem[]>(comparisonItems);
  const replacementTargetRef = useRef<ReplacementTarget | null>(replacementTarget);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    comparisonItemsRef.current = comparisonItems;
  }, [comparisonItems]);

  useEffect(() => {
    replacementTargetRef.current = replacementTarget;
  }, [replacementTarget]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('camera-comparison');
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return;
      const validItems: ComparisonItem[] = parsed
        .filter((item): item is ComparisonItem => {
          if (!item || typeof item !== 'object') return false;
          const typed = item as { type?: unknown; value?: unknown; label?: unknown };
          if (typed.type !== 'code' && typed.type !== 'query') return false;
          if (typeof typed.value !== 'string' || typeof typed.label !== 'string') return false;
          return true;
        })
        .slice(0, 10);
      if (validItems.length) {
        setComparisonItems(validItems);
      }
    } catch (err) {
      console.warn('Failed to restore comparison items', (err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!comparisonItems.length) {
      window.localStorage.removeItem('camera-comparison');
      return;
    }
    const payload = JSON.stringify(comparisonItems);
    window.localStorage.setItem('camera-comparison', payload);
  }, [comparisonItems]);

  const showResults = useCallback(
    (items: CameraDetectedProduct[], metaValue: CameraResultsMeta | null) => {
      setResults(items);
      setMeta(metaValue);
      setOpen(true);
      setShouldRestore(false);
      setOriginPath(pathname);
    },
    [pathname],
  );

  const dismissResults = useCallback(() => {
    setOpen(false);
    setShouldRestore(false);
    setResults([]);
    setMeta(null);
    setOriginPath(null);
  }, []);

  const prepareForNavigation = useCallback(() => {
    setOpen(false);
    setShouldRestore(true);
  }, []);

  const addToComparison = useCallback(
    (product: CameraDetectedProduct): AddToComparisonResult => {
      const item = buildComparisonItem(product);
      if (!item) {
        return { success: false, message: 'No se pudo identificar el producto para comparar.' };
      }

      const current = comparisonItemsRef.current;
      if (current.some((existing) => existing.type === item.type && existing.value === item.value)) {
        return { success: false, message: 'El producto ya está en la lista de comparación.' };
      }

      if (current.length >= 10) {
        return { success: false, message: 'Solo puedes comparar hasta 10 productos.' };
      }

      setComparisonItems([...current, item]);
      return { success: true, message: 'Producto agregado a la comparación.' };
    },
    [],
  );

  const isInComparison = useCallback((product: CameraDetectedProduct) => {
    const item = buildComparisonItem(product);
    if (!item) return false;
    return comparisonItemsRef.current.some(
      (existing) => existing.type === item.type && existing.value === item.value,
    );
  }, []);

  const getComparisonUrl = useCallback(() => {
    const items = comparisonItemsRef.current;
    if (items.length < 2) return null;

    const codes = items.filter((item) => item.type === 'code');
    if (codes.length === items.length) {
      const query = codes.map((item) => encodeURIComponent(item.value)).join(',');
      return `/compare?codes=${query}`;
    }

    const names = items.map((item) => encodeURIComponent(item.value)).join(',');
    return `/compare?names=${names}`;
  }, []);

  const beginReplacement = useCallback(
    (index: number) => {
      const currentResults = resultsRef.current;
      if (!currentResults || index < 0 || index >= currentResults.length) {
        return null;
      }
      const basePath = originPath ?? pathname ?? '/';
      setReplacementTarget({
        index,
        returnPath: basePath,
        productSnapshot: currentResults[index] ?? null,
      });
      setOpen(false);
      setShouldRestore(true);
      return basePath;
    },
    [originPath, pathname],
  );

  const cancelReplacement = useCallback(() => {
    setReplacementTarget(null);
  }, []);

  const completeReplacement = useCallback(
    (selection: ManualProductSelection) => {
      const target = replacementTargetRef.current;
      if (!target) return false;

      setResults((prev) => {
        if (target.index < 0 || target.index >= prev.length) {
          return prev;
        }
        const updated = [...prev];
        const current = updated[target.index];
        const manualName = selection.name.trim() || current.title || selection.name;
        const manual: ManualProductOverride = {
          code: selection.code?.trim() || null,
          name: manualName,
          image: selection.image,
          brand: selection.brand?.trim() || null,
          link: selection.link ?? null,
        };

        updated[target.index] = {
          ...current,
          title: manual.name,
          manualOverride: manual,
          code: manual.code ?? current.code ?? null,
          offImage: manual.image ?? current.offImage ?? null,
          offLink: manual.link ?? current.offLink ?? null,
          brandCandidate: manual.brand ?? current.brandCandidate ?? null,
          productCandidate: manual.name ?? current.productCandidate ?? null,
          message: selection.message ?? 'Producto seleccionado manualmente.',
          status: 'ready',
        } satisfies CameraDetectedProduct;
        return updated;
      });

      setReplacementTarget(null);
      return true;
    },
    [],
  );

  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      if (
        shouldRestore &&
        originPath &&
        pathname === originPath &&
        results.length > 0
      ) {
        setOpen(true);
        setShouldRestore(false);
      }
      lastPathRef.current = pathname;
    }
  }, [pathname, shouldRestore, originPath, results.length]);

  const value = useMemo(
    () => ({
      open,
      results,
      meta,
      showResults,
      dismissResults,
      prepareForNavigation,
      addToComparison,
      isInComparison,
      comparisonItems,
      getComparisonUrl,
      beginReplacement,
      completeReplacement,
      cancelReplacement,
      replacementTarget,
    }),
    [
      open,
      results,
      meta,
      showResults,
      dismissResults,
      prepareForNavigation,
      addToComparison,
      isInComparison,
      comparisonItems,
      getComparisonUrl,
      beginReplacement,
      completeReplacement,
      cancelReplacement,
      replacementTarget,
    ],
  );

  return (
    <CameraResultsContext.Provider value={value}>
      {children}
      <CameraResultsOverlay />
    </CameraResultsContext.Provider>
  );
}

export function useCameraResults() {
  const ctx = useContext(CameraResultsContext);
  if (!ctx) {
    throw new Error('useCameraResults must be used within a CameraResultsProvider');
  }
  return ctx;
}

function CameraResultsOverlay() {
  const {
    open,
    results,
    meta,
    dismissResults,
    prepareForNavigation,
    addToComparison,
    isInComparison,
    comparisonItems,
    getComparisonUrl,
    beginReplacement,
  } = useCameraResults();
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      setFeedback(null);
    }
  }, [open]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const previewBoxes = useMemo<PreviewBox[]>(() => {
    if (!meta?.boxes?.length) return [];

    const collected: PreviewBox[] = [];
    meta.boxes.forEach((box) => {
      const normalized = box.box;
      if (!normalized) return;

      const left = clamp01(normalized.x) * 100;
      const top = clamp01(normalized.y) * 100;
      const width = clamp01(normalized.width) * 100;
      const height = clamp01(normalized.height) * 100;
      if (width <= 0 || height <= 0) return;

      const labelText = box.label.trim() || 'Detección';

      collected.push({
        id: box.id,
        label: labelText,
        score: typeof box.score === 'number' ? clamp01(box.score) : null,
        style: {
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
        },
      });
    });

    return collected;
  }, [meta?.boxes]);

  const previewAspectRatio = useMemo(() => {
    if (!meta?.width || !meta?.height) return undefined;
    if (meta.width <= 0 || meta.height <= 0) return undefined;
    return `${meta.width} / ${meta.height}`;
  }, [meta?.height, meta?.width]);

  if (!open) return null;

  const handleClose = () => {
    dismissResults();
  };

  const handleDetails = (product: CameraDetectedProduct) => {
    const manualCode = product.manualOverride?.code?.trim();
    if (manualCode) {
      prepareForNavigation();
      router.push(`/producto?code=${encodeURIComponent(manualCode)}`);
      return;
    }
    const trimmedCode = product.code?.trim();
    if (trimmedCode) {
      prepareForNavigation();
      router.push(`/producto?code=${encodeURIComponent(trimmedCode)}`);
      return;
    }

    const manualLink = product.manualOverride?.link;
    if (manualLink) {
      dismissResults();
      window.open(manualLink, '_blank', 'noopener,noreferrer');
      return;
    }

    const resolvedQuery = resolveProductQuery(product);
    if (resolvedQuery) {
      prepareForNavigation();
      router.push(`/producto?query=${encodeURIComponent(resolvedQuery)}`);
      return;
    }

    if (product.offLink) {
      dismissResults();
      window.open(product.offLink, '_blank', 'noopener,noreferrer');
    }
  };

  const formatStatusLabel = (status: CameraDetectedProduct['status']) => {
    switch (status) {
      case 'pending':
        return 'Pendiente';
      case 'processing':
        return 'Analizando';
      case 'ready':
        return 'Listo';
      case 'no-match':
        return 'Sin coincidencias';
      case 'low-ocr':
        return 'Texto insuficiente';
      case 'error':
        return 'Error';
      default:
        return null;
    }
  };

  const handleExplore = (product: CameraDetectedProduct) => {
    const query =
      product.manualOverride?.name ||
      product.searchQuery ||
      product.searchCandidates?.[0] ||
      product.brandCandidate ||
      product.productCandidate ||
      product.title ||
      product.aiResponse;
    if (!query) return;
    prepareForNavigation();
    router.push(`/search?query=${encodeURIComponent(query)}`);
  };

  const handleAddToComparison = (product: CameraDetectedProduct) => {
    const result = addToComparison(product);
    if (result.message) {
      setFeedback({ message: result.message, tone: result.success ? 'success' : 'error' });
    }
  };

  const handleOpenComparison = () => {
    const url = getComparisonUrl();
    if (!url) {
      setFeedback({
        message: 'Agrega al menos dos productos para comparar.',
        tone: 'error',
      });
      return;
    }
    prepareForNavigation();
    router.push(url);
  };

  const handleReplace = (index: number, product: CameraDetectedProduct) => {
    const basePath = beginReplacement(index);
    if (!basePath) {
      setFeedback({ message: 'No se pudo iniciar el reemplazo.', tone: 'error' });
      return;
    }
    const searchParams = new URLSearchParams();
    const suggestedQuery =
      product.manualOverride?.name || product.title || product.aiResponse || product.brandCandidate;
    if (suggestedQuery && suggestedQuery.trim()) {
      searchParams.set('query', suggestedQuery.trim());
    }
    searchParams.set('replacement', '1');
    router.push(`/search?${searchParams.toString()}`);
  };

  const comparisonCount = comparisonItems.length;
  const comparisonReady = Boolean(getComparisonUrl());

  return (
    <div className="camera-results-overlay" role="dialog" aria-modal="true" onClick={handleClose}>
      <div className="camera-results-panel" onClick={(e) => e.stopPropagation()}>
        <header className="camera-results-topbar">
          <div className="camera-results-heading">
            <h2>Resultados de la cámara</h2>
            <div className="camera-results-meta">
              {typeof meta?.detectionCount === 'number' && (
                <span>Detectados: {meta.detectionCount}</span>
              )}
              {meta?.status === 'processing' && <span>Analizando detecciones…</span>}
              {comparisonCount > 0 && (
                <button
                  type="button"
                  className="camera-results-compare"
                  onClick={handleOpenComparison}
                  disabled={!comparisonReady}
                >
                  Ver comparación ({comparisonCount})
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            className="camera-results-close"
            onClick={handleClose}
            aria-label="Cerrar resultados de cámara"
          >
            <FaTimes />
          </button>
        </header>

        {feedback && (
          <div className={`camera-results-feedback ${feedback.tone}`}>{feedback.message}</div>
        )}

        <div className="camera-results-body">
          {meta?.imageDataUrl && (
            <div
              className="camera-results-preview"
              aria-label="Vista previa de la captura"
              style={previewAspectRatio ? ({ aspectRatio: previewAspectRatio } as CSSProperties) : undefined}
            >
              <img src={meta.imageDataUrl} alt="Vista previa de la captura" />
              {previewBoxes.length > 0 && (
                <div className="camera-preview-boxes" aria-hidden="true">
                  {previewBoxes.map((box) => (
                    <span key={box.id} className="camera-preview-box" style={box.style}>
                      <span className="camera-preview-label">
                        {box.label}
                        {typeof box.score === 'number' && box.score > 0
                          ? ` ${(box.score * 100).toFixed(0)}%`
                          : ''}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="camera-results-list">
            {meta?.status === 'no-products' || results.length === 0 ? (
              <div className="camera-results-empty">
                <p>{meta?.statusMessage || 'No encontramos productos en la captura.'}</p>
              </div>
            ) : (
              results.map((product, listIndex) => {
                const status = product.status ?? 'ready';
                const statusLabel = formatStatusLabel(status);
                const displayTitle =
                  product.manualOverride?.name ||
                  product.title ||
                  product.aiResponse ||
                  `Producto ${product.index + 1}`;
                const additionalInfo = [
                  product.manualOverride?.brand,
                  product.brandCandidate,
                  product.productCandidate &&
                    product.productCandidate !== product.manualOverride?.name
                    ? product.productCandidate
                    : null,
                ]
                  .filter(Boolean)
                  .join(' • ');
                const hasDetails = Boolean(
                  product.manualOverride?.code ||
                    product.code ||
                    product.searchQuery ||
                    (product.searchCandidates && product.searchCandidates.length > 0) ||
                    resolveProductQuery(product),
                );
                const showExplore = Boolean(
                  product.manualOverride?.name ||
                    product.searchQuery ||
                    (product.searchCandidates && product.searchCandidates.length > 0) ||
                    product.brandCandidate ||
                    product.productCandidate,
                );
                const alreadyCompared = isInComparison(product);

                return (
                  <article
                    key={`${product.index}-${product.boxId ?? product.code ?? 'no-code'}`}
                    className={`camera-result-card status-${status}`}
                  >
                    <div className="camera-result-header">
                      {statusLabel && <span className="camera-result-status">{statusLabel}</span>}
                      {product.barcode && <span className="camera-result-code">#{product.barcode}</span>}
                    </div>
                    <div className="camera-result-main">
                      <div className="camera-result-thumbnail">
                        {product.manualOverride?.image || product.offImage ? (
                          <img
                            src={product.manualOverride?.image ?? product.offImage ?? undefined}
                            alt={displayTitle}
                          />
                        ) : (
                          <div className="camera-result-placeholder">Sin imagen</div>
                        )}
                      </div>
                      <div className="camera-result-info">
                        <h3>{displayTitle}</h3>
                        {additionalInfo && (
                          <p className="camera-result-text">{additionalInfo}</p>
                        )}
                        {product.message && <p className="camera-result-text">{product.message}</p>}
                      </div>
                    </div>
                    <div className="camera-result-actions">
                      <button
                        type="button"
                        className="camera-result-button"
                        disabled={!hasDetails}
                        onClick={() => handleDetails(product)}
                      >
                        Ver detalles
                      </button>
                      {showExplore && (
                        <button
                          type="button"
                          className="camera-result-secondary"
                          onClick={() => handleExplore(product)}
                        >
                          Ver más resultados
                        </button>
                      )}
                      <button
                        type="button"
                        className="camera-result-secondary"
                        onClick={() => handleAddToComparison(product)}
                        disabled={alreadyCompared}
                      >
                        {alreadyCompared ? 'En comparación' : 'Agregar a comparación'}
                      </button>
                      <button
                        type="button"
                        className="camera-result-secondary"
                        onClick={() => handleReplace(listIndex, product)}
                      >
                        Reemplazar producto
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

