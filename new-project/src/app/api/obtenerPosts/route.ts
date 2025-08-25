import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    // The table was created with an uppercase name in PostgreSQL, so we
    // need to reference it exactly as "Posts" when using Supabase.
    const { data, error, status } = await supabase
      .from('Posts')
      .select('id_post, contenido_post, fecha_creacion, imagen_url, likes, dislikes')
      .order('fecha_creacion', { ascending: false });

    if (error) {
      console.error('Error fetching posts:', error);
      // Return an empty list but avoid surfacing a 500 to the client so the
      // page can handle the failure gracefully.
      return NextResponse.json(
        { success: false, posts: [], message: error.message },
        { status: status || 200 }
      );
    }

    const posts = (data ?? []).map(post => ({
      ...post,
      liked: false,
      disliked: false,
    }));

    return NextResponse.json({ success: true, posts });
  } catch (err) {
    console.error('Unexpected error fetching posts:', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json(
      { success: false, posts: [], message },
      { status: 500 }
    );
  }
}
