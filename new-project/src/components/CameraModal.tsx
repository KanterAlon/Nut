'use client';

import { useRef, useState, MouseEvent } from 'react';
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

  const handleContainerClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).classList.contains('popup-container')) onClose();
  };

  return (
    <div className="popup-container" onClick={handleContainerClick}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Cerrar">
          <FaTimes />
        </button>
        <div className="camera-wrapper">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: 'environment' }}
          />
        </div>
        <button className="capture-btn" onClick={capture}>Tomar foto</button>
        {capturing && (
          <div className="capture-loader">
            <Loader />
          </div>
        )}
      </div>
    </div>
  );
}

