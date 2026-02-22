"use client";
import React, { useState } from "react";
import { Collapsible } from "@/app/components/ui";

// ===== BackupPanel =====
export const BackupPanel = ({ userEmail, onRestore, stateForBackup }) => {
    const [history, setHistory] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [status, setStatus] = useState("");

    const loadHistory = async () => {
        try {
            const res = await fetch("/api/state-history?limit=20", { cache: "no-store" });
            if (!res.ok) return;
            const data = await res.json();
            setHistory(data.history || []);
        } catch { /* ignore */ }
        setLoaded(true);
    };

    const createBackup = async () => {
        setStatus("保存中...");
        try {
            const res = await fetch("/api/state-history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    data: stateForBackup,
                    savedBy: userEmail || "system",
                    summary: `手動バックアップ (${new Date().toLocaleString("ja-JP")})`,
                }),
            });
            if (!res.ok) throw new Error("failed");
            setStatus("バックアップ保存完了");
            loadHistory();
        } catch { setStatus("バックアップ保存失敗"); }
    };

    const restoreFromSnapshot = async (snapshotId) => {
        try {
            const res = await fetch("/api/state-history", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: snapshotId }),
            });
            if (!res.ok) throw new Error("failed");
            const data = await res.json();
            if (data.snapshot?.data && onRestore) {
                onRestore(data.snapshot.data);
                setStatus("復元完了");
            }
        } catch { setStatus("復元失敗"); }
    };

    return (
        <Collapsible title="バックアップ・復元">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={createBackup}>手動バックアップを作成</button>
                {!loaded && <button className="btn btn-secondary btn-sm" onClick={loadHistory}>履歴を読み込む</button>}
                {status && <span style={{ fontSize: 12, color: status.includes("失敗") ? "#dc2626" : "#16a34a" }}>{status}</span>}
            </div>
            {loaded && (history.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>バックアップ履歴はありません</div>
            ) : (
                <div style={{ maxHeight: 250, overflow: "auto" }}>
                    <table className="data-table" style={{ fontSize: 12 }}>
                        <thead>
                            <tr>
                                <th style={{ width: 160 }}>保存日時</th>
                                <th style={{ width: 140 }}>保存者</th>
                                <th>概要</th>
                                <th style={{ width: 80 }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((h) => (
                                <tr key={h.id}>
                                    <td style={{ fontSize: 11 }}>{h.saved_at ? new Date(h.saved_at).toLocaleString("ja-JP") : "-"}</td>
                                    <td style={{ fontSize: 11 }}>{h.saved_by || "-"}</td>
                                    <td style={{ fontSize: 11, color: "#64748b" }}>{h.summary || "-"}</td>
                                    <td>
                                        <button className="btn btn-warning btn-sm" style={{ fontSize: 10, padding: "3px 8px" }}
                                            onClick={() => restoreFromSnapshot(h.id)}>復元</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </Collapsible>
    );
};
