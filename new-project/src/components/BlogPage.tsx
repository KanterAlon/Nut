'use client';

import { useEffect, useState } from 'react';
import Loader from './Loader';
import BlogCard from './BlogCard';
import BlogPopup from './BlogPopup';
import { FiSearch } from 'react-icons/fi';
import { BlogPost } from '@/types';

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [popupPost, setPopupPost] = useState<BlogPost | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiBase}/api/blog`);

        if (!res.ok) {
          throw new Error(`Error al obtener posts: ${res.status}`);
        }

        const data = await res.json();
        setPosts(data);
      } catch (err) {
        console.error('Error al obtener posts del blog:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, []);

  const handleSearch = (
    e: React.KeyboardEvent<HTMLInputElement> | { key: string }
  ) => {
    if (e.key === 'Enter') {
      const match = posts.find((post) =>
        post.titulo_post.toLowerCase().includes(search.toLowerCase())
      );
      if (!match) alert('No se encontró ninguna tarjeta con ese nombre.');
    }
  };

  const handleCardClick = (post: BlogPost) => {
    setPopupPost(post);
  };

  const handleClosePopup = () => {
    setPopupPost(null);
  };

  return (
    <>
      {/* HERO CON BUSCADOR */}
      <section className="page" style={{ width: '90%' }}>
        <div className="inner">
          <div className="evaluation-content">
            <h1>¿QUÉ QUERÉS APRENDER HOY?</h1>
            <p>
              Descubrí herramientas prácticas, consejos útiles y perspectivas actuales para transformar tu relación con la comida.
            </p>
            <div className="search-bar">
              <button
                className="search-button search-icon-button"
                onClick={() => handleSearch({ key: 'Enter' })}
              >
                <FiSearch size={20} />
              </button>
              <input
                type="text"
                placeholder="Ej: Alimentación intuitiva"
                className="search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearch}
              />
            </div>
            <div className="search-hint">Presioná Enter o la lupa para buscar</div>
          </div>
        </div>
      </section>

      {/* LISTADO DE ARTÍCULOS */}
      <section
        className="sec-nutrition-lifestyle"
        style={{ display: popupPost ? 'none' : 'block' }}
      >
        {loading ? (
          <div className="loader">
            <Loader />
          </div>
        ) : (
          <div className="nutrition-lifestyle-inner">
            <h3>Nutrición y Estilo de Vida</h3>
            <p>
              Explorá artículos cuidadosamente seleccionados sobre bienestar integral, alimentación consciente y hábitos saludables. Inspirate para hacer cambios positivos y sostenibles.
            </p>
            <div className="cards-row" id="cardsContainer">
              {posts.map((post, idx) => (
                <BlogCard key={idx} post={post} onClick={handleCardClick} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* POPUP DE ARTÍCULO */}
      {popupPost && <BlogPopup post={popupPost} onClose={handleClosePopup} />}
    </>
  );
}
