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
import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react';
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
}

interface CameraResultsContextValue {
  open: boolean;
  results: CameraDetectedProduct[];
  meta: CameraResultsMeta | null;
  showResults: (items: CameraDetectedProduct[], meta: CameraResultsMeta | null) => void;
  dismissResults: () => void;
  prepareForNavigation: () => void;
}

const CameraResultsContext = createContext<CameraResultsContextValue | undefined>(undefined);

export function CameraResultsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [results, setResults] = useState<CameraDetectedProduct[]>([]);
  const [meta, setMeta] = useState<CameraResultsMeta | null>(null);
  const [open, setOpen] = useState(false);
  const [shouldRestore, setShouldRestore] = useState(false);
  const [originPath, setOriginPath] = useState<string | null>(null);
  const lastPathRef = useRef(pathname);

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
    }),
    [open, results, meta, showResults, dismissResults, prepareForNavigation],
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
  const { open, results, meta, dismissResults, prepareForNavigation } = useCameraResults();
  const router = useRouter();
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([]);
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
  const [hideLowConfidence, setHideLowConfidence] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.45);

  const imageContainerRef = useRef<HTMLDivElement>(null);

  const clampPosition = (value: number) => Math.min(Math.max(value, 0), 1);

  const handleImageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!meta?.onRefine || meta.status === 'processing') return;
    const container = imageContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clampPosition((event.clientX - rect.left) / rect.width);
    const y = clampPosition((event.clientY - rect.top) / rect.height);
    meta.onRefine({ x, y });
  };
  useEffect(() => {
    if (open) {
      setSelectedCodes([]);
      setSelectedBoxIds([]);
      setHoveredBoxId(null);
      setHideLowConfidence(false);
    }
  }, [open]);

  useEffect(() => {
    if (open && typeof meta?.minScore === 'number') {
      const next = Math.min(Math.max(meta.minScore, 0.2), 0.9);
      setConfidenceThreshold(next);
    }
  }, [open, meta?.minScore]);

  if (!open) return null;

  const toggleSelection = (product: CameraDetectedProduct) => {
    if (!product.code || product.status !== 'ready') return;
    setSelectedCodes((prev) =>
      prev.includes(product.code) ? prev.filter((value) => value !== product.code) : [...prev, product.code],
    );
    if (product.boxId) {
      setSelectedBoxIds((prev) =>
        prev.includes(product.boxId) ? prev.filter((value) => value !== product.boxId) : [...prev, product.boxId],
      );
    }
  };

  const handleCompare = () => {
    if (selectedCodes.length < 2) return;
    prepareForNavigation();
    router.push(`/compare?codes=${selectedCodes.map(encodeURIComponent).join(',')}`);
  };

  const handleDetails = (product: CameraDetectedProduct) => {
    if (product.code) {
      prepareForNavigation();
      router.push(`/producto?code=${encodeURIComponent(product.code)}`);
      return;
    }
    const searchCandidate = product.searchQuery || product.searchCandidates?.[0];
    if (searchCandidate) {
      prepareForNavigation();
      router.push(`/search?query=${encodeURIComponent(searchCandidate)}`);
    }
  };

  const handleClose = () => {
    dismissResults();
  };

  const activeBoxIds = new Set<string>();
  selectedBoxIds.forEach((id) => activeBoxIds.add(id));
  if (hoveredBoxId) activeBoxIds.add(hoveredBoxId);

  const filteredResults = hideLowConfidence
    ? results.filter((product) => {
        const confidence = product.offConfidence ?? product.score ?? 0;
        return confidence >= confidenceThreshold;
      })
    : results;
  const hiddenCount = hideLowConfidence ? results.length - filteredResults.length : 0;
  const summaryParts: string[] = [];
  if (typeof meta?.minScore === 'number') {
    summaryParts.push(`Umbral ${(meta.minScore * 100).toFixed(0)}%`);
  }
  if (typeof meta?.detectionCount === 'number') {
    summaryParts.push(`Detecciones ${meta.detectionCount}`);
  }

  return (
    <div className="camera-results-overlay">
      <div className="camera-results-modal">
        <button
          type="button"
          className="camera-results-close"
          onClick={handleClose}
          aria-label="Cerrar resultados de camara"
        >
          <FaTimes />
        </button>
        <header className="camera-results-header">
          <h2>Productos detectados</h2>
          <p>
            Selecciona los productos que deseas comparar o amplia los detalles de cada uno.
          </p>
          {!!summaryParts.length && (
            <p className="camera-results-summary">{summaryParts.join(' • ')}</p>
          )}
        </header>

        <div className="camera-results-toolbar">
          <label className="camera-results-filter">
            <input
              type="checkbox"
              checked={hideLowConfidence}
              onChange={(e) => setHideLowConfidence(e.target.checked)}
              disabled={!results.length}
            />
            Ocultar detecciones &lt; {(confidenceThreshold * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            className="camera-results-filter-range"
            min={0.2}
            max={0.9}
            step={0.05}
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(Math.min(Math.max(Number(e.target.value), 0.2), 0.9))}
            disabled={!hideLowConfidence || !results.length}
          />
          {hideLowConfidence && hiddenCount > 0 && (
            <span className="camera-results-filter-info">
              Ocultando {hiddenCount} deteccion{hiddenCount === 1 ? '' : 'es'}
            </span>
          )}
        </div>

        {meta?.status === 'processing' && (
          <div className="camera-results-processing">Analizando detecciones...</div>
        )}

        {meta?.imageDataUrl && (
          <div className="camera-results-preview">
            <div
              className={`camera-results-image-container${meta?.onRefine ? ' refinable' : ''}`}
              ref={imageContainerRef}
              onClick={meta?.onRefine ? handleImageClick : undefined}
            >
              <img src={meta.imageDataUrl} alt="Vista previa de la captura" />
              <div className="camera-results-box-layer">
                {meta.boxes.map((box) => (
                  <div
                    key={box.id}
                    className={`camera-results-box${activeBoxIds.has(box.id) ? ' active' : ''}`}
                    style={{
                      left: `${box.box.x * 100}%`,
                      top: `${box.box.y * 100}%`,
                      width: `${box.box.width * 100}%`,
                      height: `${box.box.height * 100}%`,
                    }}
                  >
                    <span className="camera-results-box-label">
                      {box.label} {(box.score * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {meta?.status === 'no-products' && (
          <div className="camera-results-empty">
            <p>{meta?.statusMessage || 'No se detectaron productos en la imagen.'}</p>
          </div>
        )}

        {hideLowConfidence && filteredResults.length === 0 && results.length > 0 && (
          <div className="camera-results-empty">
            <p>
              No hay detecciones con confianza superior a {(confidenceThreshold * 100).toFixed(0)}%. Ajusta el filtro
              para ver todos los resultados.
            </p>
          </div>
        )}

        <div className="camera-results-grid">
          {filteredResults.map((product) => {
            const displayTitle = product.title || product.aiResponse || `Producto ${product.index + 1}`;
            const summary = product.aiResponse && product.aiResponse !== displayTitle ? product.aiResponse : null;
            const status = product.status ?? 'ready';
            const statusLabel = (() => {
              switch (status) {
                case 'pending':
                  return 'Pendiente';
                case 'processing':
                  return 'Analizando...';
                case 'ready':
                  return 'Listo';
                case 'no-match':
                  return 'Sin coincidencias';
                case 'low-ocr':
                  return 'OCR insuficiente';
                case 'error':
                  return 'Error';
                default:
                  return null;
              }
            })();
              const selected = product.code ? selectedCodes.includes(product.code) : false;
              const confidence = product.offConfidence ?? product.score ?? null;
              const confidenceLabel = confidence != null ? `${Math.round(confidence * 100)}%` : null;
              const searchHint = product.searchQuery || product.searchCandidates?.[0] || null;
              const canCompare = Boolean(product.code) && status === 'ready';
              const detailsDisabled =
                (!product.code && !searchHint) || status === 'processing' || status === 'pending';
              const detailsLabel = 'Ampliar detalles';
            const cardClass = `camera-result-card${selected ? ' selected' : ''} status-${status}`;
            return (
              <div
                key={`${product.index}-${product.boxId ?? product.code ?? 'no-code'}`}
                className={cardClass}
                onMouseEnter={() => setHoveredBoxId(product.boxId ?? null)}
                onMouseLeave={() => setHoveredBoxId(null)}
              >
                <div className="camera-result-meta">
                  {product.prompt && (
                    <span className="camera-result-tag">
                      {product.prompt}
                      {product.score != null ? ` (${(product.score * 100).toFixed(0)}%)` : ''}
                    </span>
                  )}
                  {statusLabel && (
                    <span className={`camera-result-status status-${status}`}>{statusLabel}</span>
                  )}
                </div>
                <div className="camera-result-image">
                  {product.offImage ? (
                    <img src={product.offImage} alt={displayTitle} />
                  ) : (
                    <div className="camera-result-placeholder">Sin imagen</div>
                  )}
                </div>
                <div className="camera-result-info">
                  <h3>{displayTitle}</h3>
                  {summary && <p className="camera-result-subtitle">{summary}</p>}
                  {confidenceLabel && (
                    <p className="camera-result-subtitle">
                      Confianza: <strong>{confidenceLabel}</strong>
                      {product.offSource === 'barcode'
                        ? ' (codigo de barras)'
                        : product.offSource === 'search'
                        ? ' (OpenFoodFacts)'
                        : ''}
                    </p>
                  )}
                  {product.barcode && (
                    <p className="camera-result-subtitle">
                      Codigo: <strong>{product.barcode}</strong>
                    </p>
                  )}
                  {(product.brandCandidate || product.productCandidate) && (
                    <p className="camera-result-subtitle">
                      {product.brandCandidate && (
                        <span>
                          Marca: <strong>{product.brandCandidate}</strong>
                        </span>
                      )}
                      {product.brandCandidate && product.productCandidate && ' • '}
                      {product.productCandidate && (
                        <span>
                          Producto: <strong>{product.productCandidate}</strong>
                        </span>
                      )}
                    </p>
                  )}
                  {searchHint && (
                    <p className="camera-result-subtitle">
                      Busqueda sugerida: <strong>{searchHint}</strong>
                    </p>
                  )}
                  {product.message && <p className="camera-result-message">{product.message}</p>}
                  {status === 'low-ocr' && !product.message && (
                    <p className="camera-result-message">
                      El texto es insuficiente. Sube una foto mas nitida o acerca la camara al empaque.
                    </p>
                  )}
                  {status === 'no-match' && !product.message && (
                    <p className="camera-result-message">
                      No se encontro un producto coincidente en OpenFoodFacts.
                    </p>
                  )}
                </div>
                <div className="camera-result-actions">
                  <button
                    type="button"
                    className="camera-result-select"
                    disabled={!canCompare}
                    onClick={() => toggleSelection(product)}
                  >
                    {selected ? 'Quitar de comparacion' : 'Agregar a comparacion'}
                  </button>
                  <button
                    type="button"
                    className="camera-result-details"
                    disabled={detailsDisabled}
                    onClick={() => handleDetails(product)}
                  >
                    {detailsLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <footer className="camera-results-footer">
          <button
            type="button"
            className="camera-results-compare"
            disabled={selectedCodes.length < 2}
            onClick={handleCompare}
          >
            Comparar seleccionados ({selectedCodes.length})
          </button>
          <button
            type="button"
            className="camera-results-dismiss"
            onClick={handleClose}
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
