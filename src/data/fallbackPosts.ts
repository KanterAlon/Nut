import type { CommunityPost } from '@/types';

const fallbackPosts: CommunityPost[] = [
  {
    id_post: 1001,
    contenido_post:
      '¡Bienvenido a la comunidad de Nut! Aquí podrás compartir tus avances y preguntar cualquier duda relacionada con tus hábitos saludables.',
    fecha_creacion: '2024-03-18T14:20:00.000Z',
    autor: 'Equipo Nut',
    imagen_url: null,
    likes: 18,
    dislikes: 0,
    liked: false,
    disliked: false,
  },
  {
    id_post: 1002,
    contenido_post:
      '¿Alguien más está probando la rutina de ejercicios de bajo impacto? Me está ayudando mucho con la flexibilidad. Recomendaciones para complementarla?',
    fecha_creacion: '2024-03-16T09:05:00.000Z',
    autor: 'Lucía',
    imagen_url: null,
    likes: 11,
    dislikes: 1,
    liked: false,
    disliked: false,
  },
  {
    id_post: 1003,
    contenido_post:
      'Acabo de preparar la receta de smoothie verde publicada la semana pasada. ¡Deliciosa y súper energética! Les comparto la foto en los comentarios.',
    fecha_creacion: '2024-03-14T18:45:00.000Z',
    autor: 'Carlos',
    imagen_url: null,
    likes: 22,
    dislikes: 2,
    liked: false,
    disliked: false,
  },
];

export default fallbackPosts;
