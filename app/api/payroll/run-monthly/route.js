// ====================================================================
// このAPIは廃止されました（2026-02-13）
// 給与計算はフロントエンド page.jsx の calcPayroll() に一本化済みです。
// このファイルは後方互換性のために残しています。
// 直接呼び出された場合はエラーを返します。
// ====================================================================
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "このAPIは廃止されました。給与計算はフロントエンドの calcPayroll() をご利用ください。",
    },
    { status: 410 }
  );
}
