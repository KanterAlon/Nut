'use client';

import ReactDOM from 'react-dom';

interface AlertPopupProps {
  message: string;
  onClose: () => void;
}

export default function AlertPopup({ message, onClose }: AlertPopupProps) {
  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div className="alert-popup-container" onClick={onClose}>
      <div className="alert-popup-content" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
        <button className="alert-popup-close" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>,
    document.body,
  );
}

