import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  const { idPost } = await req.json();

  // The Posts table uses an uppercase name in the database.
  const { data, error } = await supabase
    .from('Posts')
    .select('dislikes')
    .eq('id_post', idPost)
    .single();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  const dislikes = (data?.dislikes ?? 0) + 1;
  const { error: updateError } = await supabase
    .from('Posts')
    .update({ dislikes })
    .eq('id_post', idPost);

  if (updateError) {
    return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
