import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecret) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY in server/.env"
  );
}

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
