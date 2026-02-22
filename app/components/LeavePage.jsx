"use client";
import React from "react";
import { Card, Badge } from "@/app/components/ui";

// ===== LeavePage =====
export const LeavePage = ({ employees, paidLeaveBalance, setPaidLeaveBalance }) => {
    const updateLeave = (empId, field, value) => {
        setPaidLeaveBalance((prev) => prev.map((r) => r.empId === empId ? { ...r, [field]: Math.max(0, Number(value) || 0) } : r));
    };
    const activeBalance = paidLeaveBalance.filter((row) => employees.find((e) => e.id === row.empId && e.status === "在籍"));
    const totalRemaining = activeBalance.reduce((s, row) => s + row.granted + row.carry - row.used, 0);
    const lowLeaveCount = activeBalance.filter((row) => (row.granted + row.carry - row.used) <= 2).length;
    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">有給休暇管理</h1>
                <div style={{ display: "flex", gap: 8 }}>
                    <Badge variant="info">在籍{activeBalance.length}名</Badge>
                    <Badge variant="default">残日数合計 {totalRemaining.toFixed(1)}日</Badge>
                    {lowLeaveCount > 0 && <Badge variant="warning">残少 {lowLeaveCount}名</Badge>}
                </div>
            </div>
            <Card title="残日数一覧（在籍者）">
                {paidLeaveBalance.map((row) => {
                    const emp = employees.find((e) => e.id === row.empId && e.status === "在籍");
                    if (!emp) return null;
                    const remaining = row.granted + row.carry - row.used;
                    const usedRate = Math.min(100, Math.round((row.used / (row.granted + row.carry || 1)) * 100));
                    const remainColor = remaining <= 2 ? "var(--danger)" : remaining <= 5 ? "var(--warning)" : "var(--accent)";
                    return (
                        <div key={row.empId} className="leave-card">
                            <div className="leave-header">
                                <div>
                                    <div style={{ fontWeight: 700 }}>{emp.name}</div>
                                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{emp.dept} / {emp.jobType}</div>
                                </div>
                                <div style={{ fontFamily: "var(--mono)", fontWeight: 700, color: remainColor, fontSize: 18 }}>{remaining.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>日残</span></div>
                            </div>
                            <div className="leave-bar">
                                <div className="leave-bar-fill" style={{ width: `${usedRate}%`, background: usedRate > 80 ? "var(--success)" : undefined }} />
                            </div>
                            <div className="leave-edit">
                                <label className="form-label">付与<input type="number" step="0.5" min="0" value={row.granted} onChange={(e) => updateLeave(row.empId, "granted", e.target.value)} /></label>
                                <label className="form-label">繰越<input type="number" step="0.5" min="0" value={row.carry} onChange={(e) => updateLeave(row.empId, "carry", e.target.value)} /></label>
                                <label className="form-label">取得<input type="number" step="0.5" min="0" value={row.used} onChange={(e) => updateLeave(row.empId, "used", e.target.value)} /></label>
                                <div className="form-label">消化率<div style={{ fontFamily: "var(--mono)", fontSize: 13, padding: "7px 0" }}>{usedRate}%</div></div>
                            </div>
                        </div>
                    );
                })}
            </Card>
        </div>
    );
};
