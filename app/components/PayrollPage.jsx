"use client";
import React, { useState, useMemo } from "react";
import { Badge, Card, Collapsible, Tip, statusBadgeVariant } from "@/app/components/ui";
import { fmt, payrollCycleLabel, monthFullLabel, getEmployeeHrmosNumber, EMPTY_ATTENDANCE } from "@/lib/date-utils";
import { hrmosMatchTypeLabel } from "@/lib/hrmos-matching";
import { calcPayroll, buildRates, findGradeByStdMonthly, taxYearFromPayMonth } from "@/lib/payroll-calc";

export const PayrollPage = ({
    employees, attendance, setAttendance, onConfirmPayroll, onUndoConfirm, onAttendanceChange,
    payrollMonth, payrollPayDate, payrollStatus, isAttendanceDirty,
    hrmosSettings, setHrmosSettings, onHrmosSync, onRunAutoCalc,
    syncStatus, calcStatus, monthlyChecks, monthlyProgressText, settings,
    hrmosSyncPreview, hrmosUnmatchedRecords, onApplyHrmosPreview, onClearHrmosPreview,
    onSetHrmosUnmatchedAssignment, onApplyHrmosUnmatchedAssignments,
}) => {
    const [selected, setSelected] = useState(null);
    const updateHrmos = (field, value) => setHrmosSettings((prev) => ({ ...prev, [field]: value }));
    const updateAtt = (empId, field, val) => {
        setAttendance((prev) => ({ ...prev, [empId]: { ...prev[empId], [field]: parseFloat(val) || 0 } }));
        onAttendanceChange();
    };
    // 確定を取り消す前に確認ダイアログ（③ 確定月ロック）
    const handleUndoConfirm = () => {
        if (!window.confirm(`${monthFullLabel(payrollMonth)} の確定を取り消しますか？\n取り消すと再計算が必要になります。`)) return;
        onUndoConfirm();
    };
    const rates = buildRates(settings);
    const txYear = taxYearFromPayMonth(payrollMonth);
    const results = useMemo(
        () => employees.filter((e) => e.status === "在籍").map((emp) => ({
            emp, att: attendance[emp.id] || EMPTY_ATTENDANCE,
            result: calcPayroll(emp, attendance[emp.id] || EMPTY_ATTENDANCE, settings, { taxYear: txYear }),
        })),
        [attendance, employees, settings, txYear]
    );
    const hasCriticalChecks = monthlyChecks.critical.length > 0;
    const titleStatus = isAttendanceDirty ? "計算中" : payrollStatus;
    const activeEmployees = employees.filter((e) => e.status === "在籍");

    const exportCsv = () => {
        const headers = [
            "社員番号", "氏名", "基本給", "職務手当", "通勤手当",
            "法定外残業h", "所定外残業h", "深夜残業h", "休日労働h",
            "残業手当計", "基本給調整", "残業手当調整", "その他手当",
            "総支給額", "健康保険", "介護保険", "厚生年金", "雇用保険",
            "社会保険計", "所得税", "住民税", "控除計", "差引支給額",
            "会社負担健保", "会社負担介護", "会社負担厚年", "会社負担子育て", "会社負担雇保", "会社負担計"
        ];
        const rows = results.map(({ emp, att, result: r }) => [
            emp.id, emp.name, emp.basicPay, emp.dutyAllowance, emp.commuteAllow,
            att.legalOT || 0, att.prescribedOT || 0, att.nightOT || 0, att.holidayOT || 0,
            r.otLegal + r.otPrescribed + r.otNight + r.otHoliday + r.fixedOvertimePay + r.excessOvertimePay,
            att.basicPayAdjust || 0, att.otAdjust || 0, att.otherAllowance || 0,
            r.gross, r.health, r.kaigo, r.pension, r.employment,
            r.socialTotal, r.incomeTax, r.residentTax, r.totalDeduct, r.netPay,
            r.erHealth, r.erKaigo, r.erPension, r.erChildCare, r.erEmployment, r.erTotal
        ]);
        const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
        // UTF-8 BOM付きで文字化け防止
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `給与一覧_${payrollMonth}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <h1 className="page-title">月次給与計算</h1>
                        <Badge variant={statusBadgeVariant(titleStatus)}>{titleStatus}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{payrollCycleLabel(payrollMonth, payrollPayDate)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {(hasCriticalChecks || monthlyChecks.warning.length > 0) && (
                        <span style={{ fontSize: 11, color: hasCriticalChecks ? "var(--danger)" : "var(--warning)" }}>
                            ⚠ 確認事項があります（重大{monthlyChecks.critical.length} / 注意{monthlyChecks.warning.length}）
                        </span>
                    )}
                    {payrollStatus === "確定" && !isAttendanceDirty && (
                        <button className="btn btn-secondary btn-sm" onClick={handleUndoConfirm}>確定を取り消す</button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={exportCsv}>CSV出力 (会社控え)</button>
                    <span title={hasCriticalChecks ? `重大チェック ${monthlyChecks.critical.length} 件を解消してから確定してください` : ""}>
                        <button
                            className={`btn ${isAttendanceDirty ? "btn-warning" : "btn-primary"}`}
                            onClick={() => onConfirmPayroll(results)}
                            disabled={(payrollStatus === "確定" && !isAttendanceDirty) || hasCriticalChecks}
                            style={hasCriticalChecks ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                        >
                            {isAttendanceDirty ? "再計算して確定" : payrollStatus === "確定" ? "✓ 確定済み" : "確定する"}
                        </button>
                    </span>
                </div>
            </div>

            {/* ④ 月次作業チェックリスト */}
            {payrollStatus !== "確定" && (
                <div style={{ margin: "12px 0", padding: "10px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: "#475569" }}>📋 月次作業チェックリスト</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {[
                            { step: "1", label: "HRMOS取込", done: !isAttendanceDirty && payrollStatus !== "未計算", active: payrollStatus === "未計算", desc: "「HRMOS連携」からプレビュー取込・反映" },
                            { step: "2", label: "勤怠確認", done: !isAttendanceDirty && (payrollStatus === "計算済" || payrollStatus === "確定"), active: isAttendanceDirty, desc: "詳細パネルで各人の勤怠内容を確認" },
                            { step: "3", label: "チェック解消", done: !hasCriticalChecks && (payrollStatus === "計算済" || payrollStatus === "確定"), active: hasCriticalChecks, desc: "下の「確定前チェック」で重大0件を確認" },
                            { step: "4", label: "確定", done: payrollStatus === "確定", active: !hasCriticalChecks && payrollStatus === "計算済" && !isAttendanceDirty, desc: "「確定する」ボタンをクリック" },
                            { step: "5", label: "CSV出力", done: false, active: payrollStatus === "確定", desc: "「CSV出力」で会社控えを保存" },
                        ].map(({ step, label, done, active, desc }) => (
                            <div key={step} title={desc} style={{
                                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20,
                                background: done ? "#dcfce7" : active ? "#dbeafe" : "#f1f5f9",
                                color: done ? "#166534" : active ? "#1e40af" : "#94a3b8",
                                border: `1px solid ${done ? "#bbf7d0" : active ? "#bfdbfe" : "#e2e8f0"}`,
                                fontWeight: active ? 700 : 400, cursor: "default",
                            }}>
                                <span style={{ fontSize: 14 }}>{done ? "✅" : active ? "▶" : `${step}.`}</span>
                                <span>{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Table */}
            <Card>
                <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>従業員</th>
                                <th className="right">基本給</th>
                                <th className="right">職務手当</th>
                                <th className="right"><Tip label="法定外OT">法定労働時間（1日8h/週40h）を超える残業。1.25倍で計算。</Tip></th>
                                <th className="right"><Tip label="所定外OT">会社の所定時間は超えるが法定内の残業。1.0倍で計算。</Tip></th>
                                <th className="right"><Tip label="深夜OT">22時〜翌5時の深夜残業。1.25倍で計算。</Tip></th>
                                <th className="right">残業手当計</th>
                                <th className="right"><Tip label="総支給額">基本給＋手当＋残業代の合計。税金や保険を引く前の金額。</Tip></th>
                                <th className="right"><Tip label="社保計">健康保険＋介護保険＋厚生年金＋雇用保険の合計。標準報酬月額をもとに計算。</Tip></th>
                                <th className="right"><Tip label="所得税">月額表（甲欄）で計算。扶養人数により金額が変わります。</Tip></th>
                                <th className="right"><Tip label="住民税">前年の所得に基づき市区町村が決定。毎年6月に額が変更。</Tip></th>
                                <th className="right"><Tip label="差引支給額">総支給額から控除合計を引いた手取り金額。</Tip></th>
                                <th className="right"><Tip label="会社負担">事業主負担の社保（健保・介護・厚年・子育て拠出金・雇保）の合計。</Tip></th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map(({ emp, att, result: r }) => {
                                const hasAdjustment = (att.basicPayAdjust && att.basicPayAdjust !== 0) || (att.otAdjust && att.otAdjust !== 0) || (att.otherAllowance && att.otherAllowance !== 0);
                                return (
                                    <tr key={emp.id} onClick={() => setSelected(selected === emp.id ? null : emp.id)}
                                        className={selected === emp.id ? "selected" : ""}
                                        style={{ cursor: "pointer", borderLeft: hasAdjustment ? "3px solid #f59e0b" : "3px solid transparent" }}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{emp.name}</div>
                                            <div style={{ fontSize: 10, color: "#94a3b8" }}>
                                                {emp.employmentType || (emp.isOfficer ? "役員" : "正社員")} / {emp.isOfficer ? "役員" : emp.jobType}
                                                {r.hasFixedOT && <span style={{ color: "#6366f1", marginLeft: 4 }}>固定残業{emp.fixedOvertimeHours}h</span>}
                                                {hasAdjustment && <span style={{ color: "#b45309", marginLeft: 4, fontWeight: 700 }}>⚠ 月次調整あり</span>}
                                            </div>
                                        </td>
                                        <td className="right mono">{fmt(emp.basicPay)}</td>
                                        <td className="right mono">{emp.dutyAllowance ? fmt(emp.dutyAllowance) : "-"}</td>
                                        <td className="right mono">{att.legalOT > 0 ? `${att.legalOT}h` : "-"}</td>
                                        <td className="right mono">{att.prescribedOT > 0 ? `${att.prescribedOT}h` : "-"}</td>
                                        <td className="right mono">{att.nightOT > 0 ? `${att.nightOT}h` : "-"}</td>
                                        <td className="right mono" style={{ fontWeight: 600, color: (r.fixedOvertimePay + r.excessOvertimePay + r.otLegal + r.otPrescribed + r.otNight + r.otHoliday) > 0 ? "#b45309" : "#cbd5e1" }}>
                                            {fmt(r.fixedOvertimePay + r.excessOvertimePay + r.otLegal + r.otPrescribed + r.otNight + r.otHoliday)}
                                        </td>
                                        <td className="right mono" style={{ fontWeight: 700 }}>{fmt(r.gross)}</td>
                                        <td className="right mono deduction">{fmt(r.socialTotal)}</td>
                                        <td className="right mono deduction">{fmt(r.incomeTax)}</td>
                                        <td className="right mono deduction">{fmt(r.residentTax)}</td>
                                        <td className="right mono net-pay">{fmt(r.netPay)}</td>
                                        <td className="right mono" style={{ color: "#6366f1" }}>{fmt(r.erTotal)}</td>
                                    </tr>
                                );
                            })}
                            <tr className="totals-row">
                                <td>合計</td>
                                <td colSpan={6}></td>
                                <td className="right mono" style={{ fontWeight: 700 }}>{fmt(results.reduce((s, r) => s + r.result.gross, 0))}</td>
                                <td className="right mono deduction">{fmt(results.reduce((s, r) => s + r.result.socialTotal, 0))}</td>
                                <td className="right mono deduction">{fmt(results.reduce((s, r) => s + r.result.incomeTax, 0))}</td>
                                <td className="right mono deduction">{fmt(results.reduce((s, r) => s + r.result.residentTax, 0))}</td>
                                <td className="right mono net-pay" style={{ fontSize: 14 }}>{fmt(results.reduce((s, r) => s + r.result.netPay, 0))}</td>
                                <td className="right mono" style={{ color: "#6366f1", fontWeight: 700 }}>{fmt(results.reduce((s, r) => s + r.result.erTotal, 0))}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Detail Panel */}
            {selected && (() => {
                const selectedRow = results.find((x) => x.emp.id === selected);
                if (!selectedRow) return null;
                const { emp, att, result: r } = selectedRow;
                // eslint-disable-next-line no-unused-vars
                const otCalcTotal = r.fixedOvertimePay + r.excessOvertimePay + r.otLegal + r.otPrescribed + r.otNight + r.otHoliday;
                return (
                    <div className="detail-panel">
                        {/* 勤怠詳細 + 月次調整 */}
                        <Card title={`${emp.name} 勤怠・調整`}>
                            <div className="section-divider">勤怠情報</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}>
                                <div className="detail-row">
                                    <span className="label">出勤日数</span>
                                    <span className="value">
                                        <input type="number" step="1" className="inline-input" style={{ width: 60 }}
                                            value={att.workDays} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "workDays", e.target.value)} />
                                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>日</span>
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">所定労働日数</span>
                                    <span className="value">
                                        <input type="number" step="1" className="inline-input" style={{ width: 60 }}
                                            value={att.scheduledDays} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "scheduledDays", e.target.value)} />
                                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>日</span>
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">出勤時間</span>
                                    <span className="value">
                                        <input type="number" step="0.5" className="inline-input" style={{ width: 60 }}
                                            value={att.workHours} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "workHours", e.target.value)} />
                                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>h</span>
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">所定労働時間</span>
                                    <span className="value">
                                        <input type="number" step="0.5" className="inline-input" style={{ width: 60 }}
                                            value={att.scheduledHours} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "scheduledHours", e.target.value)} />
                                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>h</span>
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13, marginTop: 8 }}>
                                <div className="detail-row">
                                    <span className="label">法定外残業</span>
                                    <span className="value">
                                        <input type="number" step="0.5" className="inline-input" style={{ width: 60 }}
                                            value={att.legalOT} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "legalOT", e.target.value)} />
                                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>h</span>
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">所定外残業</span>
                                    <span className="value">
                                        <input type="number" step="0.5" className="inline-input" style={{ width: 60 }}
                                            value={att.prescribedOT} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "prescribedOT", e.target.value)} />
                                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>h</span>
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">深夜残業</span>
                                    <span className="value">
                                        <input type="number" step="0.5" className="inline-input" style={{ width: 60 }}
                                            value={att.nightOT} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "nightOT", e.target.value)} />
                                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>h</span>
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">休日労働</span>
                                    <span className="value">
                                        <input type="number" step="0.5" className="inline-input" style={{ width: 60 }}
                                            value={att.holidayOT} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "holidayOT", e.target.value)} />
                                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>h</span>
                                    </span>
                                </div>
                            </div>

                            <div className="section-divider" style={{ marginTop: 16 }}>月次調整（この月のみ）</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, fontSize: 13 }}>
                                <div className="detail-row">
                                    <span className="label">基本給調整</span>
                                    <span className="value">
                                        <input type="number" step="1000" className="inline-input" style={{ width: 100 }}
                                            value={att.basicPayAdjust || 0} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "basicPayAdjust", e.target.value)} />
                                        <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>円</span>
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">残業手当調整</span>
                                    <span className="value">
                                        <input type="number" step="1000" className="inline-input" style={{ width: 100 }}
                                            value={att.otAdjust || 0} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "otAdjust", e.target.value)} />
                                        <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>円</span>
                                    </span>
                                </div>
                                <div className="detail-row">
                                    <span className="label">その他手当</span>
                                    <span className="value">
                                        <input type="number" step="1000" className="inline-input" style={{ width: 100 }}
                                            value={att.otherAllowance || 0} onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateAtt(emp.id, "otherAllowance", e.target.value)} />
                                        <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>円</span>
                                    </span>
                                </div>
                            </div>
                            {(r.basicPayAdj !== 0 || r.otAdjust !== 0 || r.otherAllowance !== 0) && (
                                <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 8 }}>
                                    * 月次調整が適用されています
                                </div>
                            )}
                        </Card>

                        <Card title={`${emp.name} 支給内訳`}>
                            {[
                                ["基本給", emp.basicPay],
                                ...(r.basicPayAdj !== 0 ? [["基本給調整", r.basicPayAdj]] : []),
                                ["職務手当", emp.dutyAllowance],
                                ["通勤手当", emp.commuteAllow],
                                ...(r.hasFixedOT ? [
                                    [`固定残業代（${emp.fixedOvertimeHours}h分）`, r.fixedOvertimePay],
                                    ...(r.excessOvertimePay > 0 ? [[`超過残業手当（${Math.max(0, (att.legalOT || 0) + (att.prescribedOT || 0) - emp.fixedOvertimeHours).toFixed(1)}h×1.25）`, r.excessOvertimePay]] : []),
                                ] : [
                                    [`残業手当（${att.legalOT}h×1.25）`, r.otLegal],
                                    [`法定内残業（${att.prescribedOT}h×1.00）`, r.otPrescribed],
                                ]),
                                [`深夜残業（${att.nightOT}h×1.25）`, r.otNight],
                                [`休日労働（${att.holidayOT}h×1.35）`, r.otHoliday],
                                ...(r.otAdjust !== 0 ? [["残業手当調整", r.otAdjust]] : []),
                                ...(r.otherAllowance !== 0 ? [["その他手当", r.otherAllowance]] : []),
                            ].map(([label, val], i) => (
                                <div className="detail-row" key={i}>
                                    <span className="label">{label}</span>
                                    <span className="value positive">{val > 0 ? `¥${fmt(val)}` : val < 0 ? `-¥${fmt(Math.abs(val))}` : "¥0"}</span>
                                </div>
                            ))}
                            <div className="detail-total success">
                                <span>総支給額</span>
                                <span className="value">¥{fmt(r.gross)}</span>
                            </div>
                            <div className="detail-calc">
                                時間単価 = {fmt(emp.basicPay + emp.dutyAllowance)} / {emp.avgMonthlyHours} = {r.hourly.toFixed(4)}円
                            </div>
                            {r.hasFixedOT && (
                                <div style={{ fontSize: 11, color: "#6366f1", marginTop: 6, padding: "6px 8px", background: "#eef2ff", borderRadius: 6 }}>
                                    固定残業制: {emp.fixedOvertimeHours}h分 = ¥{fmt(emp.fixedOvertimePay)}（定額）
                                    {(att.legalOT || 0) + (att.prescribedOT || 0) > emp.fixedOvertimeHours
                                        ? ` / 実残業 ${((att.legalOT || 0) + (att.prescribedOT || 0)).toFixed(1)}h → 超過 ${((att.legalOT || 0) + (att.prescribedOT || 0) - emp.fixedOvertimeHours).toFixed(1)}h分を追加支給`
                                        : ` / 実残業 ${((att.legalOT || 0) + (att.prescribedOT || 0)).toFixed(1)}h（固定時間内）`}
                                </div>
                            )}
                        </Card>
                        <Card title={`${emp.name} 控除内訳`}>
                            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                                標準報酬月額: ¥{fmt(emp.stdMonthly)}
                                {findGradeByStdMonthly(emp.stdMonthly) ? `（${findGradeByStdMonthly(emp.stdMonthly).grade}等級）` : emp.stdMonthly > 0 ? "（※等級表外）" : ""}
                            </div>
                            {[
                                [`健康保険（${fmt(emp.stdMonthly)}×${rates.health * 100}%）`, r.health],
                                [`介護保険（${emp.hasKaigo ? fmt(emp.stdMonthly) + "×" + (rates.kaigo * 100) + "%" : "対象外"})`, r.kaigo],
                                [`厚生年金（${emp.hasPension ? fmt(emp.stdMonthly) + "×" + (rates.pension * 100) + "%" : "対象外"})`, r.pension],
                                [`雇用保険（${emp.hasEmployment ? fmt(r.gross) + "×" + (rates.employment * 100) + "%" : "対象外"})`, r.employment],
                                [`所得税（${emp.incomeTaxOverride != null ? "固定上書き" : `月額表・甲欄 / 扶養${emp.dependents ?? 0}人`}）`, r.incomeTax],
                                ["住民税（特別徴収）", r.residentTax],
                            ].map(([label, val], i) => (
                                <div className="detail-row" key={i}>
                                    <span className="label">{label}</span>
                                    <span className={`value${val > 0 ? " deduction" : ""}`}>{val > 0 ? `-¥${fmt(val)}` : "¥0"}</span>
                                </div>
                            ))}
                            <div className="detail-total danger">
                                <span>控除合計</span>
                                <span className="value">-¥{fmt(r.totalDeduct)}</span>
                            </div>
                            <div className="detail-total accent">
                                <span>差引支給額</span>
                                <span className="value">¥{fmt(r.netPay)}</span>
                            </div>
                        </Card>
                        <Card title={`${emp.name} 事業主負担内訳`}>
                            {[
                                [`健康保険（${fmt(emp.stdMonthly)}×${rates.healthEr * 100}%）`, r.erHealth],
                                [`介護保険（${emp.hasKaigo ? fmt(emp.stdMonthly) + "×" + (rates.kaigoEr * 100) + "%" : "対象外"})`, r.erKaigo],
                                [`厚生年金（${emp.hasPension ? fmt(emp.stdMonthly) + "×" + (rates.pensionEr * 100) + "%" : "対象外"})`, r.erPension],
                                [`子育て拠出金（${fmt(emp.stdMonthly)}×${rates.childCare * 100}%）`, r.erChildCare],
                                [`雇用保険（${emp.hasEmployment ? fmt(r.gross) + "×" + (rates.employment * 100) + "%" : "対象外"})`, r.erEmployment],
                            ].map(([label, val], i) => (
                                <div className="detail-row" key={i}>
                                    <span className="label">{label}</span>
                                    <span className="value" style={{ color: "#6366f1" }}>{val > 0 ? `¥${fmt(val)}` : "¥0"}</span>
                                </div>
                            ))}
                            <div className="detail-total" style={{ background: "#eef2ff", color: "#6366f1" }}>
                                <span>事業主負担合計</span>
                                <span className="value">¥{fmt(r.erTotal)}</span>
                            </div>
                            <div className="detail-total" style={{ background: "#f0f9ff", color: "#0369a1" }}>
                                <span>会社総コスト（総支給+事業主負担）</span>
                                <span className="value">¥{fmt(r.companyCost)}</span>
                            </div>
                        </Card>
                    </div>
                );
            })()}

            {/* Checks */}
            <div style={{ marginTop: 16 }}>
                <Collapsible title={`確定前チェック（重大 ${monthlyChecks.critical.length} / 注意 ${monthlyChecks.warning.length}）`}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div className={`alert-box ${monthlyChecks.critical.length > 0 ? "critical" : "success"}`}>
                            <div className="alert-box-title">重大チェック（{monthlyChecks.critical.length}件）</div>
                            {monthlyChecks.critical.length === 0
                                ? <div>問題ありません</div>
                                : <ul>{monthlyChecks.critical.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
                            }
                        </div>
                        <div className={`alert-box ${monthlyChecks.warning.length > 0 ? "warning" : "success"}`}>
                            <div className="alert-box-title">注意チェック（{monthlyChecks.warning.length}件）</div>
                            {monthlyChecks.warning.length === 0
                                ? <div>問題ありません</div>
                                : <ul>{monthlyChecks.warning.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
                            }
                        </div>
                    </div>
                </Collapsible>
            </div>

            {/* HRMOS */}
            <div style={{ marginTop: 12 }}>
                <Collapsible title="HRMOS連携・自動計算">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                        <label className="form-label">
                            Base URL
                            <input value={hrmosSettings.baseUrl} onChange={(e) => updateHrmos("baseUrl", e.target.value)} placeholder="https://ieyasu.co" disabled style={{ backgroundColor: "#f1f5f9" }} />
                        </label>
                        <label className="form-label">
                            Company URL
                            <input value={hrmosSettings.companyUrl} onChange={(e) => updateHrmos("companyUrl", e.target.value)} placeholder="your_company" />
                        </label>
                        <label className="form-label">
                            API Key (Secret Key)
                            <input type="password" value={hrmosSettings.apiKey} onChange={(e) => updateHrmos("apiKey", e.target.value)} placeholder="HRMOS管理画面から取得" autoComplete="off" />
                        </label>
                        <label className="form-label">
                            Client ID
                            <input value={hrmosSettings.clientId} onChange={(e) => updateHrmos("clientId", e.target.value)} placeholder="client_id (任意)" />
                        </label>
                        <div style={{ display: "flex", gap: 12, alignItems: "end" }}>
                            <label className="checkbox-label">
                                <input type="checkbox" checked={hrmosSettings.autoSyncEnabled} onChange={(e) => updateHrmos("autoSyncEnabled", e.target.checked)} />
                                自動同期
                            </label>
                            <label className="checkbox-label">
                                <input type="checkbox" checked={hrmosSettings.autoCalcEnabled} onChange={(e) => updateHrmos("autoCalcEnabled", e.target.checked)} />
                                自動計算
                            </label>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button className="btn btn-success btn-sm" onClick={onHrmosSync}>HRMOSから勤怠取込（プレビュー）</button>
                        <button className="btn btn-primary btn-sm" onClick={onRunAutoCalc} disabled={(hrmosUnmatchedRecords || []).length > 0}>月次自動計算を実行</button>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>同期: {syncStatus || "-"} / 計算: {calcStatus || "-"}</span>
                    </div>

                    {hrmosSyncPreview && (
                        <div style={{ marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, background: "#f8fafc" }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>取込プレビュー（{monthFullLabel(hrmosSyncPreview.month)}）</div>
                            <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                                取得 {hrmosSyncPreview.recordCount}件 / 自動反映 {hrmosSyncPreview.autoApplicableCount}件 / 手動確認 {hrmosSyncPreview.manualReviewCount}件
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                                <button className="btn btn-primary btn-sm" onClick={onApplyHrmosPreview}>この内容を反映</button>
                                <button className="btn btn-outline btn-sm" onClick={onClearHrmosPreview}>プレビュー破棄</button>
                            </div>
                            <div style={{ marginTop: 8, padding: "6px 10px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, fontSize: 11, color: "#92400e" }}>
                                ⚠️ 反映すると「基本給調整」「残業手当調整」「その他手当」は <strong>0にリセット</strong> されます。連携後に必要な場合は手動で再入力してください。
                            </div>
                            <div style={{ marginTop: 8, maxHeight: 220, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
                                <table className="data-table" style={{ minWidth: 680 }}>
                                    <thead>
                                        <tr>
                                            <th>HRMOS連携ID</th>
                                            <th>氏名</th>
                                            <th>判定</th>
                                            <th>紐付け先</th>
                                            <th>理由</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {hrmosSyncPreview.rows.map((row) => (
                                            <tr key={row.recordKey}>
                                                <td className="mono">{row.hrmosEmployeeId || "-"}</td>
                                                <td>{row.hrmosEmployeeName || "-"}</td>
                                                <td>{hrmosMatchTypeLabel(row.matchType)}</td>
                                                <td>{row.matchedEmployeeName || "-"}</td>
                                                <td style={{ color: "var(--muted)", fontSize: 11 }}>{row.matchReason || "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {(hrmosUnmatchedRecords || []).length > 0 && (
                        <div style={{ marginTop: 12, border: "1px solid #fecaca", borderRadius: 10, padding: 10, background: "#fff7ed" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>未紐付けキュー（{hrmosUnmatchedRecords.length}件）</div>
                            <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
                                未紐付けが残っている間は自動計算をブロックします。紐付け先を選んで反映してください。
                            </div>
                            <div style={{ marginTop: 8, maxHeight: 260, overflow: "auto", border: "1px solid #fdba74", borderRadius: 8, background: "#fff" }}>
                                <table className="data-table" style={{ minWidth: 720 }}>
                                    <thead>
                                        <tr>
                                            <th>HRMOS連携ID</th>
                                            <th>氏名</th>
                                            <th>理由</th>
                                            <th>割当先</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {hrmosUnmatchedRecords.map((row) => (
                                            <tr key={row.recordKey}>
                                                <td className="mono">{row.hrmosEmployeeId || "-"}</td>
                                                <td>{row.hrmosEmployeeName || "-"}</td>
                                                <td style={{ color: "var(--muted)", fontSize: 11 }}>{row.reason || "-"}</td>
                                                <td>
                                                    <select value={row.assignedEmployeeId || ""} onChange={(e) => onSetHrmosUnmatchedAssignment(row.recordKey, e.target.value)}>
                                                        <option value="">-- 在籍者を選択 --</option>
                                                        {activeEmployees.map((emp) => (
                                                            <option key={emp.id} value={emp.id}>
                                                                {emp.name}（{getEmployeeHrmosNumber(emp) || "連携ID未設定"}）
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ marginTop: 8 }}>
                                <button className="btn btn-warning btn-sm" onClick={onApplyHrmosUnmatchedAssignments}>選択した割当を反映</button>
                            </div>
                        </div>
                    )}
                </Collapsible>
            </div>

            <div style={{ marginTop: 16 }}>
                <Collapsible title="給与確定と進捗（管理者用）">
                    <div style={{ fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {monthlyProgressText}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        ※ 給与確定を行うと「計算中」から「確定」に変わります。確定後は自動同期が行われなくなります。<br />
                        ※ 確定情報が古い場合は「確定を取り消す」ことで再度計算が可能になります。
                    </div>
                </Collapsible>
            </div>
        </div>
    );
};
