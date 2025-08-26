import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const posts = await prisma.posts.findMany({
      where: { id_usuario: 1 },
      select: {
        titulo_post: true,
        imagen_url: true,
        fecha_creacion: true,
        contenido_post: true,
      },
      orderBy: { id_post: 'asc' },
    });

    return NextResponse.json({ success: true, posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    console.error('Error fetching blog posts:', message);
    return NextResponse.json({ success: false, posts: [], message }, { status: 500 });
  }
}
