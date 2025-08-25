import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  const { contenidoPost, imagenUrl } = await req.json();

  const { error } = await supabase
    .from('posts')
    .insert({
      contenido_post: contenidoPost,
      imagen_url: imagenUrl,
    });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
