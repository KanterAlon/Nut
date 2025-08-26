import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const { contenidoPost, imagenUrl } = await req.json();

  try {
    await prisma.posts.create({
      data: {
        contenido_post: contenidoPost,
        imagen_url: imagenUrl,
        id_usuario: 1, // TODO: obtener el ID real del usuario
        fecha_creacion: new Date(),
      },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
