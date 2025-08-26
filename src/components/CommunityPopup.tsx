/* eslint-disable @next/next/no-img-element */
'use client';
import { useRef } from 'react';
import { FaTimes, FaImage } from 'react-icons/fa';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onPost: () => void;
  content: string;
  setContent: (value: string) => void;
  previewUrl: string | null;
  setPreviewUrl: (url: string | null) => void;
  setSelectedImage: (file: File | null) => void;
}

export default function CommunityPopup({
  isOpen,
  onClose,
  onPost,
  content,
  setContent,
  previewUrl,
  setPreviewUrl,
  setSelectedImage,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const triggerFile = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="popup-container">
      <div className="popup-content">
        <button className="close-btn" onClick={onClose} aria-label="Cerrar">
          <FaTimes />
        </button>
        <div className="top-pop-up-add-post">
          <textarea
            id="postInput"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="¿Qué quieres decir?"
            required
          />
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            className="button-select-img"
            aria-label="Seleccionar imagen"
            onClick={triggerFile}
          >
            <FaImage />
          </button>
        </div>
        {previewUrl && (
          <img src={previewUrl} className="post-image-preview" alt="previsualización" />
        )}
        <button className="publish-btn" onClick={onPost}>
          Publicar
        </button>
      </div>
    </div>
  );
}

