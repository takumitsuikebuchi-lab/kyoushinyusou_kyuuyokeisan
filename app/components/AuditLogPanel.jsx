"use client";
import React, { useState } from "react";
import { Collapsible } from "@/app/components/ui";

const PAGE_SIZE = 50;

// ===== AuditLogPanel =====
export const AuditLogPanel = () => {
    const [logs, setLogs] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);

    const fetchLogs = async (offset = 0, append = false) => {
        setLoading(true);
        try {
            const res = await fetch(
                `/api/audit?limit=${PAGE_SIZE}&offset=${offset}`,
                { cache: "no-store" }
            );
            if (!res.ok) return;
            const data = await res.json();
            const fetched = data.logs || [];
            setLogs((prev) => append ? [...prev, ...fetched] : fetched);
            // フェッチ件数が PAGE_SIZE と同じなら次ページがある可能性あり
            setHasMore(fetched.length >= PAGE_SIZE);
        } catch { /* ignore */ }
        setLoaded(true);
        setLoading(false);
    };

    const handleLoad = () => fetchLogs(0, false);
    const handleLoadMore = () => fetchLogs(logs.length, true);

    return (
        <Collapsible title="監査ログ（サーバー側）">
            {!loaded ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn btn-secondary btn-sm" onClick={handleLoad} disabled={loading}>
                        {loading ? "読込中…" : "ログを読み込む"}
                    </button>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>Supabase接続時のみ</span>
                </div>
            ) : logs.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>監査ログはありません（Supabase未接続、またはテーブル未作成）</div>
            ) : (
                <div>
                    <div style={{ maxHeight: 300, overflow: "auto" }}>
                        <table className="data-table" style={{ fontSize: 12 }}>
                            <thead>
                                <tr>
                                    <th style={{ width: 160 }}>日時</th>
                                    <th style={{ width: 180 }}>ユーザー</th>
                                    <th style={{ width: 100 }}>操作</th>
                                    <th>詳細</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log, i) => (
                                    <tr key={log.id || i}>
                                        <td style={{ fontSize: 11, color: "#64748b" }}>{log.ts ? new Date(log.ts).toLocaleString("ja-JP") : "-"}</td>
                                        <td style={{ fontSize: 11 }}>{log.user_email || "-"}</td>
                                        <td>{log.action || "-"}</td>
                                        <td style={{ fontSize: 11, color: "#64748b" }}>{log.detail || "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{logs.length} 件表示</span>
                        {hasMore && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleLoadMore}
                                disabled={loading}
                            >
                                {loading ? "読込中…" : "さらに読み込む"}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </Collapsible>
    );
};
