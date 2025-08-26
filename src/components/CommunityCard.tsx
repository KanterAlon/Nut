'use client';
import { FaThumbsUp, FaThumbsDown, FaRegThumbsUp, FaRegThumbsDown } from 'react-icons/fa';

export interface Post {
  id: number;
  contenido: string;
  fecha: string;
  imagen_url?: string | null;
  likes: number;
  dislikes: number;
  liked: boolean;
  disliked: boolean;
}

interface Props {
  post: Post;
  onLike: (id: number) => void;
  onDislike: (id: number) => void;
}

export default function CommunityCard({ post, onLike, onDislike }: Props) {
  const isLiked = post.liked;
  const isDisliked = post.disliked;

  return (
    <div className="community-card">
      {post.imagen_url && (
        <img
          src={post.imagen_url.startsWith('http') ? post.imagen_url : `/img/${post.imagen_url}`}
          alt="Imagen del post"
          className="community-card-image"
        />
      )}
      <div className="bottom-community-card">
        <p className="community-card-text">{post.contenido}</p>
        <span className="community-time-posted">{post.fecha}</span>
        <div className="community-card-footer">
          <button className={`like-button ${isLiked ? 'active' : ''}`} onClick={() => onLike(post.id)}>
            {isLiked ? (
              <FaThumbsUp className="img-like" color="green" />
            ) : (
              <FaRegThumbsUp className="img-like" color="green" />
            )}
            <span className="like-count">{post.likes}</span>
          </button>
          <button className={`dislike-button ${isDisliked ? 'active' : ''}`} onClick={() => onDislike(post.id)}>
            {isDisliked ? (
              <FaThumbsDown className="img-dislike" color="red" />
            ) : (
              <FaRegThumbsDown className="img-dislike" color="red" />
            )}
            <span className="dislike-count">{post.dislikes}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

