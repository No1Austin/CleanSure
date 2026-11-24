import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecret) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY in server/.env"
  );
}

// Privileged server-only database client. Never sign users in on this instance:
// signInWithPassword mutates the client's in-memory auth session, which can
// make subsequent database reads run under a user's RLS permissions.
export const supabase = createClient(
  supabaseUrl,
  supabaseSecret,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Dedicated stateless auth client: user sessions cannot contaminate DB reads.
export const authClient = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});
