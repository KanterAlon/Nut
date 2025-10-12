'use client';

import { useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { FaTimes } from 'react-icons/fa';
import Loader from './Loader';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (source: Blob | React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;
}

export default function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const webcamRef = useRef<Webcam>(null);
  const [capturing, setCapturing] = useState(false);

  if (!isOpen) return null;

  const capture = async () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setCapturing(true);
        const res = await fetch(imageSrc);
        const blob = await res.blob();
        await onCapture(blob);
        setCapturing(false);
      }
    }
  };

  return (
    <div className="camera-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="camera-modal" onClick={(e) => e.stopPropagation()}>
        <header className="camera-modal-header">
          <h2>Escanear producto</h2>
          <button className="camera-modal-close" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </header>
        <div className="camera-modal-body">
          <div className="camera-preview">
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: 'environment' }}
            />
          </div>
          <button className="capture-btn" onClick={capture} disabled={capturing}>
            {capturing ? 'Buscando...' : 'Tomar foto y buscar'}
          </button>
        </div>
        {capturing && (
          <div className="capture-loader">
            <Loader />
          </div>
        )}
      </div>
    </div>
  );
}

