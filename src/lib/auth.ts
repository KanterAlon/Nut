import { currentUser } from '@clerk/nextjs/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Obtains the authenticated user from Clerk and ensures a corresponding
 * record exists in the database. Returns the Supabase user or null if
 * unauthenticated.
 */
export async function getAuthedUser() {
  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from('Usuarios')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;

  if (!existing) {
    const { data: newUser, error: insertError } = await supabase
      .from('Usuarios')
      .insert({
        nombre: user.firstName || 'Usuario',
        email,
        fecha_registro: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertError) throw insertError;
    return newUser;
  }

  return existing;
}
