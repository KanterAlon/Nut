import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('Posts')
      .select('titulo_post, imagen_url, fecha_creacion, contenido_post')
      .eq('id_usuario', 1)
      .order('id_post', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, posts: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    console.error('Error fetching blog posts:', message);
    return NextResponse.json({ success: false, posts: [], message }, { status: 200 });
  }
}
