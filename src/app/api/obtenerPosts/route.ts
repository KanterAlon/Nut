import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getAuthedUser } from '@/lib/auth';

interface Interaccion {
  id_usuario: number;
  tipo_interaccion: number;
}

interface PostRecord {
  id_post: number;
  contenido_post: string;
  fecha_creacion: string;
  imagen_url: string | null;
  usuario: { nombre: string | null }[] | null;
  interacciones: Interaccion[] | null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('Posts')
      .select(
        `id_post, contenido_post, fecha_creacion, imagen_url,
         usuario:Usuarios(nombre),
         interacciones:Interacciones(id_usuario, tipo_interaccion)`
      )
      .neq('id_usuario', 1)
      .order('fecha_creacion', { ascending: false });
    if (error) throw error;

    const user = await getAuthedUser();
    const idUsuario = user?.id_usuario ?? null;
    const posts = ((data as PostRecord[] | null) ?? []).map((post) => {
      const likes = (post.interacciones ?? []).filter(i => i.tipo_interaccion === 1);
      const dislikes = (post.interacciones ?? []).filter(i => i.tipo_interaccion === 2);
      return {
        id_post: post.id_post,
        contenido_post: post.contenido_post,
        fecha_creacion: post.fecha_creacion,
        autor: post.usuario?.[0]?.nombre ?? 'Usuario',
        imagen_url: post.imagen_url,
        likes: likes.length,
        dislikes: dislikes.length,
        liked: idUsuario ? likes.some(i => i.id_usuario === idUsuario) : false,
        disliked: idUsuario ? dislikes.some(i => i.id_usuario === idUsuario) : false,
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
