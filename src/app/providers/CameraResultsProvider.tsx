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
import type { ReactNode } from 'react';
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

  if (!open) return null;
  };

  const handleClose = () => {
    dismissResults();
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

        <div className="camera-results-body">
          {meta?.imageDataUrl && (
            <div className="camera-results-preview" aria-label="Vista previa de la captura">
              <img src={meta.imageDataUrl} alt="Vista previa de la captura" />
            </div>
          )}

          <div className="camera-results-list">
            {meta?.status === 'no-products' || results.length === 0 ? (
              <div className="camera-results-empty">
                <p>{meta?.statusMessage || 'No encontramos productos en la captura.'}</p>
              </div>
            ) : (
              results.map((product) => {
                const status = product.status ?? 'ready';
                const statusLabel = formatStatusLabel(status);
                const displayTitle = product.title || product.aiResponse || `Producto ${product.index + 1}`;
                const additionalInfo = [product.brandCandidate, product.productCandidate]
                  .filter(Boolean)
                  .join(' • ');
                const hasDetails = Boolean(
                  product.code || product.searchQuery || (product.searchCandidates && product.searchCandidates.length > 0),
                );
                const showExplore = Boolean(
                  product.searchQuery ||
                    (product.searchCandidates && product.searchCandidates.length > 0) ||
                    product.brandCandidate ||
                    product.productCandidate,
                );

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
                        {product.offImage ? (
                          <img src={product.offImage} alt={displayTitle} />
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
                        Ver producto
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


