'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [warning, setWarning] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    const start = performance.now();
    const showAlerts = process.env.NEXT_PUBLIC_TIMING_ALERTS === 'true';
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
  }, [query]);

  const handleClick = (product: Product) => {
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
    if (selectionMode) setSelected([]);
    setSelectionMode(!selectionMode);
  };

  const handleCompare = () => {
    if (selected.length < 2) return;
    const codes = selected.map((c) => encodeURIComponent(c)).join(',');
    router.push(`/compare?codes=${codes}`);
  };

  const skeletons = Array.from({ length: 6 });

  return (
    <div className="search-results-page">
      <header className="results-header">
        <h2>Resultados para &quot;{query}&quot;</h2>
        <button className="selection-toggle" onClick={toggleSelection}>
          {selectionMode ? 'Cancelar' : 'Seleccionar'}
        </button>
      </header>

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

