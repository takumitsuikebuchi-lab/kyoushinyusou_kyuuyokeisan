"use client";
import React from "react";
import { Card } from "@/app/components/ui";
import { parsePayDay, isNextMonthPay, formatDateJP, monthFullLabel, fmt } from "@/lib/date-utils";
import { calcPayroll, taxYearFromPayMonth } from "@/lib/payroll-calc";
import { getUpcomingReminders, buildInsights } from "@/lib/page-utils";
import { EMPTY_ATTENDANCE } from "@/lib/date-utils";

export const DashboardPage = ({ employees, attendance, payrollMonth, payrollPayDate, payrollStatus, isAttendanceDirty, monthlyHistory, settings, setPage, paidLeaveBalance }) => {
    const active = employees.filter((e) => e.status === "在籍");
    const txYear = taxYearFromPayMonth(payrollMonth);
    const results = active.map((emp) => ({ emp, result: calcPayroll(emp, attendance[emp.id] || EMPTY_ATTENDANCE, settings, { taxYear: txYear }) }));
    const totalGross = results.reduce((s, r) => s + r.result.gross, 0);
    const totalNet = results.reduce((s, r) => s + r.result.netPay, 0);

    // 「次の支給日まで」: 設定の支払日（20日）を基準に、今日以降の直近支給日をカレンダーから算出
    const calcNextPayDate = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const payDay = parsePayDay(settings?.paymentDay || "翌月20日");
        const nextMonth = isNextMonthPay(settings?.paymentDay || "翌月20日");
        // 今月の支給日（翌月払い設定なら来月の20日が「今月分の支給日」）
        const thisMonthPayDate = nextMonth
            ? new Date(today.getFullYear(), today.getMonth() + 1, payDay)
            : new Date(today.getFullYear(), today.getMonth(), payDay);
        // 今日以降なら今月の支給日、過ぎていれば翌月の支給日
        if (thisMonthPayDate >= today) return thisMonthPayDate;
        return nextMonth
            ? new Date(today.getFullYear(), today.getMonth() + 2, payDay)
            : new Date(today.getFullYear(), today.getMonth() + 1, payDay);
    };
    const nextPayDate = calcNextPayDate();
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const daysUntilPay = Math.ceil((nextPayDate - today0) / 86400000);

    const sorted = [...monthlyHistory].sort((a, b) => a.month.localeCompare(b.month));
    const prevConfirmed = sorted.filter((m) => m.status === "確定").at(-1);
    const grossDiff = prevConfirmed ? totalGross - prevConfirmed.gross : 0;
    const netDiff = prevConfirmed ? totalNet - prevConfirmed.net : 0;

    const reminders = getUpcomingReminders();
    const insights = buildInsights(employees, attendance, prevConfirmed, settings, payrollMonth, paidLeaveBalance || [], results, EMPTY_ATTENDANCE);

    const effectiveStatus = isAttendanceDirty ? "計算中" : payrollStatus;
    const steps = [
        { title: "勤怠データを入力", desc: "HRMOSから取込 or 残業時間を手入力", done: effectiveStatus !== "未計算" },
        { title: "計算結果を確認", desc: "総支給額・控除額・差引支給額をチェック", done: effectiveStatus === "確定" || effectiveStatus === "計算済" },
        { title: "給与を確定", desc: "問題なければ「確定する」を押す", done: effectiveStatus === "確定" },
    ];
    const currentStepIdx = steps.findIndex((s) => !s.done);

    return (
        <div>
            <h1 className="page-title" style={{ marginBottom: 20 }}>ダッシュボード</h1>

            {/* KPI Row */}
            <div className="kpi-row" style={{ marginBottom: 16 }}>
                <div className="kpi-item">
                    <div className="kpi-item-label">次の支給日まで</div>
                    <div><span className="countdown">{daysUntilPay}</span><span className="countdown-unit">日</span></div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{formatDateJP(nextPayDate)}</div>
                </div>
                <div className="kpi-item">
                    <div className="kpi-item-label">在籍者数</div>
                    <div className="kpi-item-value">{active.length}<span style={{ fontSize: 12, fontWeight: 400, color: "#64748b" }}>名</span></div>
                </div>
                <div className="kpi-item">
                    <div className="kpi-item-label">今月の総支給額</div>
                    <div className="kpi-item-value" style={{ fontSize: 18 }}>¥{fmt(totalGross)}</div>
                    {prevConfirmed && <div style={{ fontSize: 11, marginTop: 2 }} className={grossDiff > 0 ? "diff-positive" : grossDiff < 0 ? "diff-negative" : "diff-zero"}>前月比 {grossDiff >= 0 ? "+" : ""}¥{fmt(grossDiff)}</div>}
                </div>
                <div className="kpi-item">
                    <div className="kpi-item-label">今月の差引支給額</div>
                    <div className="kpi-item-value" style={{ fontSize: 18 }}>¥{fmt(totalNet)}</div>
                    {prevConfirmed && <div style={{ fontSize: 11, marginTop: 2 }} className={netDiff > 0 ? "diff-positive" : netDiff < 0 ? "diff-negative" : "diff-zero"}>前月比 {netDiff >= 0 ? "+" : ""}¥{fmt(netDiff)}</div>}
                </div>
                <div className="kpi-item">
                    <div className="kpi-item-label">会社総コスト</div>
                    <div className="kpi-item-value" style={{ fontSize: 18, color: "#6366f1" }}>¥{fmt(results.reduce((s, r) => s + r.result.companyCost, 0))}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>総支給+事業主負担</div>
                </div>
            </div>

            {/* Steps */}
            <Card title={`${monthFullLabel(payrollMonth)} の処理ステップ`}>
                <div className="dash-steps">
                    {steps.map((s, i) => (
                        <div key={i} className={`dash-step${s.done ? " done" : i === currentStepIdx ? " current" : ""}`}>
                            <div className="dash-step-title">{s.done ? "✓ " : ""}{s.title}</div>
                            <div className="dash-step-desc">{s.desc}</div>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button className="btn btn-primary" onClick={() => setPage("payroll")}>給与計算へ進む</button>
                </div>
            </Card>

            {/* Insights */}
            <Card title="自動チェック・解説">
                {insights.map((ins, i) => (
                    <div key={i} className="insight-row">
                        <span className={`insight-icon ${ins.type}`}>{ins.type === "warn" ? "!" : ins.type === "info" ? "i" : "✓"}</span>
                        <span>{ins.text}</span>
                    </div>
                ))}
            </Card>

            {/* Reminders */}
            <Card title={`年次イベント・リマインダー（直近${reminders.length}件）`}>
                {reminders.length === 0 ? (
                    <div className="empty-state"><div className="empty-state-icon">📅</div>直近のイベントはありません</div>
                ) : reminders.map((r, i) => (
                    <div key={i} className={`reminder-item${r.urgency === "urgent" ? " reminder-urgent" : r.urgency === "soon" ? " reminder-soon" : ""}`}>
                        <span className="reminder-date">あと{r.daysUntil}日</span>
                        <div>
                            <div style={{ fontWeight: 600 }}>{r.label}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{r.desc}</div>
                        </div>
                    </div>
                ))}
            </Card>
        </div>
    );
};
