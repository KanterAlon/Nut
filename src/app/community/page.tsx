'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FaPlus } from 'react-icons/fa';
import Loader from '@/components/Loader';
import CommunityCard, { Post } from '@/components/CommunityCard';
import CommunityPopup from '@/components/CommunityPopup';

interface AuthState {
  authenticated: boolean;
}

interface ApiPost {
  id_post: number;
  contenido_post: string;
  fecha_creacion: string;
  imagen_url?: string | null;
  likes: number;
  dislikes: number;
  liked: boolean;
  disliked: boolean;
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [popupOpen, setPopupOpen] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthState>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/obtenerPosts', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        const mapped: Post[] = data.posts.map((post: ApiPost) => ({
          id: post.id_post,
          contenido: post.contenido_post,
          fecha: new Date(post.fecha_creacion).toLocaleString(),
          imagen_url: post.imagen_url,
          likes: post.likes,
          dislikes: post.dislikes,
          liked: post.liked,
          disliked: post.disliked,
        }));
        setPosts(mapped);
      }
    } catch (err) {
      console.error('Error al obtener posts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth', { credentials: 'include' });
      const data = await res.json();
      setAuth(data);
    } catch (err) {
      console.error('Error al verificar sesión:', err);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
    checkAuth();
  }, [fetchPosts, checkAuth]);

  const handleLike = async (id: number) => {
    if (!auth.authenticated) return router.push('/login');
    const original = [...posts];
    setPosts(prev =>
      prev.map(p => {
        if (p.id !== id) return p;
        const liked = !p.liked;
        const disliked = liked ? false : p.disliked;
        let likes = p.likes;
        let dislikes = p.dislikes;
        if (p.liked) {
          likes -= 1;
        } else if (p.disliked) {
          dislikes -= 1;
          likes += 1;
        } else {
          likes += 1;
        }
        return { ...p, liked, disliked, likes, dislikes };
      })
    );
    try {
      await fetch('/api/darLike', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPost: id }),
      });
    } catch (error) {
      setPosts(original);
      console.error('Error al dar like:', error);
    }
  };

  const handleDislike = async (id: number) => {
    if (!auth.authenticated) return router.push('/login');
    const original = [...posts];
    setPosts(prev =>
      prev.map(p => {
        if (p.id !== id) return p;
        const disliked = !p.disliked;
        const liked = disliked ? false : p.liked;
        let likes = p.likes;
        let dislikes = p.dislikes;
        if (p.disliked) {
          dislikes -= 1;
        } else if (p.liked) {
          likes -= 1;
          dislikes += 1;
        } else {
          dislikes += 1;
        }
        return { ...p, liked, disliked, likes, dislikes };
      })
    );
    try {
      await fetch('/api/darDislike', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idPost: id }),
      });
    } catch (error) {
      setPosts(original);
      console.error('Error al dar dislike:', error);
    }
  };

  const handlePost = async () => {
    if (!auth.authenticated) return router.push('/login');
    if (newPostContent.trim() === '') {
      alert('El contenido no puede estar vacío.');
      return;
    }
    try {
      let imageUrl: string | null = null;
      if (selectedImage) {
        const key = process.env.NEXT_PUBLIC_IMGBB_KEY;
        if (key) {
          const formData = new FormData();
          formData.append('image', selectedImage);
          try {
            const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, {
              method: 'POST',
              body: formData,
            });
            const imgbbData = await imgbbRes.json();
            imageUrl = imgbbData.data.url;
          } catch (err) {
            console.error('Error al subir la imagen a imgbb:', err);
            alert('No se pudo subir la imagen, se publicará sin ella.');
          }
        } else {
          console.warn('NEXT_PUBLIC_IMGBB_KEY no definido, omitiendo subida de imagen');
        }
      }

      await fetch('/api/publicarPost', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenidoPost: newPostContent, imagenUrl: imageUrl }),
      });

      await fetchPosts();
      setNewPostContent('');
      setSelectedImage(null);
      setPreviewUrl(null);
      setPopupOpen(false);
    } catch (err) {
      console.error('Error al publicar el post:', err);
    }
  };

  return (
    <>
      <section className="community-section">
        <div className="inner-community">
          <h1 className="community-title">Comunidad</h1>
          <div className="community-cards-container">
            {loading ? (
              <Loader />
            ) : (
              <>
                <div
                  className="community-card create-post-card"
                  onClick={() => {
                    if (!auth.authenticated) return router.push('/login');
                    setPopupOpen(true);
                  }}
                >
                  <div className="bottom-community-card" style={{ alignItems: 'center' }}>
                    <FaPlus size={24} />
                    <p className="community-card-text">Crear un post</p>
                  </div>
                </div>
                {posts.length === 0 ? (
                  <p>No hay posts aún. ¡Sé el primero en publicar!</p>
                ) : (
                  posts.map(post => (
                    <CommunityCard
                      key={post.id}
                      post={post}
                      onLike={handleLike}
                      onDislike={handleDislike}
                    />
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <CommunityPopup
        isOpen={popupOpen}
        onClose={() => {
          setPopupOpen(false);
          setPreviewUrl(null);
          setSelectedImage(null);
        }}
        onPost={handlePost}
        content={newPostContent}
        setContent={setNewPostContent}
        previewUrl={previewUrl}
        setPreviewUrl={setPreviewUrl}
        setSelectedImage={setSelectedImage}
      />
    </>
  );
}

