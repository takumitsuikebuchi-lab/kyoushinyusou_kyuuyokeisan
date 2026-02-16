import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const MAX_HISTORY = 50;

const supabaseHeaders = (extra = {}) => ({
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

/**
 * GET /api/state-history?limit=20
 * Returns recent state snapshots (without full data payload for listing).
 */
export async function GET(req) {
  if (!hasSupabaseConfig) {
    return NextResponse.json({ ok: true, history: [] });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 20, MAX_HISTORY);

    const query = new URLSearchParams({
      select: "id,saved_at,saved_by,summary",
      order: "saved_at.desc",
      limit: String(limit),
    });
    const url = `${SUPABASE_URL}/rest/v1/state_history?${query.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: supabaseHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ ok: true, history: [], message: "テーブル未作成" });
    }

    const rows = await response.json();
    return NextResponse.json({ ok: true, history: Array.isArray(rows) ? rows : [] });
  } catch (error) {
    console.error("[state-history][GET] error:", error);
    return NextResponse.json({ ok: true, history: [] });
  }
}

/**
 * POST /api/state-history
 * Body: { data, savedBy?, summary? }
 * Saves a full state snapshot for rollback.
 */
export async function POST(req) {
  if (!hasSupabaseConfig) {
    return NextResponse.json({ ok: true });
  }

  try {
    const body = await req.json();
    const payload = {
      saved_by: body.savedBy || null,
      summary: body.summary || "手動バックアップ",
      data: body.data || null,
    };

    // Insert the new snapshot
    const url = `${SUPABASE_URL}/rest/v1/state_history`;
    const response = await fetch(url, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("[state-history][POST] insert failed:", response.status);
      return NextResponse.json({ ok: false, message: "バックアップ保存に失敗しました" }, { status: 500 });
    }

    // Prune old snapshots beyond MAX_HISTORY
    try {
      // Get the ID of the Nth oldest record
      const countQuery = new URLSearchParams({
        select: "id",
        order: "saved_at.desc",
        offset: String(MAX_HISTORY),
        limit: "1",
      });
      const countUrl = `${SUPABASE_URL}/rest/v1/state_history?${countQuery.toString()}`;
      const countRes = await fetch(countUrl, {
        method: "GET",
        headers: supabaseHeaders(),
        cache: "no-store",
      });
      if (countRes.ok) {
        const oldest = await countRes.json();
        if (Array.isArray(oldest) && oldest.length > 0) {
          // Delete all records with id <= oldest
          const deleteUrl = `${SUPABASE_URL}/rest/v1/state_history?id=lte.${oldest[0].id}`;
          await fetch(deleteUrl, {
            method: "DELETE",
            headers: supabaseHeaders(),
            cache: "no-store",
          });
        }
      }
    } catch {
      // Pruning failure is non-critical
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[state-history][POST] error:", error);
    return NextResponse.json({ ok: false, message: "バックアップ保存に失敗しました" }, { status: 500 });
  }
}

/**
 * PUT /api/state-history
 * Body: { id } — Restore state from a specific history snapshot.
 * Returns the full data payload for the client to apply.
 */
export async function PUT(req) {
  if (!hasSupabaseConfig) {
    return NextResponse.json({ ok: false, message: "Supabase未設定" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const snapshotId = body.id;
    if (!snapshotId) {
      return NextResponse.json({ ok: false, message: "スナップショットIDが必要です" }, { status: 400 });
    }

    const query = new URLSearchParams({
      id: `eq.${snapshotId}`,
      select: "id,saved_at,saved_by,summary,data",
      limit: "1",
    });
    const url = `${SUPABASE_URL}/rest/v1/state_history?${query.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: supabaseHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ ok: false, message: "スナップショット取得に失敗しました" }, { status: 500 });
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ ok: false, message: "スナップショットが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, snapshot: rows[0] });
  } catch (error) {
    console.error("[state-history][PUT] error:", error);
    return NextResponse.json({ ok: false, message: "復元に失敗しました" }, { status: 500 });
  }
}
