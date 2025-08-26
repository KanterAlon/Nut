import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: posts, error } = await supabase
      .from('posts')
      .select('titulo_post, imagen_url, fecha_creacion, contenido_post')
      .eq('id_usuario', 1)
      .order('id_post', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ success: true, posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    console.error('Error fetching blog posts:', message);
    return NextResponse.json(
      { success: false, posts: [], message },
      { status: 500 }
    );
  }
}
