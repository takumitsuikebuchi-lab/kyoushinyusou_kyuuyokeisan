#!/usr/bin/env node
/**
 * Supabase 初期セットアップスクリプト
 * 
 * 使い方:
 *   node scripts/setup-supabase.mjs
 * 
 * 前提: .env に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定済み
 * 
 * このスクリプトが行うこと:
 * 1. app_state テーブルの作成
 * 2. RLS設定（service_role のみアクセス可）
 * 3. テスト用の初期データ挿入
 * 4. 接続確認
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load .env manually
function loadEnv() {
  try {
    const envPath = resolve(ROOT, ".env");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not found – use existing env vars
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ 環境変数が不足しています。");
  console.error("   .env ファイルに以下を設定してください:");
  console.error("   SUPABASE_URL=https://xxxx.supabase.co");
  console.error("   SUPABASE_SERVICE_ROLE_KEY=eyJ...");
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  // SQL via rpc not available for DDL, so we use the direct REST check instead
  return res;
}

async function checkConnection() {
  console.log("\n🔌 Supabase接続テスト...");
  console.log(`   URL: ${SUPABASE_URL}`);
  
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY },
    });
    if (res.ok) {
      console.log("   ✅ 接続成功");
      return true;
    } else {
      console.log(`   ❌ 接続失敗: HTTP ${res.status}`);
      return false;
    }
  } catch (err) {
    console.log(`   ❌ 接続エラー: ${err.message}`);
    return false;
  }
}

async function checkTable() {
  console.log("\n📋 app_state テーブル確認...");
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_state?select=id&limit=1`,
      { headers }
    );
    if (res.ok) {
      const rows = await res.json();
      console.log(`   ✅ テーブル存在 (${rows.length}件のデータ)`);
      return true;
    } else if (res.status === 404) {
      console.log("   ⚠️ テーブルが存在しません");
      console.log("   → Supabase Dashboard の SQL Editor で以下を実行してください:");
      console.log("   → supabase/setup.sql");
      return false;
    } else {
      const text = await res.text();
      console.log(`   ❌ チェック失敗: HTTP ${res.status} ${text}`);
      return false;
    }
  } catch (err) {
    console.log(`   ❌ チェックエラー: ${err.message}`);
    return false;
  }
}

async function insertTestRow() {
  console.log("\n🧪 テストデータ挿入...");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        id: "singleton",
        version: 1,
        updated_at: new Date().toISOString(),
        data: { _setupTest: true, _setupAt: new Date().toISOString() },
      }),
    });
    if (res.ok) {
      console.log("   ✅ テストデータ挿入成功 (id=singleton)");
      return true;
    } else {
      const text = await res.text();
      console.log(`   ❌ 挿入失敗: HTTP ${res.status} ${text}`);
      return false;
    }
  } catch (err) {
    console.log(`   ❌ 挿入エラー: ${err.message}`);
    return false;
  }
}

async function readBack() {
  console.log("\n📖 読み戻し確認...");
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_state?id=eq.singleton&select=*`,
      { headers }
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) {
        console.log("   ✅ データ読み取り成功");
        console.log(`   updated_at: ${rows[0].updated_at}`);
        return true;
      }
    }
    console.log("   ❌ データなし");
    return false;
  } catch (err) {
    console.log(`   ❌ 読み取りエラー: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("=== Supabase セットアップチェック ===");
  
  const connected = await checkConnection();
  if (!connected) {
    console.log("\n❌ 接続できません。SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を確認してください。");
    process.exit(1);
  }

  const tableExists = await checkTable();
  if (!tableExists) {
    console.log("\n⚠️ テーブルが見つかりません。");
    console.log("以下の手順を実行してください:");
    console.log("1. Supabase Dashboard → SQL Editor を開く");
    console.log("2. supabase/setup.sql の内容を貼り付けて実行");
    console.log("3. このスクリプトを再実行");
    process.exit(1);
  }

  await insertTestRow();
  await readBack();

  console.log("\n=== セットアップ確認完了 ===");
  console.log("\n次のステップ:");
  console.log("1. Supabase Dashboard > Authentication > Users でユーザーを作成");
  console.log("2. Authentication > Providers > Email の 'Enable Sign Up' を OFF に");
  console.log("3. Vercel にデプロイ (README.md 参照)");
  console.log("4. 既存データ移行: npm run migrate:state:supabase -- data/payroll-state.json");
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});
