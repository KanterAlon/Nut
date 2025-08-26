import { currentUser } from '@clerk/nextjs/server';
import { prisma } from './prisma';

/**
 * Obtains the authenticated user from Clerk and ensures
 * a corresponding record exists in the database.
 * Returns the Prisma user or null if unauthenticated.
 */
export async function getAuthedUser() {
  const user = await currentUser();
  if (!user) return null;

  const email = user.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  let dbUser = await prisma.usuarios.findUnique({ where: { email } });
  if (!dbUser) {
    dbUser = await prisma.usuarios.create({
      data: {
        nombre: user.firstName || 'Usuario',
        email,
        fecha_registro: new Date(),
      },
    });
  }
  return dbUser;
}
