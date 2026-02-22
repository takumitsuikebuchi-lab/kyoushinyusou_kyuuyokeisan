"use client";
import React, { useState, useEffect } from "react";
import { Badge, Card, Collapsible, Tip } from "@/app/components/ui";
import { fmt, getEmployeeHrmosNumber, normalizeHrmosEmployeeNumber, fiscalYearFromDate, EMPTY_ATTENDANCE } from "@/lib/date-utils";
import { collectEmployeeSetupIssues } from "@/lib/hrmos-matching";
import { STD_MONTHLY_GRADES, findGradeByPay, findGradeByStdMonthly } from "@/lib/payroll-calc";

export const EmployeesPage = ({ employees, setEmployees, setAttendance, setPaidLeaveBalance, onGoPayroll, setChangeLogs, settings, monthlyHistory, monthlySnapshots = {} }) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const departments = settings?.departments || ["運送事業"];
    const jobTypes = settings?.jobTypes || ["トラックドライバー"];
    const defaultAvgHours = Number(settings?.avgMonthlyHoursDefault) || 173.0;
    // New hire form state
    const [newName, setNewName] = useState("");
    const [newHrmosEmployeeNumber, setNewHrmosEmployeeNumber] = useState("");
    const [newJoinDate, setNewJoinDate] = useState(todayStr);
    const [newEmploymentType, setNewEmploymentType] = useState("正社員");
    const [newDept, setNewDept] = useState(departments[0] || "");
    const [newJobType, setNewJobType] = useState(jobTypes[0] || "");
    const [newDependents, setNewDependents] = useState("0");
    const [newBasePay, setNewBasePay] = useState("210000");
    const [newDutyAllowance, setNewDutyAllowance] = useState("0");
    const [newCommuteAllow, setNewCommuteAllow] = useState("0");
    const [newStdMonthly, setNewStdMonthly] = useState("260000");
    const [newResidentTax, setNewResidentTax] = useState("0");
    const [newIncomeTaxOverride, setNewIncomeTaxOverride] = useState("");
    const [newFixedOvertimeHours, setNewFixedOvertimeHours] = useState("0");
    const [newFixedOvertimePay, setNewFixedOvertimePay] = useState("0");
    const [newHasKaigo, setNewHasKaigo] = useState(false);
    const [newHasEmployment, setNewHasEmployment] = useState(true);
    const [newHasPension, setNewHasPension] = useState(true);
    // UI state
    const [activeTab, setActiveTab] = useState("在籍者");
    const [query, setQuery] = useState("");
    const [onboardingMessage, setOnboardingMessage] = useState("");
    const [onboardingErrors, setOnboardingErrors] = useState({});
    const [showForm, setShowForm] = useState(false);
    // Edit panel: buffer-based editing with explicit save
    const [editingId, setEditingId] = useState(null);
    const [editBuf, setEditBuf] = useState(null);
    const [editDirty, setEditDirty] = useState(false);
    const [editSavedMsg, setEditSavedMsg] = useState("");
    // 住民税一括更新用 state
    const [bulkResidentTaxDraft, setBulkResidentTaxDraft] = useState({});
    const [bulkResidentTaxSaved, setBulkResidentTaxSaved] = useState(false);
    const initBulkResidentTax = () =>
        setBulkResidentTaxDraft(
            Object.fromEntries(employees.filter((e) => e.status === "在籍").map((e) => [e.id, String(e.residentTax || 0)]))
        );
    const applyBulkResidentTax = () => {
        setEmployees((prev) =>
            prev.map((e) =>
                bulkResidentTaxDraft[e.id] !== undefined
                    ? { ...e, residentTax: Number(bulkResidentTaxDraft[e.id]) || 0 }
                    : e
            )
        );
        setBulkResidentTaxSaved(true);
        setTimeout(() => setBulkResidentTaxSaved(false), 3000);
    };

    // 算定基礎届 一括算出用 state
    const [santeiDraft, setSanteiDraft] = useState({});
    const [santeiSaved, setSanteiSaved] = useState(false);
    const [santeiTargetYear, setSanteiTargetYear] = useState(String(new Date().getFullYear()));

    const calcSantei = () => {
        const draft = {};
        employees.filter(e => e.status === "在籍").forEach(emp => {
            let total = 0;
            let count = 0;
            ["04", "05", "06"].forEach(mm => {
                const yyyymm = `${santeiTargetYear}-${mm}`;
                const snap = monthlySnapshots[yyyymm];
                if (snap) {
                    const row = snap.find(r => r.empId === emp.id);
                    // 本来は支払基礎日数（17日以上）の確認が必要だが、システム上は単純な総支給平均を算出する
                    if (row && row.gross > 0) {
                        total += row.gross;
                        count++;
                    }
                }
            });
            if (count > 0) {
                const avg = Math.round(total / count);
                const grade = findGradeByPay(avg);
                // 等級表に該当すればその標準報酬月額、そうでなければ現在のまま
                draft[emp.id] = grade ? grade.stdMonthly : emp.stdMonthly;
            } else {
                draft[emp.id] = emp.stdMonthly;
            }
        });
        setSanteiDraft(draft);
    };

    const applySantei = () => {
        setEmployees(prev => prev.map(e =>
            santeiDraft[e.id] ? { ...e, stdMonthly: Number(santeiDraft[e.id]) } : e
        ));
        setSanteiSaved(true);
        setTimeout(() => setSanteiSaved(false), 3000);
    };

    const openEdit = (emp) => {
        if (editDirty && editingId !== null) {
            if (!window.confirm("未保存の変更があります。破棄しますか？")) return;
        }
        setEditingId(emp.id);
        setEditBuf({ ...emp, hrmosEmployeeNumber: getEmployeeHrmosNumber(emp) });
        setEditDirty(false);
        setEditSavedMsg("");
    };
    const closeEdit = () => {
        if (editDirty) {
            if (!window.confirm("未保存の変更があります。破棄しますか？")) return;
        }
        setEditingId(null);
        setEditBuf(null);
        setEditDirty(false);
        setEditSavedMsg("");
    };
    const updateBuf = (field, value) => {
        setEditBuf((prev) => ({ ...prev, [field]: value }));
        setEditDirty(true);
        setEditSavedMsg("");
    };
    const updateBufNum = (field, value) => {
        updateBuf(field, value === "" ? "" : Number(value));
    };
    const saveEdit = () => {
        if (!editBuf) return;
        const normalizedHrmos = normalizeHrmosEmployeeNumber(editBuf.hrmosEmployeeNumber);
        if (editBuf.status === "在籍" && !normalizedHrmos) {
            setEditSavedMsg("HRMOS連携IDを入力してください");
            return;
        }
        if (
            normalizedHrmos &&
            employees.some((e) => String(e.id) !== String(editBuf.id) && getEmployeeHrmosNumber(e) === normalizedHrmos)
        ) {
            setEditSavedMsg("HRMOS連携IDが重複しています");
            return;
        }
        const nextEmp = { ...editBuf, hrmosEmployeeNumber: normalizedHrmos };
        setEmployees((prev) => prev.map((e) => e.id === nextEmp.id ? nextEmp : e));
        setEditDirty(false);
        setEditSavedMsg("保存しました");
        if (setChangeLogs) {
            setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "更新", text: `${nextEmp.name} の情報を更新` }, ...prev].slice(0, 30));
        }
        setTimeout(() => setEditSavedMsg(""), 3000);
    };

    const employmentTemplate = (type) => {
        if (type === "役員") return { basicPay: 370000, dutyAllowance: 0, stdMonthly: 380000, residentTax: 16000, dependents: 0, hasKaigo: true, hasEmployment: false, hasPension: true, isOfficer: true, fixedOvertimeHours: 0, fixedOvertimePay: 0 };
        if (type === "嘱託") return { basicPay: 100000, dutyAllowance: 0, stdMonthly: 104000, residentTax: 0, dependents: 0, hasKaigo: false, hasEmployment: false, hasPension: false, isOfficer: false, fixedOvertimeHours: 0, fixedOvertimePay: 0 };
        return { basicPay: 210000, dutyAllowance: 10000, stdMonthly: 260000, residentTax: 13000, dependents: 0, hasKaigo: false, hasEmployment: true, hasPension: true, isOfficer: false, fixedOvertimeHours: 0, fixedOvertimePay: 0 };
    };

    useEffect(() => {
        if (newEmploymentType === "役員") { setNewHasEmployment(false); setNewHasPension(true); }
    }, [newEmploymentType]);

    const applyTemplate = () => {
        const t = employmentTemplate(newEmploymentType);
        setNewBasePay(String(t.basicPay)); setNewDutyAllowance(String(t.dutyAllowance));
        setNewStdMonthly(String(t.stdMonthly)); setNewResidentTax(String(t.residentTax));
        setNewDependents(String(t.dependents)); setNewHasKaigo(t.hasKaigo);
        setNewHasEmployment(t.hasEmployment); setNewHasPension(t.hasPension);
        setNewFixedOvertimeHours(String(t.fixedOvertimeHours || 0)); setNewFixedOvertimePay(String(t.fixedOvertimePay || 0));
        setOnboardingErrors({});
    };

    const applyTemplateToEditBuf = () => {
        if (!editBuf) return;
        const type = editBuf.employmentType || (editBuf.isOfficer ? "役員" : "正社員");
        const t = employmentTemplate(type);
        setEditBuf((prev) => ({ ...prev, ...t, employmentType: type }));
        setEditDirty(true);
        setEditSavedMsg("");
    };

    const offboardEmployee = (id) => {
        const target = employees.find((e) => String(e.id) === String(id));
        if (!target || target.status !== "在籍") return;
        if (!window.confirm(`${target.name} を退職処理しますか？`)) return;
        setEmployees((prev) =>
            prev.map((e) =>
                String(e.id) === String(id)
                    ? { ...e, status: "退職", leaveDate: e.leaveDate || todayStr, hasEmployment: false, note: `${e.note || ""}${e.note ? " / " : ""}退職処理(${todayStr})` }
                    : e
            )
        );
        if (editingId === id) { setEditingId(null); setEditBuf(null); setEditDirty(false); }
        if (setChangeLogs) setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "退職", text: `${target.name} を退職処理` }, ...prev].slice(0, 30));
    };

    const reactivateEmployee = (id) => {
        const target = employees.find((e) => String(e.id) === String(id));
        if (!target || target.status === "在籍") return;
        setEmployees((prev) =>
            prev.map((e) =>
                String(e.id) === String(id)
                    ? { ...e, status: "在籍", note: `${e.note || ""}${e.note ? " / " : ""}在籍へ戻す(${todayStr})` }
                    : e
            )
        );
        if (setChangeLogs) setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "復帰", text: `${target.name} を在籍に戻す` }, ...prev].slice(0, 30));
    };

    const validateNewHire = () => {
        const errors = {};
        const normalizedHrmosId = normalizeHrmosEmployeeNumber(newHrmosEmployeeNumber);
        if (!newName.trim()) errors.newName = "氏名は必須です";
        if (!normalizedHrmosId) errors.newHrmosEmployeeNumber = "HRMOS連携IDは必須です";
        if (normalizedHrmosId && employees.some((e) => getEmployeeHrmosNumber(e) === normalizedHrmosId)) {
            errors.newHrmosEmployeeNumber = "HRMOS連携IDが重複しています";
        }
        if (!newJoinDate) errors.newJoinDate = "入社日は必須です";
        if (!["正社員", "嘱託", "役員"].includes(newEmploymentType)) errors.newEmploymentType = "雇用区分を選択";
        if ((Number(newDependents) || 0) < 0) errors.newDependents = "0以上";
        if ((Number(newBasePay) || 0) <= 0) errors.newBasePay = "1円以上";
        if ((Number(newStdMonthly) || 0) <= 0) errors.newStdMonthly = "1円以上";
        if ((Number(newDutyAllowance) || 0) < 0) errors.newDutyAllowance = "0以上";
        if ((Number(newResidentTax) || 0) < 0) errors.newResidentTax = "0以上";
        return errors;
    };

    const addDriver = (moveToPayroll = false) => {
        const errors = validateNewHire();
        if (Object.keys(errors).length > 0) { setOnboardingErrors(errors); setOnboardingMessage("入力内容を確認してください"); return; }
        setOnboardingErrors({});
        const nextId = Math.max(0, ...employees.map((e) => typeof e.id === "number" ? e.id : 0)) + 1;
        const isOfficer = newEmploymentType === "役員";
        const newEmployee = {
            id: nextId, name: newName.trim(), joinDate: newJoinDate, joinFiscalYear: fiscalYearFromDate(newJoinDate),
            hrmosEmployeeNumber: normalizeHrmosEmployeeNumber(newHrmosEmployeeNumber),
            employmentType: newEmploymentType, dept: newDept || departments[0] || "運送事業", jobType: newJobType || jobTypes[0] || "トラックドライバー",
            basicPay: Number(newBasePay) || 0, dutyAllowance: Number(newDutyAllowance) || 0, commuteAllow: Number(newCommuteAllow) || 0, avgMonthlyHours: defaultAvgHours,
            stdMonthly: Number(newStdMonthly) || Number(newBasePay) || 0,
            fixedOvertimeHours: Number(newFixedOvertimeHours) || 0, fixedOvertimePay: Number(newFixedOvertimePay) || 0,
            hasKaigo: newHasKaigo, hasPension: isOfficer ? true : newHasPension, hasEmployment: isOfficer ? false : newHasEmployment,
            dependents: Number(newDependents) || 0, residentTax: Number(newResidentTax) || 0, isOfficer, status: "在籍", leaveDate: "",
            note: `新規追加 (${new Date().toLocaleDateString("ja-JP")})`,
            incomeTaxOverride: newIncomeTaxOverride !== "" ? Number(newIncomeTaxOverride) : null,
        };
        setEmployees((prev) => [...prev, newEmployee]);
        setAttendance((prev) => ({ ...prev, [nextId]: { ...EMPTY_ATTENDANCE } }));
        setPaidLeaveBalance((prev) => [...prev, { empId: nextId, granted: 10, used: 0, carry: 0 }]);
        setNewName(""); setNewHrmosEmployeeNumber(""); setNewJoinDate(todayStr); setNewEmploymentType("正社員"); setNewDependents("0"); setNewDept(departments[0] || ""); setNewJobType(jobTypes[0] || ""); setNewCommuteAllow("0"); setNewFixedOvertimeHours("0"); setNewFixedOvertimePay("0"); setNewIncomeTaxOverride("");
        setOnboardingMessage(`${newEmployee.name} を登録しました`);
        setShowForm(false);
        if (setChangeLogs) setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "入社", text: `${newEmployee.name} (${newEmployee.employmentType}) を登録` }, ...prev].slice(0, 30));
        if (moveToPayroll && onGoPayroll) onGoPayroll();
    };

    const removeEmployee = (id) => {
        setEmployees((prev) => prev.filter((e) => e.id !== id));
        setAttendance((prev) => { const next = { ...prev }; delete next[id]; return next; });
        setPaidLeaveBalance((prev) => prev.filter((r) => r.empId !== id));
        if (editingId === id) { setEditingId(null); setEditBuf(null); setEditDirty(false); }
    };

    const activeCount = employees.filter((e) => e.status === "在籍").length;
    const retiredCount = employees.filter((e) => e.status !== "在籍").length;
    const setupPendingCount = employees.filter((e) => collectEmployeeSetupIssues(e, employees).length > 0).length;

    const filteredEmployees = employees
        .filter((emp) => activeTab === "在籍者" ? emp.status === "在籍" : emp.status !== "在籍")
        .filter((emp) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return String(emp.name).toLowerCase().includes(q)
                || String(emp.jobType).toLowerCase().includes(q)
                || String(emp.dept).toLowerCase().includes(q)
                || String(getEmployeeHrmosNumber(emp)).toLowerCase().includes(q);
        });

    // Short note: show only last segment
    const shortNote = (note) => {
        if (!note) return null;
        const parts = note.split(" / ");
        return parts[parts.length - 1];
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">従業員一覧</h1>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <Badge variant="success">在籍 {activeCount}名</Badge>
                        {retiredCount > 0 && <Badge variant="default">退職 {retiredCount}名</Badge>}
                        {setupPendingCount > 0 && <Badge variant="warning">要設定 {setupPendingCount}名</Badge>}
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? "閉じる" : "+ 新規登録"}
                </button>
            </div>

            {/* 住民税一括更新カード — 毎年6月から翁年前に変改する */}
            <Collapsible title="🏦 住民税 一括更新（6月の通知書到着後に実行）">
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                    市区町村から届く「特別徴収税額決定通知書」の金額を構に入力して「一括適用」を押すと、全員分がまとめて更新されます。
                    <span style={{ color: "#b45309" }}>※適用は6月給与付分から有効です。</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {employees.filter((e) => e.status === "在籍").map((emp) => (
                        <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 120, fontWeight: 600, fontSize: 13 }}>{emp.name}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8", width: 80 }}>現在: ¥{fmt(emp.residentTax)}</div>
                            <input
                                type="number" min="0" step="100"
                                style={{ width: 120 }}
                                placeholder="新年度定額"
                                value={bulkResidentTaxDraft[emp.id] ?? String(emp.residentTax || 0)}
                                onFocus={() => { if (!bulkResidentTaxDraft[emp.id]) initBulkResidentTax(); }}
                                onChange={(e) => setBulkResidentTaxDraft((prev) => ({ ...prev, [emp.id]: e.target.value }))}
                            />
                            <span style={{ fontSize: 11, color: "#64748b" }}>円/月</span>
                        </div>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
                    <button className="btn btn-primary btn-sm" onClick={applyBulkResidentTax}>一括適用</button>
                    <button className="btn btn-outline btn-sm" onClick={initBulkResidentTax}>現在値をリセット</button>
                    {bulkResidentTaxSaved && <span style={{ color: "#16a34a", fontSize: 12 }}>✓ 保存しました</span>}
                </div>
            </Collapsible>

            {/* 算定基礎届 算出カード */}
            <Collapsible title="📝 算定基礎届 算出（4〜6月実績から新等級を計算）">
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                    過去の給与履歴（スナップショット）から4〜6月支給分の総支給額を平均し、新しい標準報酬月額の候補を算出します。
                    <span style={{ color: "#b45309" }}>※適用すると全員の標準報酬月額が更新されます（通常9月分から有効）。</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <select value={santeiTargetYear} onChange={(e) => setSanteiTargetYear(e.target.value)} style={{ padding: "4px 8px" }}>
                        <option value={new Date().getFullYear()}>{new Date().getFullYear()}年</option>
                        <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}年</option>
                    </select>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>年の 4〜6月支給実績で算出</span>
                    <button className="btn btn-outline btn-sm" onClick={calcSantei}>候補を計算する</button>
                </div>

                {Object.keys(santeiDraft).length > 0 && (
                    <>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {employees.filter((e) => e.status === "在籍").map((emp) => {
                                const draftVal = santeiDraft[emp.id];
                                const currentVal = emp.stdMonthly;
                                const isChanged = draftVal && draftVal !== currentVal;
                                return (
                                    <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ width: 120, fontWeight: 600, fontSize: 13 }}>{emp.name}</div>
                                        <div style={{ fontSize: 11, color: "#94a3b8", width: 90 }}>現在: ¥{fmt(currentVal)}</div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                            <span style={{ fontSize: 12 }}>新等級候補:</span>
                                            <select
                                                value={draftVal || currentVal}
                                                onChange={(e) => setSanteiDraft(prev => ({ ...prev, [emp.id]: Number(e.target.value) }))}
                                                style={{ padding: "4px", borderColor: isChanged ? "#f59e0b" : "#cbd5e1", backgroundColor: isChanged ? "#fffbeb" : "#fff" }}
                                            >
                                                {STD_MONTHLY_GRADES.map((g) => (
                                                    <option key={g.grade} value={g.stdMonthly}>{g.grade}等級 (¥{fmt(g.stdMonthly)})</option>
                                                ))}
                                            </select>
                                        </div>
                                        {isChanged && <span style={{ fontSize: 11, color: "#b45309", fontWeight: 700 }}>変更あり</span>}
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", padding: "12px", background: "#f8fafc", borderRadius: 6 }}>
                            <button className="btn btn-primary btn-sm" onClick={applySantei}>この候補で一括更新</button>
                            <button className="btn btn-outline btn-sm" onClick={() => setSanteiDraft({})}>キャンセル</button>
                            {santeiSaved && <span style={{ color: "#16a34a", fontSize: 12 }}>✓ 更新しました</span>}
                        </div>
                    </>
                )}
            </Collapsible>

            {/* Onboarding Form */}
            {showForm && (
                <Card title="新規従業員登録">
                    <div className="form-grid" style={{ marginBottom: 12 }}>
                        <label className="form-label">氏名 *<input placeholder="山田 太郎" value={newName} onChange={(e) => setNewName(e.target.value)} className={onboardingErrors.newName ? "error" : ""} />{onboardingErrors.newName && <span className="error-text">{onboardingErrors.newName}</span>}</label>
                        <label className="form-label">HRMOS連携ID *<input placeholder="例: 10023" value={newHrmosEmployeeNumber} onChange={(e) => setNewHrmosEmployeeNumber(e.target.value)} className={onboardingErrors.newHrmosEmployeeNumber ? "error" : ""} />{onboardingErrors.newHrmosEmployeeNumber && <span className="error-text">{onboardingErrors.newHrmosEmployeeNumber}</span>}</label>
                        <label className="form-label">入社日 *<input type="date" value={newJoinDate} onChange={(e) => setNewJoinDate(e.target.value)} className={onboardingErrors.newJoinDate ? "error" : ""} /></label>
                        <label className="form-label">雇用区分 *<select value={newEmploymentType} onChange={(e) => setNewEmploymentType(e.target.value)}><option value="正社員">正社員</option><option value="嘱託">嘱託</option><option value="役員">役員</option></select></label>
                        <label className="form-label">部門<select value={newDept} onChange={(e) => setNewDept(e.target.value)}>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
                        <label className="form-label">職種<select value={newJobType} onChange={(e) => setNewJobType(e.target.value)}>{jobTypes.map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
                        <label className="form-label">扶養人数<input type="number" min="0" step="1" value={newDependents} onChange={(e) => setNewDependents(e.target.value)} className={onboardingErrors.newDependents ? "error" : ""} /></label>
                        <label className="form-label">基本給（円）<input value={newBasePay} onChange={(e) => setNewBasePay(e.target.value)} className={onboardingErrors.newBasePay ? "error" : ""} /></label>
                        <label className="form-label">職務手当（円）<input value={newDutyAllowance} onChange={(e) => setNewDutyAllowance(e.target.value)} className={onboardingErrors.newDutyAllowance ? "error" : ""} /></label>
                        <label className="form-label">通勤手当（円）<input value={newCommuteAllow} onChange={(e) => setNewCommuteAllow(e.target.value)} /></label>
                        <label className="form-label">標準報酬月額
                            <select value={newStdMonthly} onChange={(e) => setNewStdMonthly(e.target.value)} className={onboardingErrors.newStdMonthly ? "error" : ""}>
                                <option value="">-- 等級を選択 --</option>
                                {STD_MONTHLY_GRADES.map((g) => (<option key={g.grade} value={String(g.stdMonthly)}>{g.grade}等級 — ¥{g.stdMonthly.toLocaleString()}{g.grade <= 32 ? "" : "（健保のみ）"}</option>))}
                            </select>
                        </label>
                        <label className="form-label">住民税（月額・円）<input value={newResidentTax} onChange={(e) => setNewResidentTax(e.target.value)} className={onboardingErrors.newResidentTax ? "error" : ""} /></label>
                        <label className="form-label"><Tip label="所得税（固定上書き）">空欄のときは月額税額表（甲欄）で自動計算します。固定額を入力すると毎月その金額を使用します。</Tip><input type="number" min="0" step="1" placeholder="空欄 = 自動計算" value={newIncomeTaxOverride} onChange={(e) => setNewIncomeTaxOverride(e.target.value)} /></label>
                    </div>
                    <div className="section-divider" style={{ marginTop: 8, marginBottom: 8 }}>固定残業（みなし残業）設定</div>
                    <div className="form-grid" style={{ marginBottom: 12 }}>
                        <label className="form-label">固定残業時間（h）<input type="number" min="0" step="1" value={newFixedOvertimeHours} onChange={(e) => setNewFixedOvertimeHours(e.target.value)} /><span style={{ fontSize: 10, color: "#94a3b8" }}>0 = 固定残業なし</span></label>
                        <label className="form-label">固定残業代（円）<input type="number" min="0" step="1000" value={newFixedOvertimePay} onChange={(e) => setNewFixedOvertimePay(e.target.value)} /><span style={{ fontSize: 10, color: "#94a3b8" }}>固定残業時間に対する定額</span></label>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                        <label className="checkbox-label"><input type="checkbox" checked={newHasKaigo} onChange={(e) => setNewHasKaigo(e.target.checked)} /> 介護保険</label>
                        <label className="checkbox-label" style={newEmploymentType === "役員" ? { opacity: 0.5 } : {}}><input type="checkbox" checked={newHasEmployment} disabled={newEmploymentType === "役員"} onChange={(e) => setNewHasEmployment(e.target.checked)} /> 雇用保険</label>
                        <label className="checkbox-label"><input type="checkbox" checked={newHasPension} onChange={(e) => setNewHasPension(e.target.checked)} /> 厚生年金</label>
                        <button className="btn btn-secondary btn-sm" onClick={applyTemplate}>{newEmploymentType}テンプレ適用</button>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-primary" onClick={() => addDriver(false)}>登録</button>
                        <button className="btn btn-success" onClick={() => addDriver(true)}>登録して給与計算へ</button>
                    </div>
                    {onboardingMessage && <div style={{ marginTop: 8, fontSize: 12, color: Object.keys(onboardingErrors).length > 0 ? "#dc2626" : "#16a34a" }}>{onboardingMessage}</div>}
                </Card>
            )}

            {/* Employee List - compact table */}
            <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    <div className="tabs" style={{ marginBottom: 0 }}>
                        {["在籍者", "退職者"].map((tab) => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={`tab-btn${activeTab === tab ? " active" : ""}`}>{tab}</button>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input placeholder="検索..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 160 }} />
                        <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>{filteredEmployees.length}件</span>
                    </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>氏名</th>
                                <th>HRMOS連携ID</th>
                                <th>区分</th>
                                <th>部門 / 職種</th>
                                <th className="right">基本給</th>
                                <th className="right">標報</th>
                                <th>保険</th>
                                <th>状態</th>
                                <th style={{ width: 140 }}>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmployees.map((emp) => {
                                const issues = collectEmployeeSetupIssues(emp, employees);
                                const isEditing = editingId === emp.id;
                                return (
                                    <React.Fragment key={emp.id}>
                                        <tr className={isEditing ? "selected" : ""} style={{ cursor: "pointer" }}
                                            onClick={() => { if (!isEditing) openEdit(emp); else closeEdit(); }}>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{emp.name}</div>
                                                {shortNote(emp.note) && <div style={{ fontSize: 10, color: "var(--warning)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortNote(emp.note)}</div>}
                                            </td>
                                            <td style={{ fontSize: 12, color: getEmployeeHrmosNumber(emp) ? "var(--text)" : "var(--warning)" }}>{getEmployeeHrmosNumber(emp) || "未設定"}</td>
                                            <td style={{ fontSize: 12 }}>{emp.employmentType || (emp.isOfficer ? "役員" : "正社員")}</td>
                                            <td style={{ fontSize: 12, color: "var(--muted)" }}>{emp.dept} / {emp.jobType}</td>
                                            <td className="right mono" style={{ fontSize: 12 }}>¥{fmt(emp.basicPay)}</td>
                                            <td className="right mono" style={{ fontSize: 12 }}>¥{fmt(emp.stdMonthly)}</td>
                                            <td style={{ fontSize: 10 }}>
                                                {emp.hasKaigo && <span style={{ color: "var(--danger)", marginRight: 4 }}>介護</span>}
                                                {emp.hasPension && <span style={{ color: "var(--accent)", marginRight: 4 }}>年金</span>}
                                                {emp.hasEmployment && <span style={{ color: "var(--success)" }}>雇保</span>}
                                            </td>
                                            <td>
                                                {issues.length > 0
                                                    ? <Badge variant="warning">{issues[0]}</Badge>
                                                    : <span className={`status-pill ${emp.status === "在籍" ? "active" : "retired"}`}>{emp.status === "在籍" ? "OK" : "退職"}</span>
                                                }
                                            </td>
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <div style={{ display: "flex", gap: 4 }}>
                                                    <button className="btn btn-sm btn-outline" onClick={() => isEditing ? closeEdit() : openEdit(emp)}>
                                                        {isEditing ? "閉じる" : "編集"}
                                                    </button>
                                                    {emp.status === "在籍"
                                                        ? <button className="btn btn-sm btn-danger" onClick={() => offboardEmployee(emp.id)}>退社</button>
                                                        : <button className="btn btn-sm btn-success" onClick={() => reactivateEmployee(emp.id)}>復帰</button>
                                                    }
                                                    <button className="btn btn-sm btn-danger" style={{ padding: "5px 6px" }} onClick={() => { if (window.confirm(`${emp.name} を削除しますか？`)) removeEmployee(emp.id); }} title="削除">✕</button>
                                                </div>
                                            </td>
                                        </tr>
                                        {isEditing && editBuf && (
                                            <tr className="edit-row-expand">
                                                <td colSpan={9} style={{ padding: 0, border: "none" }}>
                                                    <div className="inline-edit-panel">
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                                <span style={{ fontWeight: 700, fontSize: 15 }}>{editBuf.name}</span>
                                                                <span style={{ fontSize: 12, color: "var(--muted)" }}>の編集</span>
                                                                {editDirty && <Badge variant="warning">未保存</Badge>}
                                                                {editSavedMsg && <Badge variant="success">{editSavedMsg}</Badge>}
                                                            </div>
                                                            <div style={{ display: "flex", gap: 6 }}>
                                                                <button className="btn btn-sm btn-secondary" onClick={applyTemplateToEditBuf}>テンプレ適用</button>
                                                                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={!editDirty}>保存</button>
                                                                <button className="btn btn-sm btn-outline" onClick={closeEdit}>閉じる</button>
                                                            </div>
                                                        </div>
                                                        <div className="form-grid">
                                                            <label className="form-label">氏名<input value={editBuf.name} onChange={(e) => updateBuf("name", e.target.value)} /></label>
                                                            <label className="form-label">HRMOS連携ID<input value={editBuf.hrmosEmployeeNumber || ""} onChange={(e) => updateBuf("hrmosEmployeeNumber", e.target.value)} /></label>
                                                            <label className="form-label">雇用区分<select value={editBuf.employmentType || (editBuf.isOfficer ? "役員" : "正社員")} onChange={(e) => { updateBuf("employmentType", e.target.value); updateBuf("isOfficer", e.target.value === "役員"); }}><option value="正社員">正社員</option><option value="嘱託">嘱託</option><option value="役員">役員</option></select></label>
                                                            <label className="form-label">部門<select value={editBuf.dept} onChange={(e) => updateBuf("dept", e.target.value)}>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
                                                            <label className="form-label">職種<select value={editBuf.jobType} onChange={(e) => updateBuf("jobType", e.target.value)}>{jobTypes.map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
                                                            <label className="form-label">基本給（円）<input type="number" value={editBuf.basicPay} onChange={(e) => updateBufNum("basicPay", e.target.value)} /></label>
                                                            <label className="form-label">職務手当（円）<input type="number" value={editBuf.dutyAllowance} onChange={(e) => updateBufNum("dutyAllowance", e.target.value)} /></label>
                                                            <label className="form-label">通勤手当（円）<input type="number" value={editBuf.commuteAllow} onChange={(e) => updateBufNum("commuteAllow", e.target.value)} /></label>
                                                            <label className="form-label">標準報酬月額
                                                                <select value={String(editBuf.stdMonthly || "")} onChange={(e) => updateBufNum("stdMonthly", e.target.value)}>
                                                                    <option value="">-- 等級を選択 --</option>
                                                                    {STD_MONTHLY_GRADES.map((g) => (<option key={g.grade} value={String(g.stdMonthly)}>{g.grade}等級 — ¥{g.stdMonthly.toLocaleString()}{g.grade <= 32 ? "" : "（健保のみ）"}</option>))}
                                                                </select>
                                                                {editBuf.stdMonthly > 0 && !findGradeByStdMonthly(editBuf.stdMonthly) && <span style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>※ 等級表にない金額です</span>}
                                                                {editBuf.stdMonthly > 0 && findGradeByStdMonthly(editBuf.stdMonthly) && <span style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{findGradeByStdMonthly(editBuf.stdMonthly).grade}等級</span>}
                                                            </label>
                                                            <label className="form-label">住民税（月額・円）<input type="number" value={editBuf.residentTax} onChange={(e) => updateBufNum("residentTax", e.target.value)} /></label>
                                                            <label className="form-label">
                                                                <Tip label="所得税（固定上書き）">空欄のときは月額税額表（甲欄）で自動計算します。固定額を入力すると毎月その金額を使用します。</Tip>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="1"
                                                                    placeholder="空欄 = 自動計算"
                                                                    value={editBuf.incomeTaxOverride == null ? "" : editBuf.incomeTaxOverride}
                                                                    onChange={(e) => {
                                                                        const v = e.target.value;
                                                                        updateBuf("incomeTaxOverride", v === "" ? null : Number(v));
                                                                    }}
                                                                />
                                                            </label>
                                                            <label className="form-label">扶養人数<input type="number" min="0" step="1" value={editBuf.dependents} onChange={(e) => updateBufNum("dependents", e.target.value)} /></label>
                                                            <label className="form-label">月平均所定労働時間<input type="number" step="0.1" value={editBuf.avgMonthlyHours} onChange={(e) => updateBufNum("avgMonthlyHours", e.target.value)} /></label>
                                                            <label className="form-label">入社日<input type="date" value={editBuf.joinDate || ""} onChange={(e) => updateBuf("joinDate", e.target.value)} /></label>
                                                            <label className="form-label">退職日<input type="date" value={editBuf.leaveDate || ""} onChange={(e) => updateBuf("leaveDate", e.target.value)} /></label>
                                                        </div>
                                                        <div className="section-divider" style={{ marginTop: 12, marginBottom: 8 }}>固定残業（みなし残業）</div>
                                                        <div className="form-grid">
                                                            <label className="form-label">固定残業時間（h）<input type="number" min="0" step="1" value={editBuf.fixedOvertimeHours || 0} onChange={(e) => updateBufNum("fixedOvertimeHours", e.target.value)} /><span style={{ fontSize: 10, color: "#94a3b8" }}>0 = 固定残業なし</span></label>
                                                            <label className="form-label">固定残業代（円）<input type="number" min="0" step="1000" value={editBuf.fixedOvertimePay || 0} onChange={(e) => updateBufNum("fixedOvertimePay", e.target.value)} /><span style={{ fontSize: 10, color: "#94a3b8" }}>固定残業時間に対する定額</span></label>
                                                        </div>
                                                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                                                            <label className="checkbox-label"><input type="checkbox" checked={editBuf.hasKaigo} onChange={(e) => updateBuf("hasKaigo", e.target.checked)} /> 介護保険</label>
                                                            <label className="checkbox-label"><input type="checkbox" checked={editBuf.hasPension} onChange={(e) => updateBuf("hasPension", e.target.checked)} /> 厚生年金</label>
                                                            <label className="checkbox-label"><input type="checkbox" checked={editBuf.hasEmployment} disabled={editBuf.isOfficer} onChange={(e) => updateBuf("hasEmployment", e.target.checked)} /> 雇用保険</label>
                                                        </div>
                                                        <label className="form-label" style={{ marginTop: 10 }}>備考<input value={editBuf.note || ""} onChange={(e) => updateBuf("note", e.target.value)} /></label>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
