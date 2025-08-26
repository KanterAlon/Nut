import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/auth';

export async function POST(req: Request) {
  const { idPost } = await req.json();

  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json(
      { success: false, message: 'Usuario no autenticado' },
      { status: 401 }
    );
  }
  const idUsuario = user.id_usuario;

  try {
    const existente = await prisma.interacciones.findFirst({
      where: { id_post: idPost, id_usuario: idUsuario },
    });

    if (existente?.tipo_interaccion === 2) {
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
          tipo_interaccion: 2,
          fecha_interaccion: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error en darDislike:', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
