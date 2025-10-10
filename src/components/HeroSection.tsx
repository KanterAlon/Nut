'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FiSearch, FiCamera } from 'react-icons/fi';
import { useCameraResults, CameraDetectedProduct } from '@/app/providers/CameraResultsProvider';
import CameraModal from './CameraModal';
import Loader from './Loader';

export default function HeroSection() {
  const [query, setQuery] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { showResults } = useCameraResults();
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
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiBase}/api/camera/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let bufferStr = '';
      const products: CameraDetectedProduct[] = [];
      let shouldStop = false;
      while (!shouldStop) {
        const { value, done } = await reader.read();
        if (done) break;
        bufferStr += decoder.decode(value, { stream: true });
        const lines = bufferStr.split('\n');
        bufferStr = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const payload = JSON.parse(line);
          if (payload.type === 'product') {
            products.push({
              index: typeof payload.index === 'number' ? payload.index : products.length,
              title: payload.title ?? '',
              aiResponse: payload.aiResponse ?? '',
              offImage: payload.offImage ?? null,
              offLink: payload.offLink ?? null,
              code: payload.code ?? null,
            });
          } else if (payload.type === 'done') {
            shouldStop = true;
            await reader.cancel();
            break;
          } else if (payload.error) {
            console.error('Camera stream error', payload.error);
          }
        }
      }
      if (products.length > 0) {
        products.sort((a, b) => a.index - b.index);
        showResults(products);
      } else {
        console.warn('Camara no detecto productos en la imagen.');
        alert('No se detectaron productos en la imagen. Intenta con otra foto o toma un acercamiento.');
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



