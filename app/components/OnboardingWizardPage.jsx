"use client";
import React, { useState, useEffect } from "react";
import { Badge, Card } from "@/app/components/ui";
import { fmt, fiscalYearFromDate, EMPTY_ATTENDANCE, normalizeHrmosEmployeeNumber, getEmployeeHrmosNumber } from "@/lib/date-utils";
import { STD_MONTHLY_GRADES } from "@/lib/payroll-calc";
import { collectEmployeeSetupIssues } from "@/lib/hrmos-matching";

// ===== ウィザードステップ定義 =====

const ONBOARDING_STEPS = [
    {
        id: "contract",
        label: "雇用契約書・労働条件通知書の準備・署名",
        kind: "external",
        note: "雇用区分（正社員/嘱託/役員）に応じた書類を準備し、本人のサインをもらいます。",
    },
    {
        id: "mynumber",
        label: "マイナンバーの収集",
        kind: "external",
        note: "社会保険・税務申告に必要です。マイナンバーカードのコピーまたは通知カード＋身分証を受領します。",
    },
    {
        id: "hrmos_register",
        label: "HRMOSに従業員を登録",
        kind: "external",
        link: "https://ieyasu.co",
        linkLabel: "HRMOSを開く",
        note: "HRMOS勤怠管理システムに新規従業員を追加し、従業員番号（HRMOS連携ID）を控えておいてください。",
    },
    {
        id: "system_register",
        label: "このシステムに従業員を登録",
        kind: "system",
        action: "register",
        note: "HRMOSで確認した従業員番号を使って、このシステムに従業員情報を登録します。",
    },
    {
        id: "shakai_hoken",
        label: "社会保険（健康保険・厚生年金）加入届の提出",
        kind: "external",
        note: "資格取得日（入社日）から5日以内に年金事務所へ提出します。被扶養者がいる場合は扶養届も一緒に。",
    },
    {
        id: "koyo_hoken",
        label: "雇用保険 資格取得届の提出",
        kind: "external",
        note: "資格取得日の属する月の翌月10日までにハローワークへ提出します。",
    },
    {
        id: "jumin_tax",
        label: "住民税の特別徴収 切替手続き（前職がある場合）",
        kind: "external",
        note: "前職の会社から「給与所得者異動届出書」を取り寄せ、当社の市区町村へ提出して特別徴収の切り替えを行います。",
    },
    {
        id: "payroll",
        label: "翌月の給与計算に含める",
        kind: "system",
        action: "go_payroll",
        note: "登録後、翌月の給与計算画面で新しい従業員が対象になっているか確認します。",
    },
];

const OFFBOARDING_STEPS = [
    {
        id: "confirm_date",
        label: "退職日・最終出勤日の確定",
        kind: "input",
        note: "本人・会社双方で合意した退職日を確認します。退職届の受理日も記録しておいてください。",
    },
    {
        id: "hrmos_offboard",
        label: "HRMOSで退職処理",
        kind: "external",
        link: "https://ieyasu.co",
        linkLabel: "HRMOSを開く",
        note: "HRMOS勤怠管理システムで対象従業員の退職日を入力し、退職処理を行います。",
    },
    {
        id: "system_offboard",
        label: "このシステムで退職処理",
        kind: "system",
        action: "offboard",
        note: "対象従業員を選んで退職処理を実行します。雇用保険が自動でOFFになります。",
    },
    {
        id: "shakai_loss",
        label: "社会保険 資格喪失届の提出",
        kind: "external",
        note: "退職日の翌日（資格喪失日）から5日以内に年金事務所へ提出します。健康保険証を回収・返却してください。",
    },
    {
        id: "koyo_loss",
        label: "雇用保険 資格喪失届の提出",
        kind: "external",
        note: "退職した日の翌々月10日までにハローワークへ提出します。離職票が必要な場合は一緒に申請します。",
    },
    {
        id: "final_payroll",
        label: "最終月の給与計算・確定",
        kind: "system",
        action: "go_payroll",
        note: "最終出勤月の給与を計算・確定します。日割り計算が必要な場合は勤怠を正しく入力してください。",
    },
    {
        id: "gensen",
        label: "源泉徴収票の発行（翌年1月まで）",
        kind: "external",
        note: "退職した年の源泉徴収票を、退職者に翌年1月31日までに交付する義務があります。マネーフォワードで発行できます。",
    },
];

// ===== ステップアイコン =====
const StepIcon = ({ done, active, kind }) => {
    if (done) {
        return (
            <div style={{
                width: 32, height: 32, borderRadius: "50%", background: "#16a34a",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
        );
    }
    const bg = active ? (kind === "system" ? "#2563eb" : "#0284c7") : "#e2e8f0";
    const fg = active ? "white" : "#94a3b8";
    return (
        <div style={{
            width: 32, height: 32, borderRadius: "50%", background: bg, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
        }}>
            {kind === "system" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
            ) : kind === "input" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
            ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            )}
        </div>
    );
};

// ===== 新規登録フォーム（入社ウィザード内インライン） =====
const InlineRegisterForm = ({ employees, settings, setEmployees, setAttendance, setPaidLeaveBalance, setChangeLogs, onDone }) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const departments = settings?.departments || ["運送事業"];
    const jobTypes = settings?.jobTypes || ["トラックドライバー"];
    const defaultAvgHours = Number(settings?.avgMonthlyHoursDefault) || 173.0;

    const [name, setName] = useState("");
    const [hrmosId, setHrmosId] = useState("");
    const [joinDate, setJoinDate] = useState(todayStr);
    const [employmentType, setEmploymentType] = useState("正社員");
    const [dept, setDept] = useState(departments[0] || "");
    const [jobType, setJobType] = useState(jobTypes[0] || "");
    const [dependents, setDependents] = useState("0");
    const [basicPay, setBasicPay] = useState("210000");
    const [dutyAllowance, setDutyAllowance] = useState("0");
    const [commuteAllow, setCommuteAllow] = useState("0");
    const [stdMonthly, setStdMonthly] = useState("260000");
    const [residentTax, setResidentTax] = useState("0");
    const [hasKaigo, setHasKaigo] = useState(false);
    const [hasPension, setHasPension] = useState(true);
    const [hasEmployment, setHasEmployment] = useState(true);
    const [errors, setErrors] = useState({});
    const [msg, setMsg] = useState("");

    const TEMPLATES = {
        "正社員": { basicPay: 210000, dutyAllowance: 10000, stdMonthly: 260000, residentTax: 13000, dependents: 0, hasKaigo: false, hasEmployment: true, hasPension: true },
        "嘱託": { basicPay: 100000, dutyAllowance: 0, stdMonthly: 104000, residentTax: 0, dependents: 0, hasKaigo: false, hasEmployment: false, hasPension: false },
        "役員": { basicPay: 370000, dutyAllowance: 0, stdMonthly: 380000, residentTax: 16000, dependents: 0, hasKaigo: true, hasEmployment: false, hasPension: true },
    };
    const applyTemplate = () => {
        const t = TEMPLATES[employmentType] || TEMPLATES["正社員"];
        setBasicPay(String(t.basicPay)); setDutyAllowance(String(t.dutyAllowance));
        setStdMonthly(String(t.stdMonthly)); setResidentTax(String(t.residentTax));
        setDependents(String(t.dependents)); setHasKaigo(t.hasKaigo);
        setHasEmployment(t.hasEmployment); setHasPension(t.hasPension);
        setErrors({});
    };

    const validate = () => {
        const errs = {};
        const nHrmos = normalizeHrmosEmployeeNumber(hrmosId);
        if (!name.trim()) errs.name = "氏名は必須です";
        if (!nHrmos) errs.hrmosId = "HRMOS連携IDは必須です";
        if (nHrmos && employees.some(e => getEmployeeHrmosNumber(e) === nHrmos)) errs.hrmosId = "HRMOS連携IDが重複しています";
        if (!joinDate) errs.joinDate = "入社日は必須です";
        if ((Number(basicPay) || 0) <= 0) errs.basicPay = "1円以上";
        if ((Number(stdMonthly) || 0) <= 0) errs.stdMonthly = "1円以上";
        return errs;
    };

    const handleRegister = () => {
        const errs = validate();
        if (Object.keys(errs).length > 0) { setErrors(errs); setMsg("入力内容を確認してください"); return; }
        setErrors({});
        const nextId = Math.max(0, ...employees.map(e => typeof e.id === "number" ? e.id : 0)) + 1;
        const isOfficer = employmentType === "役員";
        const emp = {
            id: nextId, name: name.trim(), joinDate, joinFiscalYear: fiscalYearFromDate(joinDate),
            hrmosEmployeeNumber: normalizeHrmosEmployeeNumber(hrmosId),
            employmentType, dept, jobType,
            basicPay: Number(basicPay) || 0, dutyAllowance: Number(dutyAllowance) || 0,
            commuteAllow: Number(commuteAllow) || 0, avgMonthlyHours: defaultAvgHours,
            stdMonthly: Number(stdMonthly) || 0, fixedOvertimeHours: 0, fixedOvertimePay: 0,
            hasKaigo, hasPension: isOfficer ? true : hasPension,
            hasEmployment: isOfficer ? false : hasEmployment,
            dependents: Number(dependents) || 0, residentTax: Number(residentTax) || 0,
            isOfficer, status: "在籍", leaveDate: "",
            note: `新規追加 (${new Date().toLocaleDateString("ja-JP")})`,
            incomeTaxOverride: null,
        };
        setEmployees(prev => [...prev, emp]);
        setAttendance(prev => ({ ...prev, [nextId]: { ...EMPTY_ATTENDANCE } }));
        setPaidLeaveBalance(prev => [...prev, { empId: nextId, granted: 10, used: 0, carry: 0 }]);
        if (setChangeLogs) setChangeLogs(prev => [{ at: new Date().toISOString(), type: "入社", text: `${emp.name} (${emp.employmentType}) を登録` }, ...prev].slice(0, 30));
        setMsg(`✓ ${emp.name} を登録しました`);
        onDone && onDone(emp);
    };

    return (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#1e40af" }}>従業員情報を入力</div>
            <div className="form-grid" style={{ marginBottom: 10 }}>
                <label className="form-label">氏名 *
                    <input placeholder="山田 太郎" value={name} onChange={e => setName(e.target.value)} className={errors.name ? "error" : ""} />
                    {errors.name && <span className="error-text">{errors.name}</span>}
                </label>
                <label className="form-label">HRMOS連携ID *
                    <input placeholder="例: 10023" value={hrmosId} onChange={e => setHrmosId(e.target.value)} className={errors.hrmosId ? "error" : ""} />
                    {errors.hrmosId && <span className="error-text">{errors.hrmosId}</span>}
                </label>
                <label className="form-label">入社日 *
                    <input type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} />
                </label>
                <label className="form-label">雇用区分 *
                    <select value={employmentType} onChange={e => setEmploymentType(e.target.value)}>
                        <option value="正社員">正社員</option>
                        <option value="嘱託">嘱託</option>
                        <option value="役員">役員</option>
                    </select>
                </label>
                <label className="form-label">部門
                    <select value={dept} onChange={e => setDept(e.target.value)}>
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </label>
                <label className="form-label">職種
                    <select value={jobType} onChange={e => setJobType(e.target.value)}>
                        {jobTypes.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                </label>
                <label className="form-label">扶養人数
                    <input type="number" min="0" step="1" value={dependents} onChange={e => setDependents(e.target.value)} />
                </label>
                <label className="form-label">基本給（円）
                    <input type="number" value={basicPay} onChange={e => setBasicPay(e.target.value)} className={errors.basicPay ? "error" : ""} />
                    {errors.basicPay && <span className="error-text">{errors.basicPay}</span>}
                </label>
                <label className="form-label">職務手当（円）
                    <input type="number" value={dutyAllowance} onChange={e => setDutyAllowance(e.target.value)} />
                </label>
                <label className="form-label">通勤手当（円）
                    <input type="number" value={commuteAllow} onChange={e => setCommuteAllow(e.target.value)} />
                </label>
                <label className="form-label">標準報酬月額
                    <select value={stdMonthly} onChange={e => setStdMonthly(e.target.value)} className={errors.stdMonthly ? "error" : ""}>
                        <option value="">-- 等級を選択 --</option>
                        {STD_MONTHLY_GRADES.map(g => (
                            <option key={g.grade} value={String(g.stdMonthly)}>{g.grade}等級 — ¥{g.stdMonthly.toLocaleString()}</option>
                        ))}
                    </select>
                </label>
                <label className="form-label">住民税（月額・円）
                    <input type="number" value={residentTax} onChange={e => setResidentTax(e.target.value)} />
                </label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                <label className="checkbox-label"><input type="checkbox" checked={hasKaigo} onChange={e => setHasKaigo(e.target.checked)} /> 介護保険</label>
                <label className="checkbox-label" style={employmentType === "役員" ? { opacity: 0.5 } : {}}>
                    <input type="checkbox" checked={hasEmployment} disabled={employmentType === "役員"} onChange={e => setHasEmployment(e.target.checked)} /> 雇用保険
                </label>
                <label className="checkbox-label"><input type="checkbox" checked={hasPension} onChange={e => setHasPension(e.target.checked)} /> 厚生年金</label>
                <button className="btn btn-secondary btn-sm" onClick={applyTemplate}>{employmentType}テンプレ適用</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="btn btn-primary" onClick={handleRegister}>登録する</button>
            </div>
            {msg && <div style={{ marginTop: 10, fontSize: 13, color: Object.keys(errors).length > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{msg}</div>}
        </div>
    );
};

// ===== メインコンポーネント =====
export const OnboardingWizardPage = ({
    employees, setEmployees, setAttendance, setPaidLeaveBalance, setChangeLogs,
    settings, setPage,
}) => {
    const [wizardType, setWizardType] = useState("onboarding"); // "onboarding" | "offboarding"
    const [checked, setChecked] = useState({});
    const [showRegisterForm, setShowRegisterForm] = useState(false);
    const [registeredEmployee, setRegisteredEmployee] = useState(null);
    // offboarding
    const [selectedEmpId, setSelectedEmpId] = useState("");
    const [leaveDate, setLeaveDate] = useState(new Date().toISOString().slice(0, 10));
    const [offboardDone, setOffboardDone] = useState(false);

    const activeEmployees = employees.filter(e => e.status === "在籍");
    const steps = wizardType === "onboarding" ? ONBOARDING_STEPS : OFFBOARDING_STEPS;
    const completedCount = steps.filter(s => checked[s.id]).length;
    const progress = Math.round((completedCount / steps.length) * 100);

    // タブ切替時にリセット
    const switchWizard = (type) => {
        setWizardType(type);
        setChecked({});
        setShowRegisterForm(false);
        setRegisteredEmployee(null);
        setSelectedEmpId("");
        setLeaveDate(new Date().toISOString().slice(0, 10));
        setOffboardDone(false);
    };

    const toggleCheck = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));

    const handleOffboard = () => {
        if (!selectedEmpId) return;
        const target = employees.find(e => String(e.id) === String(selectedEmpId));
        if (!target) return;
        if (!window.confirm(`${target.name} を退職処理しますか？`)) return;
        const today = new Date().toISOString().slice(0, 10);
        setEmployees(prev => prev.map(e =>
            String(e.id) === String(selectedEmpId)
                ? { ...e, status: "退職", leaveDate: leaveDate || today, hasEmployment: false, note: `${e.note || ""}${e.note ? " / " : ""}退職処理(${today})` }
                : e
        ));
        if (setChangeLogs) setChangeLogs(prev => [{ at: new Date().toISOString(), type: "退職", text: `${target.name} を退職処理（ウィザードから）` }, ...prev].slice(0, 30));
        setOffboardDone(true);
        setChecked(prev => ({ ...prev, system_offboard: true }));
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">入退社手続き</h1>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                        ステップに従って手続きを進めてください。チェックを入れると完了を記録できます。
                    </div>
                </div>
            </div>

            {/* タブ切り替え */}
            <div className="tabs" style={{ marginBottom: 20 }}>
                <button
                    className={`tab-btn${wizardType === "onboarding" ? " active" : ""}`}
                    onClick={() => switchWizard("onboarding")}
                >
                    🟢 入社手続き
                </button>
                <button
                    className={`tab-btn${wizardType === "offboarding" ? " active" : ""}`}
                    onClick={() => switchWizard("offboarding")}
                >
                    🔴 退社手続き
                </button>
            </div>

            {/* プログレスバー */}
            <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                        進捗: {completedCount} / {steps.length} ステップ完了
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: progress === 100 ? "#16a34a" : "#2563eb" }}>
                        {progress}%
                    </span>
                </div>
                <div style={{ background: "#e2e8f0", borderRadius: 999, height: 8, overflow: "hidden" }}>
                    <div style={{
                        width: `${progress}%`, height: "100%",
                        background: progress === 100 ? "#16a34a" : "linear-gradient(90deg, #2563eb, #0ea5e9)",
                        borderRadius: 999,
                        transition: "width 0.4s ease",
                    }} />
                </div>
                {progress === 100 && (
                    <div style={{ marginTop: 8, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                        🎉 すべてのステップが完了しました！
                    </div>
                )}
            </div>

            {/* ステップ一覧 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {steps.map((step, idx) => {
                    const done = Boolean(checked[step.id]);
                    const isActive = !done;

                    return (
                        <div
                            key={step.id}
                            style={{
                                display: "flex",
                                gap: 14,
                                padding: "16px 18px",
                                background: done ? "#f0fdf4" : step.kind === "system" ? "#eff6ff" : "white",
                                border: `1px solid ${done ? "#86efac" : step.kind === "system" ? "#bfdbfe" : "#e2e8f0"}`,
                                borderRadius: 10,
                                alignItems: "flex-start",
                                opacity: done ? 0.85 : 1,
                                transition: "all 0.2s",
                            }}
                        >
                            {/* Left: step number + icon */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>STEP {idx + 1}</div>
                                <StepIcon done={done} active={isActive} kind={step.kind} />
                            </div>

                            {/* Right: content */}
                            <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: done ? "#15803d" : "#1e293b", textDecoration: done ? "line-through" : "none" }}>
                                        {step.label}
                                        {step.kind === "system" && <Badge variant="default" style={{ marginLeft: 8, fontSize: 10 }}>システム操作</Badge>}
                                    </div>
                                    {/* チェックボックス（入力欄・システム操作は自動チェックなのでシステム以外に表示） */}
                                    {step.kind !== "system" && step.kind !== "input" && (
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0 }}>
                                            <input
                                                type="checkbox"
                                                checked={done}
                                                onChange={() => toggleCheck(step.id)}
                                                style={{ width: 18, height: 18, cursor: "pointer" }}
                                            />
                                            <span style={{ fontSize: 12, color: "#64748b" }}>完了</span>
                                        </label>
                                    )}
                                </div>

                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, lineHeight: 1.6 }}>
                                    {step.note}
                                </div>

                                {/* 外部リンク */}
                                {step.link && (
                                    <div style={{ marginTop: 8 }}>
                                        <a href={step.link} target="_blank" rel="noopener noreferrer"
                                            style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                                <polyline points="15 3 21 3 21 9" />
                                                <line x1="10" y1="14" x2="21" y2="3" />
                                            </svg>
                                            {step.linkLabel}
                                        </a>
                                    </div>
                                )}

                                {/* 入社ウィザード: システム登録ステップ */}
                                {step.action === "register" && (
                                    <div style={{ marginTop: 10 }}>
                                        {registeredEmployee ? (
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <Badge variant="success">✓ {registeredEmployee.name} を登録済み</Badge>
                                                <button className="btn btn-outline btn-sm" onClick={() => { setRegisteredEmployee(null); setShowRegisterForm(true); setChecked(prev => ({ ...prev, [step.id]: false })); }}>
                                                    やり直す
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    className={`btn btn-sm ${showRegisterForm ? "btn-outline" : "btn-primary"}`}
                                                    onClick={() => setShowRegisterForm(!showRegisterForm)}
                                                >
                                                    {showRegisterForm ? "フォームを閉じる" : "登録フォームを開く"}
                                                </button>
                                                {showRegisterForm && (
                                                    <InlineRegisterForm
                                                        employees={employees}
                                                        settings={settings}
                                                        setEmployees={setEmployees}
                                                        setAttendance={setAttendance}
                                                        setPaidLeaveBalance={setPaidLeaveBalance}
                                                        setChangeLogs={setChangeLogs}
                                                        onDone={(emp) => {
                                                            setRegisteredEmployee(emp);
                                                            setShowRegisterForm(false);
                                                            setChecked(prev => ({ ...prev, [step.id]: true }));
                                                        }}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* 退職日入力ステップ */}
                                {step.action === undefined && step.kind === "input" && (
                                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                        <label style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                            退職日:
                                            <input
                                                type="date"
                                                value={leaveDate}
                                                onChange={e => { setLeaveDate(e.target.value); }}
                                                style={{ padding: "4px 8px" }}
                                            />
                                        </label>
                                        <button
                                            className="btn btn-sm btn-outline"
                                            onClick={() => setChecked(prev => ({ ...prev, [step.id]: true }))}
                                        >
                                            確定
                                        </button>
                                        {done && <Badge variant="success">✓ 退職日: {leaveDate}</Badge>}
                                    </div>
                                )}

                                {/* 退職処理ステップ */}
                                {step.action === "offboard" && (
                                    <div style={{ marginTop: 10 }}>
                                        {offboardDone ? (
                                            <Badge variant="success">✓ 退職処理完了</Badge>
                                        ) : (
                                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                                <select
                                                    value={selectedEmpId}
                                                    onChange={e => setSelectedEmpId(e.target.value)}
                                                    style={{ padding: "6px 10px", minWidth: 160 }}
                                                >
                                                    <option value="">対象者を選択...</option>
                                                    {activeEmployees.map(e => (
                                                        <option key={e.id} value={e.id}>{e.name} ({e.employmentType || "正社員"})</option>
                                                    ))}
                                                </select>
                                                <button
                                                    className="btn btn-sm btn-danger"
                                                    onClick={handleOffboard}
                                                    disabled={!selectedEmpId}
                                                >
                                                    退職処理を実行
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 給与計算ページへ */}
                                {step.action === "go_payroll" && (
                                    <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={() => {
                                                setChecked(prev => ({ ...prev, [step.id]: true }));
                                                setPage && setPage("payroll");
                                            }}
                                        >
                                            給与計算ページへ →
                                        </button>
                                        {done && <Badge variant="success">✓ 完了</Badge>}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* リセットボタン */}
            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                        if (!window.confirm("チェック状態をリセットしますか？")) return;
                        setChecked({});
                        setShowRegisterForm(false);
                        setRegisteredEmployee(null);
                        setSelectedEmpId("");
                        setLeaveDate(new Date().toISOString().slice(0, 10));
                        setOffboardDone(false);
                    }}
                >
                    🔄 チェックをリセット
                </button>
            </div>
        </div>
    );
};
