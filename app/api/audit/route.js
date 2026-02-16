import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const supabaseHeaders = (extra = {}) => ({
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

/**
 * GET /api/audit?limit=50
 * Returns recent audit log entries.
 */
export async function GET(req) {
  if (!hasSupabaseConfig) {
    return NextResponse.json({ ok: true, logs: [], message: "Supabase未設定" });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    const query = new URLSearchParams({
      select: "id,ts,user_email,action,detail",
      order: "ts.desc",
      limit: String(limit),
    });
    const url = `${SUPABASE_URL}/rest/v1/audit_log?${query.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: supabaseHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      // Table may not exist yet — return empty
      return NextResponse.json({ ok: true, logs: [], message: "テーブル未作成" });
    }

    const logs = await response.json();
    return NextResponse.json({ ok: true, logs: Array.isArray(logs) ? logs : [] });
  } catch (error) {
    console.error("[audit][GET] error:", error);
    return NextResponse.json({ ok: true, logs: [] });
  }
}

/**
 * POST /api/audit
 * Body: { action, detail?, userEmail?, meta? }
 */
export async function POST(req) {
  if (!hasSupabaseConfig) {
    return NextResponse.json({ ok: true });
  }

  try {
    const body = await req.json();
    const payload = {
      user_email: body.userEmail || null,
      action: body.action || "unknown",
      detail: body.detail || null,
      meta: body.meta || null,
    };

    const url = `${SUPABASE_URL}/rest/v1/audit_log`;
    const response = await fetch(url, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      // Silently ignore — audit should never block operations
      console.error("[audit][POST] write failed:", response.status);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[audit][POST] error:", error);
    return NextResponse.json({ ok: true });
  }
}
