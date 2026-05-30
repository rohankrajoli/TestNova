import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function deriveSupabaseUrlFromDatabaseUrl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const match = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    return match ? `https://${match[1]}.supabase.co` : null;
  } catch {
    return null;
  }
}

const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  (process.env.DATABASE_URL ? deriveSupabaseUrlFromDatabaseUrl(process.env.DATABASE_URL) : null);

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase credentials missing from environment variables.");
}

export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

export const initializeDatabase = async () => {
  // We'll keep this as a no-op or a simple check to avoid breaking imports
  return true;
};
