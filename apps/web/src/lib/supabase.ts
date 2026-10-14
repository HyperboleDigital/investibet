import { createClient } from '@supabase/supabase-js';

// Clerk owns sessions; Supabase verifies Clerk JWTs via third-party auth.
// App.tsx wires the token getter in once Clerk has loaded. Before that,
// requests go out as anon, which covers the public read-only tables.
let getClerkToken: (() => Promise<string | null>) | null = null;
export const setClerkTokenGetter = (fn: () => Promise<string | null>) => { getClerkToken = fn; };

export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  accessToken: async () => (getClerkToken ? await getClerkToken() : null),
});
export const ENABLE_PROPS = import.meta.env.VITE_ENABLE_PROPS === 'true';
