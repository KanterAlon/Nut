'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Loader from './Loader';
import AlertPopup from './AlertPopup';

interface ProductData {
  code: string;
  name: string;
  image: string;
  nutriments?: Record<string, number>;
}

export default function ComparePage() {
  const params = useSearchParams();
  const codesParam = params.get('codes') ?? '';

  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    const codes = codesParam.split(',').filter(Boolean);
    if (codes.length === 0) {
      setLoading(false);
      return;
    }
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    const start = performance.now();
    const showAlerts = process.env.NEXT_PUBLIC_TIMING_ALERTS === 'true';
    Promise.all(
      codes.map((code) =>
        fetch(`${apiBase}/api/product?query=${encodeURIComponent(code)}`)
          .then((res) => {
            if (!res.ok) throw new Error(`status ${res.status}`);
            return res.json();
          })
          .then((data) => ({
            code,
            name: data.product_name || 'Producto sin nombre',
            image: data.image_url || '/img/lays-classic.svg',
            nutriments: data.nutriments || {},
          }))
          .catch(() => null),
      ),
    )
      .then((results) => {
        const filtered = results.filter(Boolean) as ProductData[];
        setProducts(filtered);
        if (showAlerts) {
          const elapsed = (performance.now() - start).toFixed(2);
          setAlertMessage(`Comparación obtenida en ${elapsed} ms`);
        }
      })
      .finally(() => setLoading(false));
  }, [codesParam]);

  if (loading)
    return (
      <div className="compare-loading">
        <Loader />
      </div>
    );

  if (products.length === 0)
    return <p className="no-results">No se encontraron productos.</p>;

  return (
    <div className="compare-page">
      <h1>Comparar productos</h1>
      <div className="compare-table-wrapper">
        <table className="compare-table">
          <thead>
            <tr>
              <th />
              {products.map((p) => (
                <th key={p.code}>
                  <div className="product-heading">
                    <img src={p.image} alt={p.name} />
                    <span>{p.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="feature-name">Proteínas (g)</td>
              {products.map((p, i) => (
                <td key={`${p.code}-prot-${i}`} className={p.nutriments?.proteins_100g != null ? undefined : 'no-data'}>
                  {p.nutriments?.proteins_100g ?? 'No disponible'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="feature-name">Carbohidratos (g)</td>
              {products.map((p, i) => (
                <td key={`${p.code}-carb-${i}`} className={p.nutriments?.carbohydrates_100g != null ? undefined : 'no-data'}>
                  {p.nutriments?.carbohydrates_100g ?? 'No disponible'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="feature-name">Grasas (g)</td>
              {products.map((p, i) => (
                <td key={`${p.code}-fat-${i}`} className={p.nutriments?.fat_100g != null ? undefined : 'no-data'}>
                  {p.nutriments?.fat_100g ?? 'No disponible'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {alertMessage && (
        <AlertPopup message={alertMessage} onClose={() => setAlertMessage('')} />
      )}
    </div>
  );
}

