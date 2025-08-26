import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
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
    const supabase = await createClient();
    const { data: existente } = await supabase
      .from('Interacciones')
      .select('id_interaccion, tipo_interaccion')
      .eq('id_post', idPost)
      .eq('id_usuario', idUsuario)
      .maybeSingle();

    if (existente?.tipo_interaccion === 2) {
      await supabase
        .from('Interacciones')
        .delete()
        .eq('id_interaccion', existente.id_interaccion);
    } else {
      if (existente) {
        await supabase
          .from('Interacciones')
          .delete()
          .eq('id_interaccion', existente.id_interaccion);
      }
      await supabase.from('Interacciones').insert({
        id_post: idPost,
        id_usuario: idUsuario,
        tipo_interaccion: 2,
        fecha_interaccion: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error en darDislike:', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
