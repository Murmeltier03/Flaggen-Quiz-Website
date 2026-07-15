import { createClient } from "@supabase/supabase-js";

// The Supabase/Vercel integration uses the server-only names. Keep the
// previous names as fallbacks so existing local and manually configured
// deployments continue to work.
const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasSupabase = Boolean(
  url &&
    serviceKey &&
    !url.includes("YOUR_PROJECT") &&
    !serviceKey.includes("YOUR_SERVER_KEY"),
);

export const supabaseAdmin = hasSupabase
  ? createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
