import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/auth';

export async function GET() {
  try {
    const data = await prisma.posts.findMany({
      where: {
        NOT: { id_usuario: 1 },
      },
      orderBy: { fecha_creacion: 'desc' },
      include: {
        usuario: { select: { nombre: true } },
        interacciones: {
          select: { id_usuario: true, tipo_interaccion: true },
        },
      },
    });


    const user = await getAuthedUser();
    const idUsuario = user?.id_usuario ?? null;
    const posts = data.map((post) => {
      const likes = post.interacciones.filter((i) => i.tipo_interaccion === 1);
      const dislikes = post.interacciones.filter((i) => i.tipo_interaccion === 2);

      return {
        id_post: post.id_post,
        contenido_post: post.contenido_post,
        fecha_creacion: post.fecha_creacion.toISOString(),
        autor: post.usuario?.nombre ?? 'Usuario',
        imagen_url: post.imagen_url,
        likes: likes.length,
        dislikes: dislikes.length,
        liked: idUsuario ? likes.some((i) => i.id_usuario === idUsuario) : false,
        disliked: idUsuario ? dislikes.some((i) => i.id_usuario === idUsuario) : false,
      };
    });

    return NextResponse.json({ success: true, posts });
  } catch (err) {
    console.error('Error fetching posts:', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json(
      { success: false, posts: [], message },
      { status: 500 }
    );
  }
}
