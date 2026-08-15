import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

const missingEnv = !supabaseUrl || !supabaseAnonKey;

if (missingEnv) {
  console.error(
    '[TapTap] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Set them in Vercel → Project → Settings → Environment Variables, then Redeploy. ' +
      'Vite inlines these at build time; adding env vars without redeploying will not work.'
  );
}

/**
 * Explicit apikey header avoids "No API key found in request" when the key was
 * empty/undefined at build time or stripped by intermediate layers.
 */
export const supabase: SupabaseClient = createClient(
  missingEnv ? 'https://placeholder.supabase.co' : supabaseUrl,
  missingEnv ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder' : supabaseAnonKey,
  {
    global: {
      headers: missingEnv
        ? {}
        : {
            apikey: supabaseAnonKey,
          },
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export function assertSupabaseConfigured(): void {
  if (missingEnv) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel and redeploy.'
    );
  }
}
