import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

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
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, message: "保存データが不正です。" },
        { status: 400 }
      );
    }

    const state = {
      version: STATE_VERSION,
      updatedAt: new Date().toISOString(),
      data: body,
    };

    if (hasSupabaseConfig) {
      try {
        await writeStateToSupabase(state);
        // Keep a local backup file to simplify emergency recovery.
        await writeStateFile(state);
        return NextResponse.json({ ok: true, source: "supabase", updatedAt: state.updatedAt });
      } catch (error) {
        console.error("[state][PUT] supabase write error:", error);
      }
    }

    await writeStateFile(state); // fallback

    return NextResponse.json({ ok: true, source: "file", updatedAt: state.updatedAt });
  } catch {
    return NextResponse.json(
      { ok: false, message: "状態データの保存に失敗しました。" },
      { status: 500 }
    );
  }
}
