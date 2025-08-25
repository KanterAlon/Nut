import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  const { data, error } = await supabase
    .from('posts')
    .select('id_post, contenido_post, fecha_creacion, imagen_url, likes, dislikes')
    .order('fecha_creacion', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const posts = (data ?? []).map(post => ({
    ...post,
    liked: false,
    disliked: false,
  }));

  return NextResponse.json({ success: true, posts });
}
