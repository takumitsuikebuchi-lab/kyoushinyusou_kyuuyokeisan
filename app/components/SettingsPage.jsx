"use client";
import React, { useState } from "react";
import { Card, Tip, Badge } from "@/app/components/ui";

const SETTINGS_TABS = [
    { id: "basic", label: "基本設定" },
    { id: "insurance", label: "保険・税" },
    { id: "labor", label: "労働条件" },
    { id: "org", label: "組織・明細" },
];

export const SettingsPage = ({ settings, setSettings }) => {
    const [savedAt, setSavedAt] = useState("");
    const [settingsTab, setSettingsTab] = useState("basic");
    const [newDept, setNewDept] = useState("");
    const [newJobType, setNewJobType] = useState("");
    const [newHolidayDate, setNewHolidayDate] = useState("");
    const [newHolidayName, setNewHolidayName] = useState("");
    const update = (field, value) => setSettings((prev) => ({ ...prev, [field]: value }));
    const updateNum = (field, value) => update(field, value === "" ? "" : Number(value));
    const updateMonthDays = (month, value) => setSettings((prev) => ({ ...prev, monthlyWorkDays: { ...prev.monthlyWorkDays, [month]: value === "" ? "" : Number(value) } }));

    const dayNames = [
        { key: "holidayMonday", label: "月曜" }, { key: "holidayTuesday", label: "火曜" },
        { key: "holidayWednesday", label: "水曜" }, { key: "holidayThursday", label: "木曜" },
        { key: "holidayFriday", label: "金曜" }, { key: "holidaySaturday", label: "土曜" },
        { key: "holidaySunday", label: "日曜" }, { key: "holidayNational", label: "祝日" },
    ];
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const monthKeys = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    const totalWorkDays = monthKeys.reduce((s, k) => s + (settings.monthlyWorkDays?.[k] || 0), 0);
    const totalHolidays = 365 - totalWorkDays;

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">マスタ設定</h1>
                <Badge variant="info">自動保存</Badge>
            </div>

            {/* タブナビゲーション */}
            <div className="settings-tabs">
                {SETTINGS_TABS.map((tab) => (
                    <button key={tab.id} className={`settings-tab${settingsTab === tab.id ? " active" : ""}`} onClick={() => setSettingsTab(tab.id)}>{tab.label}</button>
                ))}
            </div>

            {/* ===== 基本設定タブ ===== */}
            {settingsTab === "basic" && <>
                <Card title="会社情報">
                    <div className="settings-grid">
                        <label className="form-label">会社名<input value={settings.companyName} onChange={(e) => update("companyName", e.target.value)} /></label>
                        <label className="form-label"><Tip label="締め日">給与計算の対象期間の最終日。</Tip><input value={settings.closingDay} onChange={(e) => update("closingDay", e.target.value)} /></label>
                        <label className="form-label"><Tip label="支払日">給与の支給日。</Tip><input value={settings.paymentDay} onChange={(e) => update("paymentDay", e.target.value)} /></label>
                        <label className="form-label"><Tip label="社保徴収">社会保険料をいつの給与から天引きするか。</Tip>
                            <select value={settings.socialCollection} onChange={(e) => update("socialCollection", e.target.value)}>
                                <option value="翌月徴収">翌月徴収</option><option value="当月徴収">当月徴収</option>
                            </select>
                        </label>
                        <label className="form-label"><Tip label="税額計算方法">源泉所得税の算出方法。通常は月額表を使用。</Tip>
                            <select value={settings.taxCalcMethod} onChange={(e) => update("taxCalcMethod", e.target.value)}>
                                <option value="税額表（月額表）">税額表（月額表）</option><option value="税額表（日額表）">税額表（日額表）</option>
                            </select>
                        </label>
                        <label className="form-label"><Tip label="明細表示月">給与明細を支給日の属する月で表示するか。</Tip>
                            <select value={settings.slipDisplayMonth} onChange={(e) => update("slipDisplayMonth", e.target.value)}>
                                <option value="支給日が属する月">支給日が属する月</option><option value="締め日が属する月">締め日が属する月</option>
                            </select>
                        </label>
                    </div>
                    <label className="settings-toggle" style={{ marginTop: 12 }}>
                        <input type="checkbox" checked={settings.showRetiredNextMonth || false} onChange={(e) => update("showRetiredNextMonth", e.target.checked)} />
                        退職者の翌月給与を表示する
                    </label>
                </Card>

                <Card title="管轄・届出先">
                    <div className="settings-grid">
                        <label className="form-label"><Tip label="管轄都道府県">社会保険料率が適用される都道府県。</Tip><input value={settings.jurisdiction} onChange={(e) => update("jurisdiction", e.target.value)} /></label>
                        <label className="form-label"><Tip label="保険種別">健康保険の加入区分。</Tip>
                            <select value={settings.insuranceType} onChange={(e) => update("insuranceType", e.target.value)}>
                                <option value="協会管掌事業所">協会管掌事業所</option><option value="組合管掌事業所">組合管掌事業所</option>
                            </select>
                        </label>
                        <label className="form-label">管轄税務署<input value={settings.taxOffice} onChange={(e) => update("taxOffice", e.target.value)} /></label>
                        <label className="form-label">税務署コード<input value={settings.taxOfficeCode} onChange={(e) => update("taxOfficeCode", e.target.value)} /></label>
                        <label className="form-label">管轄年金事務所<input value={settings.pensionOffice} onChange={(e) => update("pensionOffice", e.target.value)} /></label>
                        <label className="form-label">事業所番号<input value={settings.pensionOfficeNumber} onChange={(e) => update("pensionOfficeNumber", e.target.value)} /></label>
                        <label className="form-label"><Tip label="整理記号">年金事務所から付与される事業所の識別コード。</Tip><input value={settings.pensionOfficeCode} onChange={(e) => update("pensionOfficeCode", e.target.value)} /></label>
                        <label className="form-label"><Tip label="届出提出者">社会保険届出の提出者。</Tip>
                            <select value={settings.socialDocSubmitter} onChange={(e) => update("socialDocSubmitter", e.target.value)}>
                                <option value="事業主">事業主</option><option value="社労士">社労士</option>
                            </select>
                        </label>
                    </div>
                </Card>
            </>}

            {/* ===== 保険・税タブ ===== */}
            {settingsTab === "insurance" && <>
                <Card title="社会保険料率（%） — 被保険者（本人）負担">
                    <div className="settings-grid">
                        <label className="form-label"><Tip label="健康保険">協会けんぽの都道府県別料率（折半後）。北海道は5.155%。</Tip><input type="number" step="0.001" value={settings.healthRate} onChange={(e) => updateNum("healthRate", e.target.value)} /></label>
                        <label className="form-label"><Tip label="介護保険">40歳〜64歳の被保険者に適用。全国一律。</Tip><input type="number" step="0.001" value={settings.kaigoRate} onChange={(e) => updateNum("kaigoRate", e.target.value)} /></label>
                        <label className="form-label"><Tip label="厚生年金">全国一律の料率（折半後）。</Tip><input type="number" step="0.01" value={settings.pensionRate} onChange={(e) => updateNum("pensionRate", e.target.value)} /></label>
                        <label className="form-label"><Tip label="雇用保険（本人）">従業員負担分の料率。事業の種類で異なる。</Tip><input type="number" step="0.01" value={settings.employmentRate} onChange={(e) => updateNum("employmentRate", e.target.value)} /></label>
                    </div>
                </Card>
                <Card title="社会保険料率（%） — 事業主負担">
                    <div className="settings-grid">
                        <label className="form-label"><Tip label="健康保険（事業主）">事業主が負担する健康保険料率。通常は本人と同額。</Tip><input type="number" step="0.001" value={settings.healthRateEmployer} onChange={(e) => updateNum("healthRateEmployer", e.target.value)} /></label>
                        <label className="form-label"><Tip label="介護保険（事業主）">事業主が負担する介護保険料率。</Tip><input type="number" step="0.001" value={settings.kaigoRateEmployer} onChange={(e) => updateNum("kaigoRateEmployer", e.target.value)} /></label>
                        <label className="form-label"><Tip label="厚生年金（事業主）">事業主が負担する厚生年金料率。</Tip><input type="number" step="0.01" value={settings.pensionRateEmployer} onChange={(e) => updateNum("pensionRateEmployer", e.target.value)} /></label>
                        <label className="form-label"><Tip label="子ども・子育て拠出金">事業主のみ負担。全国一律の料率。</Tip><input type="number" step="0.01" value={settings.childCareRate} onChange={(e) => updateNum("childCareRate", e.target.value)} /></label>
                    </div>
                </Card>
            </>}

            {/* ===== 労働条件タブ ===== */}
            {settingsTab === "labor" && <>
                <Card title="所定労働時間・日数">
                    <div className="settings-grid">
                        <label className="form-label"><Tip label="1日の所定労働時間">1日あたりの基本労働時間（休憩除く）。法定上限は8時間。</Tip><input type="number" step="0.1" value={settings.prescribedHoursPerDay} onChange={(e) => updateNum("prescribedHoursPerDay", e.target.value)} /></label>
                        <label className="form-label"><Tip label="月平均所定労働日数">年間所定労働日数÷12。通常22〜26日。</Tip><input type="number" step="0.1" value={settings.prescribedDaysPerMonth} onChange={(e) => updateNum("prescribedDaysPerMonth", e.target.value)} /></label>
                        <label className="form-label"><Tip label="月平均所定労働時間">年間所定労働時間÷12。時間単価の計算に使用。</Tip><input type="number" step="0.1" value={settings.avgMonthlyHoursDefault} onChange={(e) => updateNum("avgMonthlyHoursDefault", e.target.value)} /></label>
                    </div>
                    <div className="settings-grid" style={{ marginTop: 12 }}>
                        <label className="form-label"><Tip label="残業警告ライン">この時間を超えると警告を表示。36協定の上限に注意。</Tip><input type="number" value={settings.overtimeWarningHours} onChange={(e) => updateNum("overtimeWarningHours", e.target.value)} /></label>
                        <label className="form-label"><Tip label="残業上限（時間）">36協定の上限時間。超過は法律違反の可能性。</Tip><input type="number" value={settings.overtimeLimitHours} onChange={(e) => updateNum("overtimeLimitHours", e.target.value)} /></label>
                    </div>
                </Card>

                <Card title="月別所定労働日数">
                    <div className="month-days-grid">
                        {monthKeys.map((k, i) => (
                            <label key={k}>{monthNames[i]}<input type="number" value={settings.monthlyWorkDays?.[k] ?? ""} onChange={(e) => updateMonthDays(k, e.target.value)} /></label>
                        ))}
                    </div>
                    <div className="settings-summary-bar">
                        <span>年間労働日数: <strong>{totalWorkDays}日</strong></span>
                        <span>年間休日数: <strong>{totalHolidays}日</strong></span>
                    </div>
                </Card>

                <Card title="休日設定">
                    <div className="settings-grid-4">
                        {dayNames.map(({ key, label }) => (
                            <label key={key} className="form-label">{label}
                                <select value={settings[key]} onChange={(e) => update(key, e.target.value)}>
                                    <option value="平日">平日</option>
                                    <option value="法定休日">法定休日</option>
                                    <option value="所定休日">所定休日</option>
                                </select>
                            </label>
                        ))}
                    </div>
                </Card>

                <Card title="独自休日（年末年始等）">
                    {(settings.customHolidays || []).length > 0 && (
                        <div className="tag-list" style={{ marginBottom: 8 }}>
                            {(settings.customHolidays || []).map((h, idx) => (
                                <span key={idx} className="tag-item">
                                    {h.date} {h.name}
                                    <span className="tag-remove" onClick={() => setSettings((prev) => ({ ...prev, customHolidays: prev.customHolidays.filter((_, i) => i !== idx) }))}>×</span>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="settings-add-row">
                        <input placeholder="MM-DD" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} style={{ maxWidth: 100 }} />
                        <input placeholder="名称（例: 年始休日）" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} />
                        <button className="btn btn-outline" onClick={() => {
                            if (newHolidayDate && newHolidayName) {
                                setSettings((prev) => ({ ...prev, customHolidays: [...(prev.customHolidays || []), { date: newHolidayDate, name: newHolidayName }] }));
                                setNewHolidayDate(""); setNewHolidayName("");
                            }
                        }}>追加</button>
                    </div>
                </Card>
            </>}

            {/* ===== 組織・明細タブ ===== */}
            {settingsTab === "org" && <>
                <Card title="部門">
                    <div className="tag-list">
                        {(settings.departments || []).map((d, i) => (
                            <span key={i} className="tag-item">{d}
                                <span className="tag-remove" onClick={() => setSettings((prev) => ({ ...prev, departments: prev.departments.filter((_, idx) => idx !== i) }))}>×</span>
                            </span>
                        ))}
                    </div>
                    <div className="settings-add-row">
                        <input placeholder="新しい部門名" value={newDept} onChange={(e) => setNewDept(e.target.value)} />
                        <button className="btn btn-outline" onClick={() => {
                            if (newDept.trim()) { setSettings((prev) => ({ ...prev, departments: [...(prev.departments || []), newDept.trim()] })); setNewDept(""); }
                        }}>追加</button>
                    </div>
                </Card>

                <Card title="職種">
                    <div className="tag-list">
                        {(settings.jobTypes || []).map((j, i) => (
                            <span key={i} className="tag-item">{j}
                                <span className="tag-remove" onClick={() => setSettings((prev) => ({ ...prev, jobTypes: prev.jobTypes.filter((_, idx) => idx !== i) }))}>×</span>
                            </span>
                        ))}
                    </div>
                    <div className="settings-add-row">
                        <input placeholder="新しい職種名" value={newJobType} onChange={(e) => setNewJobType(e.target.value)} />
                        <button className="btn btn-outline" onClick={() => {
                            if (newJobType.trim()) { setSettings((prev) => ({ ...prev, jobTypes: [...(prev.jobTypes || []), newJobType.trim()] })); setNewJobType(""); }
                        }}>追加</button>
                    </div>
                </Card>

                <Card title="明細設定">
                    <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>給与明細に表示する項目を選択します。</p>
                    <div className="settings-grid">
                        <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowAttendance} onChange={(e) => update("slipShowAttendance", e.target.checked)} />勤怠情報を表示</label>
                        <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowHourlyRate} onChange={(e) => update("slipShowHourlyRate", e.target.checked)} />時間単価を表示</label>
                        <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowDependents} onChange={(e) => update("slipShowDependents", e.target.checked)} />扶養人数を表示</label>
                        <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowPeriod} onChange={(e) => update("slipShowPeriod", e.target.checked)} />対象期間を表示</label>
                        <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowYtdTotal} onChange={(e) => update("slipShowYtdTotal", e.target.checked)} />累計支給額を表示</label>
                        <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowTaxCategory} onChange={(e) => update("slipShowTaxCategory", e.target.checked)} />税区分を表示</label>
                        <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowStdMonthly} onChange={(e) => update("slipShowStdMonthly", e.target.checked)} />標準報酬月額を表示</label>
                        <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowDept} onChange={(e) => update("slipShowDept", e.target.checked)} />部門を表示</label>
                    </div>
                </Card>
            </>}

            {savedAt && <div className="settings-saved-msg">保存しました: {savedAt}</div>}
        </div>
    );
};
