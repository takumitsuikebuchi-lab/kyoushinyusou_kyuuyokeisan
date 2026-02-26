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

  // Supabase 未設定の場合: ローカル開発のみ許可、本番環境では 503 を返す
  if (!url || !key) {
    if (process.env.NODE_ENV === "production") {
      // 本番でSupabaseが未設定 → 設定ミスによる全データ露出を防ぐ
      return NextResponse.json(
        { ok: false, message: "サービス設定エラーです。管理者にお問い合わせください。" },
        { status: 503 }
      );
    }
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
