import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getAuthedUser } from '@/lib/auth';

export async function POST(req: Request) {
  const { contenidoPost, imagenUrl } = await req.json();

  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json(
      { success: false, message: 'Usuario no autenticado' },
      { status: 401 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: nuevo, error } = await supabase
      .from('posts')
      .insert({
        contenido_post: contenidoPost,
        imagen_url: imagenUrl,
        id_usuario: user.id_usuario,
        fecha_creacion: new Date().toISOString(),
      })
      .select('id_post, contenido_post, fecha_creacion, imagen_url')
      .single();
    if (error) throw error;

    return NextResponse.json({
      success: true,
      post: {
        id_post: nuevo.id_post,
        contenido_post: nuevo.contenido_post,
        fecha_creacion: nuevo.fecha_creacion,
        autor: user.nombre,
        imagen_url: nuevo.imagen_url,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
