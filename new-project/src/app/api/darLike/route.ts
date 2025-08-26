import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  const { idPost } = await req.json();

  // TODO: obtener el ID de usuario autenticado real
  const idUsuario = 1;

  try {
    const { data: existente, error: existenteError } = await supabase
      .from('Interacciones')
      .select('id_interaccion, tipo_interaccion')
      .eq('id_post', idPost)
      .eq('id_usuario', idUsuario)
      .maybeSingle();

    if (existenteError) throw existenteError;

    if (existente && existente.tipo_interaccion === 1) {
      const { error: deleteError } = await supabase
        .from('Interacciones')
        .delete()
        .eq('id_interaccion', existente.id_interaccion);
      if (deleteError) throw deleteError;
    } else {
      if (existente) {
        const { error: delErr } = await supabase
          .from('Interacciones')
          .delete()
          .eq('id_interaccion', existente.id_interaccion);
        if (delErr) throw delErr;
      }
      const { error: insertError } = await supabase.from('Interacciones').insert({
        id_post: idPost,
        id_usuario: idUsuario,
        tipo_interaccion: 1,
        fecha_interaccion: new Date().toISOString(),
      });
      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error en darLike:', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
