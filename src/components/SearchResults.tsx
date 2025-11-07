'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDevMode } from '@/app/providers/DevModeProvider';
import { useCameraResults } from '@/app/providers/CameraResultsProvider';
import LazyImage from './LazyImage';
import AlertPopup from './AlertPopup';

interface Product {
  code: string | null;
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
  const [selected, setSelected] = useState<
    Array<{ id: string; code: string | null; name: string }>
  >([]);
  const [warning, setWarning] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [searchValue, setSearchValue] = useState(query);
  const router = useRouter();
  const { devMode } = useDevMode();
  const { replacementTarget, completeReplacement, cancelReplacement } = useCameraResults();

  const replacementActive = useMemo(() => Boolean(replacementTarget), [replacementTarget]);
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_URL || '', []);

  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    const start = performance.now();
    const showAlerts = devMode;
    fetch(`${apiBase}/api/SearchProducts?query=${encodeURIComponent(query)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          setProducts(
            (data.products as Product[]).map((product) => ({
              ...product,
              code: normalizeCode(product.code),
            })),
          );
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
  }, [query, devMode, apiBase, normalizeCode]);

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
    products.forEach((product, index) => {
      if (!normalizeCode(product.code)) {
        void resolveProductCode(product, index);
      }
    });
  }, [products, normalizeCode, resolveProductCode]);

  useEffect(() => {
    if (replacementActive) {
      setSelectionMode(false);
      setSelected([]);
    }
  }, [replacementActive]);

  const normalizeCode = useCallback((code: string | null | undefined) => {
    if (!code) return null;
    const trimmed = code.trim();
    if (!trimmed || trimmed.toLowerCase() === 'undefined') return null;
    const compact = trimmed.replace(/\s+/g, '');
    if (!/^\d{4,20}$/.test(compact)) return null;
    return compact;
  }, []);

  const codeCacheRef = useRef(new Map<string, string | null>());

  const resolveProductCode = useCallback(
    async (product: Product, index: number): Promise<string | null> => {
      const normalized = normalizeCode(product.code);
      if (normalized) return normalized;

      const name = product.name.trim();
      if (!name) return null;

      const cacheKey = `${name.toLowerCase()}|${product.image}`;
      if (codeCacheRef.current.has(cacheKey)) {
        const cached = codeCacheRef.current.get(cacheKey) ?? null;
        if (cached) {
          setProducts((prev) => {
            if (index < 0 || index >= prev.length) return prev;
            const current = prev[index];
            if (current.name !== product.name || current.image !== product.image) return prev;
            if (normalizeCode(current.code) === cached) return prev;
            const next = [...prev];
            next[index] = { ...current, code: cached };
            return next;
          });
        }
        return cached;
      }

      try {
        const res = await fetch(`${apiBase}/api/product?query=${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const resolved = normalizeCode((data?.code as string | null | undefined) ?? null);
        codeCacheRef.current.set(cacheKey, resolved ?? null);
        if (resolved) {
          setProducts((prev) => {
            if (index < 0 || index >= prev.length) return prev;
            const current = prev[index];
            if (current.name !== product.name || current.image !== product.image) return prev;
            if (normalizeCode(current.code) === resolved) return prev;
            const next = [...prev];
            next[index] = { ...current, code: resolved };
            return next;
          });
        }
        return resolved ?? null;
      } catch (error) {
        console.error('Failed to resolve product code', error);
        codeCacheRef.current.set(cacheKey, null);
        return null;
      }
    },
    [apiBase, normalizeCode],
  );

  const buildProductId = (product: Product, index: number) => {
    const normalized = normalizeCode(product.code);
    if (normalized) return `${normalized}-${index}`;
    const slug = product.name.replace(/\s+/g, '-').toLowerCase();
    return `search-${index}-${slug}`;
  };

  const handleClick = async (product: Product, productId: string, index: number) => {
    if (replacementActive && replacementTarget) {
      const code = (await resolveProductCode(product, index)) ?? normalizeCode(product.code);
      const success = completeReplacement({
        code,
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
      const resolved = (await resolveProductCode(product, index)) ?? normalizeCode(product.code);
      setSelected((prev) => {
        if (prev.some((item) => item.id === productId)) {
          return prev.filter((item) => item.id !== productId);
        }
        if (prev.length >= 10) {
          setWarning('Solo puedes comparar hasta 10 productos');
          setTimeout(() => setWarning(''), 2000);
          return prev;
        }
        return [...prev, { id: productId, code: resolved, name: product.name }];
      });
    } else {
      const normalized = (await resolveProductCode(product, index)) ?? normalizeCode(product.code);
      if (normalized) {
        router.push(`/producto?code=${encodeURIComponent(normalized)}`);
        return;
      }
      router.push(`/producto?query=${encodeURIComponent(product.name)}`);
    }
  };

  const toggleSelection = () => {
    if (replacementActive) return;
    if (selectionMode) setSelected([]);
    setSelectionMode(!selectionMode);
  };

  const handleCompare = () => {
    if (selected.length < 2) return;
    const values = selected
      .map((item) => item.code ?? item.name)
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length < 2) return;
    const query = values.map((value) => encodeURIComponent(value)).join(',');
    router.push(`/compare?codes=${query}`);
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
            const productId = buildProductId(p, index);
            const isSelected = selected.some((item) => item.id === productId);
            const key = `${productId}-${index}`;
            return (
              <div
                key={key}
                className={`product-card${isSelected ? ' selected' : ''}`}
                onClick={() => {
                  void handleClick(p, productId, index);
                }}
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

