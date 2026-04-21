import { createClient } from '@supabase/supabase-js';

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Users sometimes paste env values wrapped in quotes in Vercel.
  return trimmed.replace(/^['"]|['"]$/g, '');
}

const supabaseUrl =
  readEnv('NEXT_PUBLIC_SUPABASE_URL') ?? readEnv('SUPABASE_URL');
const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL environment variable (or SUPABASE_URL fallback)'
  );
}

if (!serviceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

let validatedSupabaseUrl: string;
try {
  validatedSupabaseUrl = new URL(supabaseUrl).toString();
} catch {
  throw new Error(
    `Invalid Supabase URL in env (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL): ${supabaseUrl}`
  );
}

export const supabaseAdmin = createClient(validatedSupabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
  global: {
    fetch: async (input, init) => {
      try {
        return await fetch(input, init);
      } catch (error) {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.toString()
            : input.url;
        console.error('[supabase-admin] fetch failed', {
          requestUrl,
          supabaseHost: new URL(validatedSupabaseUrl).host,
          error:
            error instanceof Error ? error.message : 'Unknown fetch failure',
          cause:
            error instanceof Error && 'cause' in error
              ? String((error as { cause?: unknown }).cause)
              : undefined,
        });
        throw error;
      }
    },
  },
});

