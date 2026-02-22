"use client";
import React, { useState } from "react";
import { Collapsible } from "@/app/components/ui";

// ===== AuditLogPanel =====
export const AuditLogPanel = () => {
    const [logs, setLogs] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const loadLogs = async () => {
        try {
            const res = await fetch("/api/audit?limit=50", { cache: "no-store" });
            if (!res.ok) return;
            const data = await res.json();
            setLogs(data.logs || []);
        } catch { /* ignore */ }
        setLoaded(true);
    };
    return (
        <Collapsible title="監査ログ（サーバー側）">
            {!loaded ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn btn-secondary btn-sm" onClick={loadLogs}>ログを読み込む</button>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>Supabase接続時のみ</span>
                </div>
            ) : logs.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>監査ログはありません（Supabase未接続、またはテーブル未作成）</div>
            ) : (
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
            )}
        </Collapsible>
    );
};
