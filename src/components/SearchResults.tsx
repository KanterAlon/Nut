'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDevMode } from '@/app/providers/DevModeProvider';
import { useCameraResults } from '@/app/providers/CameraResultsProvider';
import LazyImage from './LazyImage';
import AlertPopup from './AlertPopup';

interface Product {
  code: string;
  name: string;
  image: string;
}

export default function SearchResults() {
  const params = useSearchParams();
  const query = params.get('query') ?? '';
  const replacementFlag = params.get('replacement');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [warning, setWarning] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [searchValue, setSearchValue] = useState(query);
  const router = useRouter();
  const { devMode } = useDevMode();
  const { replacementTarget, completeReplacement, cancelReplacement } = useCameraResults();

  const replacementActive = useMemo(() => Boolean(replacementTarget), [replacementTarget]);

  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    const start = performance.now();
    const showAlerts = devMode;
    fetch(`${apiBase}/api/SearchProducts?query=${encodeURIComponent(query)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          setProducts(data.products);
          const elapsed = (performance.now() - start).toFixed(2);
          const source = data.source === 'cache' ? 'la cache' : 'OpenFoodFacts';
          if (showAlerts) {
            setAlertMessage(`Resultados obtenidos de ${source} en ${elapsed} ms`);
          }
        } else {
          setProducts([]);
        }
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [query, devMode]);

  useEffect(() => {
    if (query) return;
    setLoading(false);
    setProducts([]);
  }, [query]);

  useEffect(() => {
    if (!devMode) {
      setAlertMessage('');
    }
  }, [devMode]);

  useEffect(() => {
    if (replacementActive) {
      setSelectionMode(false);
      setSelected([]);
    }
  }, [replacementActive]);

  const handleClick = (product: Product) => {
    if (replacementActive && replacementTarget) {
      const success = completeReplacement({
        code: product.code || null,
        name: product.name,
        image: product.image || null,
      });
      if (success) {
        const destination = replacementTarget.returnPath || '/';
        router.push(destination);
      }
      return;
    }
    if (selectionMode) {
      setSelected((prev) => {
        if (prev.includes(product.code)) return prev.filter((c) => c !== product.code);
        if (prev.length >= 10) {
          setWarning('Solo puedes comparar hasta 10 productos');
          setTimeout(() => setWarning(''), 2000);
          return prev;
        }
        return [...prev, product.code];
      });
    } else {
      router.push(`/producto?code=${encodeURIComponent(product.code)}`);
    }
  };

  const toggleSelection = () => {
    if (replacementActive) return;
    if (selectionMode) setSelected([]);
    setSelectionMode(!selectionMode);
  };

  const handleCompare = () => {
    if (selected.length < 2) return;
    const codes = selected.map((c) => encodeURIComponent(c)).join(',');
    router.push(`/compare?codes=${codes}`);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = searchValue.trim();
    const searchParams = new URLSearchParams();
    if (trimmed) {
      searchParams.set('query', trimmed);
    }
    if (replacementActive || replacementFlag) {
      searchParams.set('replacement', '1');
    }
    const next = searchParams.toString();
    router.push(next ? `/search?${next}` : '/search');
  };

  const handleCancelReplacement = () => {
    cancelReplacement();
    if (replacementTarget?.returnPath) {
      router.push(replacementTarget.returnPath);
    } else {
      router.push('/');
    }
  };

  const pageTitle = query ? `Resultados para "${query}"` : 'Buscar productos';

  const skeletons = Array.from({ length: 6 });

  return (
    <div className="search-results-page">
      <header className="results-header">
        <h2>{pageTitle}</h2>
        <div className="results-header-actions">
          {replacementActive ? (
            <button className="selection-toggle" onClick={handleCancelReplacement}>
              Cancelar reemplazo
            </button>
          ) : (
            <button className="selection-toggle" onClick={toggleSelection}>
              {selectionMode ? 'Cancelar' : 'Seleccionar'}
            </button>
          )}
        </div>
      </header>

      <form className="results-search-form" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Buscar por nombre o código"
          aria-label="Buscar productos"
        />
        <button type="submit">Buscar</button>
      </form>

      {replacementActive && (
        <div className="replacement-info">
          Selecciona el producto que deseas usar en lugar del detectado automáticamente.
        </div>
      )}

      {loading ? (
        <div className="cards-container">
          {skeletons.map((_, i) => (
            <div key={i} className="product-card">
              <div className="lazy-image-wrapper">
                <div className="image-skeleton" />
              </div>
              <div className="text-skeleton" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="no-results">No se encontraron productos.</p>
      ) : (
        <div className="cards-container">
          {products.map((p, index) => {
            const isSelected = selected.includes(p.code);
            const key = p.code ? `${p.code}-${index}` : index;
            return (
              <div
                key={key}
                className={`product-card${isSelected ? ' selected' : ''}`}
                onClick={() => handleClick(p)}
              >
                <LazyImage src={p.image} alt={p.name} className="card-image" />
                <h3 className="card-title">{p.name}</h3>
              </div>
            );
          })}
        </div>
      )}

      {selectionMode && (
        <>
          {warning && <div className="selection-warning">{warning}</div>}
          <div className="compare-bar">
            <button
              className="compare-button"
              disabled={selected.length < 2}
              onClick={handleCompare}
            >
              Comparar ({selected.length})
            </button>
          </div>
        </>
      )}
      {alertMessage && (
        <AlertPopup message={alertMessage} onClose={() => setAlertMessage('')} />
      )}
    </div>
  );
}

