/* eslint-disable @next/next/no-img-element */
'use client';

import { BlogPost } from '@/types';

interface BlogCardProps {
  post: BlogPost;
  onClick: (post: BlogPost) => void;
}

export default function BlogCard({ post, onClick }: BlogCardProps) {
  return (
    <div className="nutrition-card" onClick={() => onClick(post)}>
      <img
        src={`/img/${post.imagen_url}`}
        alt="Imagen del post"
        className="community-card-image"
      />
      <h3 className="community-card-text">{post.titulo_post}</h3>
    </div>
  );
}
