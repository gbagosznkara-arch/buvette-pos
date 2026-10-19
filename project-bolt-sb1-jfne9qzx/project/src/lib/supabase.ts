import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon);

// createClient throws without a URL, which would blank the whole app; use a
// placeholder so main.tsx can show a configuration message instead.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anon || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
