/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import { BlogPost } from '@/types';

interface BlogPopupProps {
  post: BlogPost;
  onClose: () => void;
}

export default function BlogPopup({ post, onClose }: BlogPopupProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!post) return null;

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).classList.contains('blog-popup-container')) onClose();
  };

  return createPortal(
    <div className="blog-popup-container" role="dialog" aria-modal="true" onClick={handleContainerClick}>
      <div className="blog-popup-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn-popup" onClick={onClose} aria-label="Cerrar">
          <FaTimes />
        </button>
        <img src={`/img/${post.imagen_url}`} alt="" className="blog-popup-image" />
        <h1 id="blog-popup-title">{post.titulo_post}</h1>
        <h3>Escrito por todo el equipo de Nut</h3>
        <hr />
        <span>{post.fecha_creacion}</span>
        <p>{post.contenido_post}</p>
      </div>
    </div>,
    document.body
  );
}
