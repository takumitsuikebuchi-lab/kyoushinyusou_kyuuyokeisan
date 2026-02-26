import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "payroll-state.json");
const STATE_VERSION = 1;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || "app_state";
const SUPABASE_STATE_ROW_ID = process.env.SUPABASE_STATE_ROW_ID || "singleton";

const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const supabaseHeaders = (extra = {}) => ({
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

const readStateFile = async () => {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const writeStateFile = async (state) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpPath = `${STATE_FILE}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmpPath, STATE_FILE);
};

const readStateFromSupabase = async () => {
  const query = new URLSearchParams({
    id: `eq.${SUPABASE_STATE_ROW_ID}`,
    select: "id,version,updated_at,data",
    limit: "1",
  });
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_STATE_TABLE}?${query.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(),
    cache: "no-store",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase read failed: ${response.status} ${errorText}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  return {
    version: Number(row?.version) || STATE_VERSION,
    updatedAt: row?.updated_at || null,
    data: row?.data ?? null,
  };
};

const writeStateToSupabase = async (state) => {
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_STATE_TABLE}`;
  const payload = {
    id: SUPABASE_STATE_ROW_ID,
    version: state.version,
    updated_at: state.updatedAt,
    data: state.data,
  };
  const response = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase write failed: ${response.status} ${errorText}`);
  }
};

/**
 * Fire-and-forget audit log write to Supabase.
 */
const writeAuditLog = async (userEmail, action, detail) => {
  if (!hasSupabaseConfig) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/audit_log`;
    await fetch(url, {
      method: "POST",
      headers: supabaseHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ user_email: userEmail, action, detail }),
      cache: "no-store",
    });
  } catch {
    // Silently ignore — audit should never block operations
  }
};


export async function GET() {
  try {
    if (hasSupabaseConfig) {
      try {
        const state = await readStateFromSupabase();
        return NextResponse.json({
          ok: true,
          source: "supabase",
          version: state?.version ?? STATE_VERSION,
          updatedAt: state?.updatedAt ?? null,
          data: state?.data ?? null,
        });
      } catch (error) {
        console.error("[state][GET] supabase read error:", error);
      }
    }

    const state = await readStateFile();
    if (!state && hasSupabaseConfig) {
      // Supabase was configured but read failed above; file also empty
      return NextResponse.json({ ok: true, source: "file", version: STATE_VERSION, updatedAt: null, data: null });
    }
    return NextResponse.json({
      ok: true,
      source: "file",
      version: state?.version ?? STATE_VERSION,
      updatedAt: state?.updatedAt ?? null,
      data: state?.data ?? null,
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "状態データの読込に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    // ── D: ペイロードサイズ上限 10MB ──────────────────────────────────
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 10 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, message: "データサイズが上限（10MB）を超えています。" },
        { status: 413 }
      );
    }

    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, message: "保存データが不正です。" },
        { status: 400 }
      );
    }

    // Server-side session lookup — never trust client-provided identity
    let userEmail = null;
    try {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        userEmail = user?.email || null;
      }
    } catch { /* audit is best-effort; never block save */ }
    // クライアント送信の _expectedUpdatedAt を取り出してから body から除去
    const expectedUpdatedAt = body._expectedUpdatedAt || null;
    delete body._expectedUpdatedAt;
    delete body._userEmail; // remove client-supplied field regardless

    // ── F+J: Supabase からの現在状態読み取り（楽観的ロック + 確定済み月保護）──
    if (hasSupabaseConfig) {
      try {
        const current = await readStateFromSupabase();

        // ── F: 楽観的ロック — 別タブ競合検出 ──────────────────────────
        // クライアントが知っている updatedAt と DB の実際の updatedAt を比較
        if (expectedUpdatedAt && current?.updatedAt && expectedUpdatedAt !== current.updatedAt) {
          writeAuditLog(userEmail, "conflict",
            `並行保存競合を検出 (expected: ${expectedUpdatedAt}, actual: ${current.updatedAt})`).catch(() => {});
          return NextResponse.json(
            { ok: false, message: "別のタブでデータが更新されました。ページをリロードしてください。", conflict: true },
            { status: 409 }
          );
        }

        // ── J: 確定済み月の改竄防止 ──────────────────────────────────
        if (Array.isArray(body.monthlyHistory)) {
          const currentHistory = current?.data?.monthlyHistory || [];
          for (const confirmed of currentHistory.filter((r) => r.status === "確定")) {
            const incoming = body.monthlyHistory.find((r) => r.month === confirmed.month);
            if (incoming && (
              incoming.gross !== confirmed.gross ||
              incoming.net !== confirmed.net ||
              incoming.payDate !== confirmed.payDate
            )) {
              writeAuditLog(userEmail, "tamper_attempt",
                `確定済み月 ${confirmed.month} の改竄を検出`).catch(() => {});
              return NextResponse.json(
                { ok: false, message: `確定済み月（${confirmed.month}）のデータは変更できません。` },
                { status: 403 }
              );
            }
          }
        }
      } catch { /* 読み取り失敗時は保存をブロックしない（可用性優先） */ }
    }

    const state = {
      version: STATE_VERSION,
      updatedAt: new Date().toISOString(),
      data: body,
    };

    if (hasSupabaseConfig) {
      try {
        await writeStateToSupabase(state);
        // Keep a local backup file to simplify emergency recovery (may fail on read-only filesystems like Vercel).
        try { await writeStateFile(state); } catch { /* ignore on cloud */ }
        // Fire-and-forget: audit log
        writeAuditLog(userEmail, "save", "自動保存").catch(() => {});
        return NextResponse.json({ ok: true, source: "supabase", updatedAt: state.updatedAt });
      } catch (error) {
        console.error("[state][PUT] supabase write error:", error);
      }
    }

    // Fallback to local file (only works on writable filesystem)
    try {
      await writeStateFile(state);
    } catch (fsError) {
      console.error("[state][PUT] file write error:", fsError);
      return NextResponse.json(
        { ok: false, message: "Supabase未設定のため、クラウド環境ではデータを保存できません。Supabaseの環境変数を設定してください。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, source: "file", updatedAt: state.updatedAt });
  } catch {
    return NextResponse.json(
      { ok: false, message: "状態データの保存に失敗しました。" },
      { status: 500 }
    );
  }
}
