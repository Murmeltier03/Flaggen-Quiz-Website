import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
