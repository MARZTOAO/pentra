import { createClient } from "@supabase/supabase-js";

// Vite exposes anything in .env that starts with VITE_ as import.meta.env.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey || url.startsWith("PASTE_")) {
  throw new Error(
    "Supabase credentials are missing. Open the .env file in the project root " +
      "and paste in your Project URL and anon key, then restart the app.",
  );
}

// One client, shared by the whole app. Importing this module anywhere
// gives you the same instance, which matters because it holds the session.
export const supabase = createClient(url, anonKey, {
  auth: {
    // Keeps you logged in after closing the app.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // desktop app - no OAuth redirects to read
  },
});
