import { createClient } from '@supabase/supabase-js';
import type { GetToken } from '@clerk/clerk-js';

export const createClerkSupabaseClient = (getToken: GetToken) => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: async (url, options) => {
          const token = await getToken({ template: 'supabase' });
          const headers = new Headers(options?.headers);
          if (token) headers.set('Authorization', `Bearer ${token}`);
          return fetch(url, { ...options, headers });
        },
      },
    }
  );
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
