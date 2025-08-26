'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FiSearch, FiCamera } from 'react-icons/fi';
import CameraModal from './CameraModal';
import Loader from './Loader';

export default function HeroSection() {
  const [query, setQuery] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isMobile = typeof window !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);

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

  const handleCapture = async (
    source: React.ChangeEvent<HTMLInputElement> | Blob,
  ) => {
    let file: File | Blob | null = null;
    if (source instanceof Blob) {
      file = source;
    } else if (source.target.files && source.target.files[0]) {
      file = source.target.files[0];
    }
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file, 'capture.jpg');
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3000/api/camera/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      const term = data.ai?.response?.trim();
      if (term) {
        router.push(`/search?query=${encodeURIComponent(term)}`);
      }
    } catch (err) {
      console.error('Camera search error', err);
    } finally {
      setLoading(false);
      setShowCamera(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
          <div className="search-hint">Presioná Enter o la lupa para buscar</div>
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

