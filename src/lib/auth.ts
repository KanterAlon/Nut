import { currentUser } from '@clerk/nextjs/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Obtains the authenticated user from Clerk and ensures a corresponding
 * record exists in the database. Returns the Supabase user or null if
 * unauthenticated.
 */
export async function getAuthedUser() {
  const hasClerkCredentials = Boolean(
    process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );

  if (!hasClerkCredentials) {
    return null;
  }

  let user: Awaited<ReturnType<typeof currentUser>> | null = null;
  try {
    user = await currentUser();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'Clerk is not available. Skipping authenticated user lookup.',
        error,
      );
    }
    return null;
  }
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
