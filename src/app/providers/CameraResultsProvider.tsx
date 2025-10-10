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
import { usePathname, useRouter } from 'next/navigation';
import { FaTimes } from 'react-icons/fa';

export interface CameraDetectedProduct {
  index: number;
  title: string;
  aiResponse?: string;
  offImage?: string | null;
  offLink?: string | null;
  code?: string | null;
}

interface CameraResultsContextValue {
  open: boolean;
  results: CameraDetectedProduct[];
  showResults: (items: CameraDetectedProduct[]) => void;
  closeResults: () => void;
  prepareForNavigation: () => void;
}

const CameraResultsContext = createContext<CameraResultsContextValue | undefined>(undefined);

export function CameraResultsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [results, setResults] = useState<CameraDetectedProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [shouldRestore, setShouldRestore] = useState(false);
  const [originPath, setOriginPath] = useState<string | null>(null);
  const lastPathRef = useRef(pathname);

  const showResults = useCallback(
    (items: CameraDetectedProduct[]) => {
      setResults(items);
      setOpen(true);
      setShouldRestore(false);
      setOriginPath(pathname);
    },
    [pathname],
  );

  const closeResults = useCallback(() => {
    setOpen(false);
    setShouldRestore(false);
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
      showResults,
      closeResults,
      prepareForNavigation,
    }),
    [open, results, showResults, closeResults, prepareForNavigation],
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
  const { open, results, closeResults, prepareForNavigation } = useCameraResults();
  const router = useRouter();
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSelectedCodes([]);
    }
  }, [open]);

  if (!open) return null;

  const toggleSelection = (code: string | null | undefined) => {
    if (!code) return;
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((value) => value !== code) : [...prev, code],
    );
  };

  const handleCompare = () => {
    if (selectedCodes.length < 2) return;
    prepareForNavigation();
    router.push(`/compare?codes=${selectedCodes.map(encodeURIComponent).join(',')}`);
  };

  const handleDetails = (code: string | null | undefined) => {
    if (!code) return;
    prepareForNavigation();
    router.push(`/producto?code=${encodeURIComponent(code)}`);
  };

  const handleClose = () => {
    closeResults();
  };

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
        </header>
        <div className="camera-results-grid">
          {results.map((product) => {
            const { index, code, title, aiResponse, offImage } = product;
            const displayTitle = title || aiResponse || `Producto ${index + 1}`;
            const selected = code ? selectedCodes.includes(code) : false;
            return (
              <div
                key={`${index}-${code ?? 'no-code'}`}
                className={`camera-result-card${selected ? ' selected' : ''}`}
              >
                <div className="camera-result-image">
                  {offImage ? (
                    <img src={offImage} alt={displayTitle} />
                  ) : (
                    <div className="camera-result-placeholder">Sin imagen</div>
                  )}
                </div>
                <div className="camera-result-info">
                  <h3>{displayTitle}</h3>
                  {aiResponse && aiResponse !== displayTitle && (
                    <p className="camera-result-subtitle">{aiResponse}</p>
                  )}
                </div>
                <div className="camera-result-actions">
                  <button
                    type="button"
                    className="camera-result-select"
                    disabled={!code}
                    onClick={() => toggleSelection(code)}
                  >
                    {selected ? 'Quitar de comparacion' : 'Agregar a comparacion'}
                  </button>
                  <button
                    type="button"
                    className="camera-result-details"
                    disabled={!code}
                    onClick={() => handleDetails(code)}
                  >
                    Ampliar detalles
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
