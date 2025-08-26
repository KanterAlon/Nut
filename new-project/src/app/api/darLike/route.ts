import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  const { idPost } = await req.json();

  // TODO: obtener el ID de usuario autenticado real
  const idUsuario = 1;

  try {
    const existente = await prisma.interacciones.findFirst({
      where: { id_post: idPost, id_usuario: idUsuario },
    });

    if (existente?.tipo_interaccion === 1) {
      await prisma.interacciones.delete({
        where: { id_interaccion: existente.id_interaccion },
      });
    } else {
      if (existente) {
        await prisma.interacciones.delete({
          where: { id_interaccion: existente.id_interaccion },
        });
      }
      await prisma.interacciones.create({
        data: {
          id_post: idPost,
          id_usuario: idUsuario,
          tipo_interaccion: 1,
          fecha_interaccion: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error en darLike:', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
