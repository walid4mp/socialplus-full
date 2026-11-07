import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://iugcevwsgxmomqjbgqoq.supabase.co";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_gk7nR55Sc-pSWGE1QYTBdw_XEJeSL9Q";

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
export const SUPABASE_URL = url;
