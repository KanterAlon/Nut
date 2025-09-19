export interface BlogPost {
  titulo_post: string;
  imagen_url: string;
  fecha_creacion: string;
  contenido_post: string;
}

export interface CommunityPost {
  id_post: number;
  contenido_post: string;
  fecha_creacion: string;
  autor: string;
  imagen_url: string | null;
  likes: number;
  dislikes: number;
  liked: boolean;
  disliked: boolean;
}
