import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextMiddleware, NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

const hasClerkCredentials = Boolean(
  process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

let hasLoggedClerkWarning = false;

const middleware: NextMiddleware = hasClerkCredentials
  ? clerkMiddleware(async (_auth, req) => updateSession(req))
  : async (req: NextRequest) => {
      if (!hasLoggedClerkWarning && process.env.NODE_ENV !== 'production') {
        console.warn(
          'Clerk credentials are not configured. Skipping Clerk middleware.',
        );
        hasLoggedClerkWarning = true;
      }
      return updateSession(req);
    };

export default middleware;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/contact).*)'],
};
