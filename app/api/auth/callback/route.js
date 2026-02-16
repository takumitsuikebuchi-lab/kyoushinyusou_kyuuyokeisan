import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/callback?code=xxx
 * Exchanges an OAuth / magic-link code for a session.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") || "/";

  if (code) {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth/callback] exchange error:", error);
        return NextResponse.redirect(`${origin}/login?error=auth_failed`);
      }
    }
  }

  return NextResponse.redirect(`${origin}${redirect}`);
}
