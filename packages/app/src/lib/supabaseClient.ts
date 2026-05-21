import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const urlValid = !!url && (url.startsWith('https://') || url.startsWith('http://'));
export const supabaseConfigured = urlValid && !!key;

// Only instantiated when env vars are present — avoids JWT validation errors at module load.
// All consumers must guard with supabaseConfigured before calling methods.
let _supabase: ReturnType<typeof createClient> | null = null;
if (supabaseConfigured) {
  try {
    _supabase = createClient(url!, key!);
  } catch {
    // misconfigured — treat as unconfigured
  }
}
export const supabase = _supabase as ReturnType<typeof createClient>;
