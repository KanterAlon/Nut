import { clerkMiddleware } from '@clerk/nextjs/server';
import type {
  NextFetchEvent,
  NextMiddleware,
  NextRequest,
} from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

const missingClerkEnvVars = [
  ['CLERK_SECRET_KEY', process.env.CLERK_SECRET_KEY],
  [
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  ],
].filter(([, value]) => !value);

if (missingClerkEnvVars.length > 0) {
  const missingList = missingClerkEnvVars.map(([name]) => name).join(', ');
  const message = `Missing Clerk environment variables: ${missingList}. Set the required credentials in your environment to run the app.`;
  console.error(message);
  throw new Error(message);
}

const runClerkMiddleware = clerkMiddleware(async (_auth, req) =>
  updateSession(req),
);

const middleware: NextMiddleware = async (req: NextRequest, event: NextFetchEvent) => {
  try {
    return await runClerkMiddleware(req, event);
  } catch (error) {
    console.error('Clerk middleware failed to handle the request.', error);
    throw error;
  }
};

export default middleware;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/contact).*)'],
};
