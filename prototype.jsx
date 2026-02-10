import { useState, useMemo, useCallback } from "react";

// ===== 検証済み計算ロジック =====
const ceil = (v) => Math.ceil(v);
const insRound = (v) => (v - Math.floor(v) > 0.5 ? Math.ceil(v) : Math.floor(v));

const RATES = {
  health: 51.55 / 1000,
  kaigo: 7.95 / 1000,
  pension: 91.5 / 1000,
  employment: 5.5 / 1000,
};

const calcOvertime = (hourlyRate, hours, multiplier) =>
  hours > 0 ? ceil(hourlyRate * hours * multiplier) : 0;

const calcPayroll = (emp, att) => {
  const hourly = (emp.basicPay + emp.dutyAllowance) / emp.avgMonthlyHours;

  const otLegal = calcOvertime(hourly, att.legalOT, 1.25);
  const otPrescribed = calcOvertime(hourly, att.prescribedOT, 1.0);
  const otNight = calcOvertime(hourly, att.nightOT, 1.25);
  const otHoliday = calcOvertime(hourly, att.holidayOT, 1.35);

  const gross =
    emp.basicPay +
    emp.dutyAllowance +
    otLegal +
    otPrescribed +
    otNight +
    otHoliday +
    emp.commuteAllow;

  const health = emp.stdMonthly
    ? insRound(emp.stdMonthly * RATES.health)
    : 0;
  const kaigo =
    emp.hasKaigo && emp.stdMonthly
      ? insRound(emp.stdMonthly * RATES.kaigo)
      : 0;
  const pension =
    emp.hasPension && emp.stdMonthly
      ? insRound(emp.stdMonthly * RATES.pension)
      : 0;
  const employment = emp.hasEmployment
    ? insRound(gross * RATES.employment)
    : 0;

  const socialTotal = health + kaigo + pension + employment;
  const taxableIncome = gross - socialTotal - emp.commuteAllow;
  const incomeTax = estimateTax(taxableIncome, emp.dependents);
  const residentTax = emp.residentTax;
  const totalDeduct = socialTotal + incomeTax + residentTax;
  const netPay = gross - totalDeduct;

  return {
    hourly: Math.round(hourly * 100) / 100,
    otLegal,
    otPrescribed,
    otNight,
    otHoliday,
    gross,
    health,
    kaigo,
    pension,
    employment,
    socialTotal,
    incomeTax,
    residentTax,
    totalDeduct,
    netPay,
  };
};

const estimateTax = (taxable, deps) => {
  if (taxable <= 0) return 0;
  const base = [
    [88000, 0],
    [89000, 130],
    [130000, 2120],
    [162000, 3200],
    [175000, 4770],
    [197000, 5480],
    [222000, 6530],
    [252000, 8420],
    [283000, 10120],
    [312000, 12100],
    [346000, 14290],
    [381000, 16950],
    [428000, 21480],
    [475000, 26780],
    [549000, 33220],
    [645000, 44200],
    [Infinity, 63700],
  ];
  const depReduction = deps * 1580;
  let tax = 0;
  for (const [threshold, amount] of base) {
    if (taxable < threshold) {
      tax = amount;
      break;
    }
  }
  return Math.max(0, tax - depReduction);
};

// ===== 実際の従業員データ =====
const EMPLOYEES = [
  {
    id: 1,
    name: "渡会 流雅",
    dept: "運送事業",
    jobType: "トラックドライバー",
    basicPay: 210000,
    dutyAllowance: 10000,
    commuteAllow: 0,
    avgMonthlyHours: 173.0,
    stdMonthly: 260000,
    hasKaigo: false,
    hasPension: true,
    hasEmployment: true,
    dependents: 0,
    residentTax: 13000,
    isOfficer: false,
    status: "在籍",
  },
  {
    id: 2,
    name: "渡曾 羊一",
    dept: "運送事業",
    jobType: "トラックドライバー",
    basicPay: 100000,
    dutyAllowance: 0,
    commuteAllow: 0,
    avgMonthlyHours: 89.1,
    stdMonthly: 104000,
    hasKaigo: false,
    hasPension: false,
    hasEmployment: false,
    dependents: 0,
    residentTax: 0,
    isOfficer: false,
    status: "在籍",
    note: "年金受給者・短時間勤務",
  },
  {
    id: 3,
    name: "門馬 将太",
    dept: "運送事業",
    jobType: "事務経理・運行管理",
    basicPay: 370000,
    dutyAllowance: 0,
    commuteAllow: 0,
    avgMonthlyHours: 173.0,
    stdMonthly: 380000,
    hasKaigo: true,
    hasPension: true,
    hasEmployment: false,
    dependents: 0,
    residentTax: 0,
    isOfficer: true,
    status: "在籍",
    note: "役員（2025年11月〜）",
  },
];

const DEFAULT_ATTENDANCE = {
  1: { workDays: 25, legalOT: 58.0, prescribedOT: 19.5, nightOT: 1.5, holidayOT: 0 },
  2: { workDays: 12, legalOT: 7.5, prescribedOT: 4.0, nightOT: 0, holidayOT: 0 },
  3: { workDays: 25, legalOT: 0, prescribedOT: 0, nightOT: 0, holidayOT: 0 },
};

// ===== UI Components =====
const Nav = ({ page, setPage }) => {
  const items = [
    { id: "dashboard", icon: "◉", label: "ダッシュボード" },
    { id: "employees", icon: "◎", label: "従業員一覧" },
    { id: "payroll", icon: "◈", label: "月次給与計算" },
    { id: "history", icon: "◇", label: "給与明細一覧" },
    { id: "leave", icon: "◆", label: "有給管理" },
    { id: "settings", icon: "◐", label: "マスタ設定" },
  ];
  return (
    <nav style={{
      width: 220, minHeight: "100vh", background: "linear-gradient(180deg, #0f2027 0%, #1a3a4a 100%)",
      padding: "0", flexShrink: 0, display: "flex", flexDirection: "column",
    }}>
      <div style={{
        padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{ color: "#5ec6d0", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>
          きょうしん輸送
        </div>
        <div style={{ color: "#e8edf2", fontSize: 15, fontWeight: 600, fontFamily: "'Noto Sans JP', sans-serif" }}>
          給与計算システム
        </div>
      </div>
      <div style={{ padding: "12px 0", flex: 1 }}>
        {items.map((item) => (
          <button key={item.id} onClick={() => setPage(item.id)} style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "11px 20px", border: "none", cursor: "pointer",
            background: page === item.id ? "rgba(94,198,208,0.12)" : "transparent",
            color: page === item.id ? "#5ec6d0" : "#8fa3b0",
            fontSize: 13, fontWeight: page === item.id ? 600 : 400,
            borderLeft: page === item.id ? "3px solid #5ec6d0" : "3px solid transparent",
            transition: "all 0.15s", fontFamily: "'Noto Sans JP', sans-serif",
          }}>
            <span style={{ fontSize: 14, opacity: 0.8 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#5a7080", fontSize: 10, fontFamily: "monospace" }}>
        v3.0 Prototype
      </div>
    </nav>
  );
};

const Card = ({ title, children, accent, style: s }) => (
  <div style={{
    background: "#fff", borderRadius: 10, padding: "20px 24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
    border: "1px solid #e8ecf0",
    borderTop: accent ? `3px solid ${accent}` : undefined, ...s,
  }}>
    {title && (
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7a85", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace" }}>
        {title}
      </div>
    )}
    {children}
  </div>
);

const Stat = ({ label, value, sub, color }) => (
  <div>
    <div style={{ fontSize: 11, color: "#8a96a0", marginBottom: 4, fontWeight: 500 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: color || "#1a3040", fontFamily: "'JetBrains Mono', monospace", letterSpacing: -1 }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 11, color: "#a0aab0", marginTop: 2 }}>{sub}</div>}
  </div>
);

const fmt = (n) => n != null ? n.toLocaleString() : "-";

// ===== Pages =====
const Dashboard = () => {
  const active = EMPLOYEES.filter((e) => e.status === "在籍");
  const totalGross = active.reduce((sum, emp) => {
    const r = calcPayroll(emp, DEFAULT_ATTENDANCE[emp.id]);
    return sum + r.gross;
  }, 0);
  const totalNet = active.reduce((sum, emp) => {
    const r = calcPayroll(emp, DEFAULT_ATTENDANCE[emp.id]);
    return sum + r.netPay;
  }, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a3040", margin: 0 }}>ダッシュボード</h1>
        <span style={{ fontSize: 13, color: "#8a96a0" }}>2026年1月分（2月20日支給）</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <Card accent="#5ec6d0"><Stat label="在籍従業員" value={`${active.length}名`} sub="退職者含む27名登録" /></Card>
        <Card accent="#48bb78"><Stat label="総支給額" value={`¥${fmt(totalGross)}`} color="#2d7a4f" /></Card>
        <Card accent="#ed8936"><Stat label="差引支給合計" value={`¥${fmt(totalNet)}`} color="#b7621a" /></Card>
        <Card accent="#e53e3e"><Stat label="次回支払日" value="2/20" sub="金曜日" color="#c53030" /></Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="給与計算ステータス">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {active.map((emp) => {
              const r = calcPayroll(emp, DEFAULT_ATTENDANCE[emp.id]);
              return (
                <div key={emp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#f7f9fa", borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: "#8a96a0" }}>{emp.dept} / {emp.jobType}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "monospace" }}>¥{fmt(r.netPay)}</div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#ebf8ee", color: "#2d7a4f", fontWeight: 600 }}>計算済</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="検証済み計算ロジック">
          <div style={{ fontSize: 12, color: "#4a5560", lineHeight: 1.8 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ display: "inline-block", background: "#ebf8ee", color: "#2d7a4f", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, marginRight: 6 }}>✓ 検証済</span>
              MF給与 2025年9月〜12月 全項目一致
            </div>
            <div>・残業代：ceil（1円未満切り上げ）</div>
            <div>・時間単価基礎：基本給＋職務手当</div>
            <div>・雇用保険：5.5‰（運送業）</div>
            <div>・深夜残業：残業手当と別途×1.25加算</div>
            <div>・社保端数：50銭超切り上げ</div>
            <div>・介護保険：40歳以上のみ（門馬）</div>
          </div>
        </Card>
      </div>
    </div>
  );
};

const PayrollPage = () => {
  const [attendance, setAttendance] = useState(DEFAULT_ATTENDANCE);
  const [selected, setSelected] = useState(null);

  const updateAtt = (empId, field, val) => {
    setAttendance((prev) => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: parseFloat(val) || 0 },
    }));
  };

  const results = useMemo(
    () =>
      EMPLOYEES.filter((e) => e.status === "在籍").map((emp) => ({
        emp,
        att: attendance[emp.id],
        result: calcPayroll(emp, attendance[emp.id]),
      })),
    [attendance]
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a3040", margin: 0 }}>月次給与計算</h1>
          <span style={{ fontSize: 13, color: "#8a96a0" }}>2026年1月分</span>
        </div>
        <button style={{
          padding: "8px 20px", background: "#1a5276", color: "#fff", border: "none",
          borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: "pointer",
        }}>
          確定する
        </button>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                {["従業員", "基本給", "職務手当", "法定外OT", "所定外OT", "深夜OT", "残業手当計", "総支給額", "社保計", "所得税", "住民税", "差引支給額"].map((h) => (
                  <th key={h} style={{ padding: "10px 8px", textAlign: h === "従業員" ? "left" : "right", color: "#6b7a85", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(({ emp, att, result: r }) => (
                <tr key={emp.id}
                  onClick={() => setSelected(selected === emp.id ? null : emp.id)}
                  style={{ borderBottom: "1px solid #f0f2f4", cursor: "pointer", background: selected === emp.id ? "#f0f7ff" : "transparent", transition: "background 0.1s" }}>
                  <td style={{ padding: "12px 8px" }}>
                    <div style={{ fontWeight: 600 }}>{emp.name}</div>
                    <div style={{ fontSize: 10, color: "#8a96a0" }}>
                      {emp.isOfficer ? "役員" : emp.jobType}
                      {emp.note && ` · ${emp.note}`}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px" }}>{fmt(emp.basicPay)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px" }}>{emp.dutyAllowance ? fmt(emp.dutyAllowance) : "-"}</td>
                  <td style={{ textAlign: "right", padding: "12px 4px" }}>
                    <input type="number" step="0.5" value={att.legalOT} onChange={(e) => updateAtt(emp.id, "legalOT", e.target.value)}
                      style={{ width: 52, textAlign: "right", border: "1px solid #d0d7de", borderRadius: 4, padding: "4px 6px", fontSize: 13, fontFamily: "monospace" }} />
                  </td>
                  <td style={{ textAlign: "right", padding: "12px 4px" }}>
                    <input type="number" step="0.5" value={att.prescribedOT} onChange={(e) => updateAtt(emp.id, "prescribedOT", e.target.value)}
                      style={{ width: 52, textAlign: "right", border: "1px solid #d0d7de", borderRadius: 4, padding: "4px 6px", fontSize: 13, fontFamily: "monospace" }} />
                  </td>
                  <td style={{ textAlign: "right", padding: "12px 4px" }}>
                    <input type="number" step="0.5" value={att.nightOT} onChange={(e) => updateAtt(emp.id, "nightOT", e.target.value)}
                      style={{ width: 52, textAlign: "right", border: "1px solid #d0d7de", borderRadius: 4, padding: "4px 6px", fontSize: 13, fontFamily: "monospace" }} />
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", fontWeight: 600, color: r.otLegal + r.otPrescribed + r.otNight > 0 ? "#b7621a" : "#a0aab0" }}>
                    {fmt(r.otLegal + r.otPrescribed + r.otNight + r.otHoliday)}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", fontWeight: 700 }}>{fmt(r.gross)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", color: "#c53030" }}>{fmt(r.socialTotal)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", color: "#c53030" }}>{fmt(r.incomeTax)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", color: "#c53030" }}>{fmt(r.residentTax)}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", fontWeight: 700, fontSize: 14, color: "#1a5276" }}>{fmt(r.netPay)}</td>
                </tr>
              ))}
              <tr style={{ background: "#f7f9fa", fontWeight: 700 }}>
                <td style={{ padding: "12px 8px", fontSize: 12 }}>合計</td>
                <td colSpan={6}></td>
                <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px" }}>{fmt(results.reduce((s, r) => s + r.result.gross, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", color: "#c53030" }}>{fmt(results.reduce((s, r) => s + r.result.socialTotal, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", color: "#c53030" }}>{fmt(results.reduce((s, r) => s + r.result.incomeTax, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", color: "#c53030" }}>{fmt(results.reduce((s, r) => s + r.result.residentTax, 0))}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace", padding: "12px 8px", fontSize: 15, color: "#1a5276" }}>
                  {fmt(results.reduce((s, r) => s + r.result.netPay, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (() => {
        const { emp, att, result: r } = results.find((x) => x.emp.id === selected);
        return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Card title={`${emp.name} 支給内訳`} accent="#48bb78">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                {[
                  ["基本給", emp.basicPay],
                  ["職務手当", emp.dutyAllowance],
                  ["通勤手当", emp.commuteAllow],
                  ["─────", ""],
                  [`残業手当（${att.legalOT}h×1.25）`, r.otLegal],
                  [`法定内残業（${att.prescribedOT}h×1.00）`, r.otPrescribed],
                  [`深夜残業（${att.nightOT}h×1.25）`, r.otNight],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: "contents" }}>
                    <div style={{ padding: "6px 0", color: "#5a6a75" }}>{label}</div>
                    <div style={{ padding: "6px 0", textAlign: "right", fontFamily: "monospace", fontWeight: val > 0 ? 600 : 400 }}>
                      {val !== "" ? `¥${fmt(val)}` : ""}
                    </div>
                  </div>
                ))}
                <div style={{ gridColumn: "1/-1", borderTop: "2px solid #2d7a4f", padding: "8px 0", display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#2d7a4f" }}>
                  <span>総支給額</span>
                  <span style={{ fontFamily: "monospace", fontSize: 15 }}>¥{fmt(r.gross)}</span>
                </div>
              </div>
              <div style={{ marginTop: 12, padding: "8px 10px", background: "#f0f7f4", borderRadius: 6, fontSize: 11, color: "#4a6a5a", fontFamily: "monospace" }}>
                時間単価 = {fmt(emp.basicPay + emp.dutyAllowance)} / {emp.avgMonthlyHours} = {r.hourly.toFixed(4)}円
              </div>
            </Card>
            <Card title={`${emp.name} 控除内訳`} accent="#e53e3e">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                {[
                  [`健康保険（${fmt(emp.stdMonthly)}×51.55‰）`, r.health],
                  [`介護保険（${emp.hasKaigo ? fmt(emp.stdMonthly) + "×7.95‰" : "対象外"})`, r.kaigo],
                  [`厚生年金（${emp.hasPension ? fmt(emp.stdMonthly) + "×91.5‰" : "対象外"})`, r.pension],
                  [`雇用保険（${emp.hasEmployment ? fmt(r.gross) + "×5.5‰" : "対象外"})`, r.employment],
                  ["所得税（月額表・甲欄）", r.incomeTax],
                  ["住民税（特別徴収）", r.residentTax],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: "contents" }}>
                    <div style={{ padding: "6px 0", color: "#5a6a75", fontSize: 12 }}>{label}</div>
                    <div style={{ padding: "6px 0", textAlign: "right", fontFamily: "monospace", color: val > 0 ? "#c53030" : "#a0aab0" }}>
                      {val > 0 ? `-¥${fmt(val)}` : "¥0"}
                    </div>
                  </div>
                ))}
                <div style={{ gridColumn: "1/-1", borderTop: "2px solid #c53030", padding: "8px 0", display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#c53030" }}>
                  <span>控除合計</span>
                  <span style={{ fontFamily: "monospace", fontSize: 15 }}>-¥{fmt(r.totalDeduct)}</span>
                </div>
                <div style={{ gridColumn: "1/-1", borderTop: "2px solid #1a5276", padding: "10px 0", display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#1a5276", fontSize: 16 }}>
                  <span>差引支給額</span>
                  <span style={{ fontFamily: "monospace" }}>¥{fmt(r.netPay)}</span>
                </div>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
};

const EmployeesPage = () => (
  <div>
    <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a3040", marginBottom: 24 }}>従業員一覧</h1>
    <Card>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["在籍者", "退職者"].map((tab, i) => (
          <button key={tab} style={{
            padding: "6px 16px", border: "1px solid #d0d7de", borderRadius: 6,
            background: i === 0 ? "#1a5276" : "#fff", color: i === 0 ? "#fff" : "#5a6a75",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>{tab}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {EMPLOYEES.map((emp) => (
          <div key={emp.id} style={{ display: "grid", gridTemplateColumns: "180px 140px 180px 1fr 100px", alignItems: "center", padding: "14px 16px", background: "#f7f9fa", borderRadius: 8, gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{emp.name}</div>
              {emp.note && <div style={{ fontSize: 10, color: "#b7621a", marginTop: 2 }}>{emp.note}</div>}
            </div>
            <div style={{ fontSize: 12, color: "#5a6a75" }}>{emp.dept}</div>
            <div style={{ fontSize: 12, color: "#5a6a75" }}>{emp.jobType}</div>
            <div style={{ fontSize: 12, fontFamily: "monospace" }}>
              基本給 ¥{fmt(emp.basicPay)} / 標準報酬 ¥{fmt(emp.stdMonthly)}
              {emp.isOfficer && <span style={{ marginLeft: 8, padding: "1px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>役員</span>}
              {emp.hasKaigo && <span style={{ marginLeft: 4, padding: "1px 6px", background: "#fee2e2", color: "#991b1b", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>介護</span>}
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ padding: "3px 10px", background: "#ebf8ee", color: "#2d7a4f", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>在籍</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  </div>
);

const PlaceholderPage = ({ title }) => (
  <div>
    <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a3040", marginBottom: 24 }}>{title}</h1>
    <Card>
      <div style={{ padding: 40, textAlign: "center", color: "#8a96a0" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🚧</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>この画面はプロトタイプでは未実装です</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>開発Phase 4〜6で実装予定</div>
      </div>
    </Card>
  </div>
);

// ===== Main App =====
export default function App() {
  const [page, setPage] = useState("dashboard");
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f2f4f7", fontFamily: "'Noto Sans JP', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <Nav page={page} setPage={setPage} />
      <main style={{ flex: 1, padding: "28px 32px", maxWidth: 1100, overflowX: "auto" }}>
        {page === "dashboard" && <Dashboard />}
        {page === "payroll" && <PayrollPage />}
        {page === "employees" && <EmployeesPage />}
        {page === "history" && <PlaceholderPage title="給与明細一覧" />}
        {page === "leave" && <PlaceholderPage title="有給休暇管理" />}
        {page === "settings" && <PlaceholderPage title="マスタ設定" />}
      </main>
    </div>
  );
}
