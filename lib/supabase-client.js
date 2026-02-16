"use client";

import { createBrowserClient } from "@supabase/ssr";

let _client = null;

/**
 * Singleton Supabase browser client.
 * Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from env.
 */
export function getSupabaseBrowserClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("[supabase-client] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
    return null;
  }
  _client = createBrowserClient(url, key);
  return _client;
}
