'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiSearch } from 'react-icons/fi';

export default function HeroSection() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/search?query=${encodeURIComponent(query.trim())}`);
    }
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
          <h1>EVALUÁ TU PRODUCTO</h1>
          <h3>Acá encontrarás toda la información nutricional 100% simplificada</h3>

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
            </div>
          </div>
          <div className="search-hint">Presioná Enter o la lupa para buscar</div>
        </div>
      </div>
    </section>
  );
}

