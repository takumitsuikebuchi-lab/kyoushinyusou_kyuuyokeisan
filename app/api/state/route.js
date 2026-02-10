import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "payroll-state.json");
const STATE_VERSION = 1;

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

export async function GET() {
  try {
    const state = await readStateFile();
    return NextResponse.json({
      ok: true,
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
    await writeStateFile(state);

    return NextResponse.json({ ok: true, updatedAt: state.updatedAt });
  } catch {
    return NextResponse.json(
      { ok: false, message: "状態データの保存に失敗しました。" },
      { status: 500 }
    );
  }
}
