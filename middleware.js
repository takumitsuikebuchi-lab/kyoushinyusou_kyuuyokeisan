import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * Next.js Middleware – refreshes the Supabase session on every request
 * and protects all routes except /login and static assets.
 */
export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public paths without auth check
  const publicPaths = ["/login", "/api/auth/callback", "/_next", "/favicon.ico"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured, allow all (local dev without auth)
  if (!url || !key) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      get(name) {
        return request.cookies.get(name)?.value;
      },
      set(name, value, options) {
        // Mirror cookies in both request and response so downstream sees them
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request });
        response.cookies.set({ name, value, ...options });
      },
      remove(name, options) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({ request });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to login for page requests; return 401 for API
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, message: "認証が必要です。ログインしてください。" },
        { status: 401 }
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
