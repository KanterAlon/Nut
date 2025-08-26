import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('Posts')
      .select('id_post, contenido_post, fecha_creacion, imagen_url, interacciones(id_usuario, tipo_interaccion)')
      .neq('id_usuario', 1)
      .order('fecha_creacion', { ascending: false });

    if (error) throw error;

    // TODO: obtener el ID de usuario autenticado real
    const idUsuario = 1;

    interface DbInteraccion { id_usuario: number; tipo_interaccion: number }
    interface DbPost {
      id_post: number;
      contenido_post: string;
      fecha_creacion: string;
      imagen_url?: string | null;
      interacciones: DbInteraccion[] | null;
    }

    const posts = (data as DbPost[] | null)?.map(post => {
      const interacciones = post.interacciones ?? [];
      const likes = interacciones.filter(i => i.tipo_interaccion === 1);
      const dislikes = interacciones.filter(i => i.tipo_interaccion === 2);
      const liked = likes.some(i => i.id_usuario === idUsuario);
      const disliked = dislikes.some(i => i.id_usuario === idUsuario);

      return {
        id_post: post.id_post,
        contenido_post: post.contenido_post,
        fecha_creacion: post.fecha_creacion,
        imagen_url: post.imagen_url,
        likes: likes.length,
        dislikes: dislikes.length,
        liked,
        disliked,
      };
    }) ?? [];

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
