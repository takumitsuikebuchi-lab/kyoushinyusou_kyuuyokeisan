#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || "app_state";
const SUPABASE_STATE_ROW_ID = process.env.SUPABASE_STATE_ROW_ID || "singleton";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[migrate-state-to-supabase] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const inputFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.cwd(), "data", "payroll-state.json");

const raw = await fs.readFile(inputFile, "utf8");
const state = JSON.parse(raw);

if (!state || typeof state !== "object") {
  console.error("[migrate-state-to-supabase] invalid input JSON");
  process.exit(1);
}

const payload = {
  id: SUPABASE_STATE_ROW_ID,
  version: Number(state.version) || 1,
  updated_at: state.updatedAt || new Date().toISOString(),
  data: state.data ?? null,
};

const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_STATE_TABLE}`;
const response = await fetch(url, {
  method: "POST",
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const text = await response.text();
  console.error(`[migrate-state-to-supabase] failed: ${response.status} ${text}`);
  process.exit(1);
}

console.log(`[migrate-state-to-supabase] success: ${SUPABASE_STATE_TABLE}/${SUPABASE_STATE_ROW_ID}`);
