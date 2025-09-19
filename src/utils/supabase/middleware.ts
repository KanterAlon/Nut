import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';

let hasLoggedSupabaseWarning = false;

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next();
  try {
    const { url, key } = getSupabaseConfig();
    const supabase = createServerClient(url, key, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set(name, value, options);
        },
        remove(name: string, _options: CookieOptions) {
          void _options;
          response.cookies.delete(name);
        },
      },
    });
    await supabase.auth.getSession();
  } catch (error) {
    if (!hasLoggedSupabaseWarning && process.env.NODE_ENV !== 'production') {
      console.warn(
        'Supabase credentials are not configured. Skipping session refresh.',
        error,
      );
      hasLoggedSupabaseWarning = true;
    }
  }
  return response;
}
