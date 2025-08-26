import { clerkMiddleware } from '@clerk/nextjs/server';
import { updateSession } from '@/utils/supabase/middleware';

export default clerkMiddleware(async (_auth, req) => {
  return updateSession(req);
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

