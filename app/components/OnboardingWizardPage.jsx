"use client";
import React, { useState, useEffect, useCallback } from "react";
import { EMPTY_ATTENDANCE, fiscalYearFromDate, getEmployeeHrmosNumber, normalizeHrmosEmployeeNumber } from "@/lib/date-utils";
import { Badge, Card } from "@/app/components/ui";

// ===== 入社手続きグループ定義 =====

const ONBOARDING_GROUPS = [
  {
    id: "urgent",
    label: "急ぎ対応",
    labelSub: "入社日当日〜3日以内",
    color: "danger",
    steps: [
      {
        id: "contract",
        label: "雇用契約書・労働条件通知書の署名",
        deadline: "入社日当日",
        deadlineVariant: "danger",
        where: "社内保管",
        docs: ["労働条件通知書（正社員・嘱託）", "委任契約書（役員の場合）", "就業規則の写し"],
        notes: [
          "正社員・嘱託は「労働条件通知書」の交付が法律で義務付けられています（労基法 第15条）",
          "役員の場合は「委任契約書」（雇用契約書とは別物）",
          "勤務時間・休日・賃金・勤務場所を明記すること",
          "会社用・本人用の2部作成。書類は5年間保管義務",
        ],
      },
      {
        id: "mynumber",
        label: "マイナンバーの収集",
        deadline: "入社後1週間以内",
        deadlineVariant: "danger",
        where: "社内（施錠保管）",
        docs: [
          "マイナンバーカードのコピー（表・裏）",
          "または：通知カードのコピー＋身分証（運転免許証等）のコピー",
          "扶養家族がいる場合：家族全員分のマイナンバー",
        ],
        notes: [
          "社会保険・雇用保険・年末調整などすべての手続きで必要",
          "受け取った書類は施錠できる場所に保管（番号法で厳格管理が義務）",
          "目的外の使用・第三者提供は法律で禁止",
        ],
      },
      {
        id: "shakai_hoken",
        label: "健康保険・厚生年金 加入届の提出",
        deadline: "入社日から5日以内",
        deadlineVariant: "danger",
        where: "岩見沢 年金事務所",
        docs: [
          "健康保険・厚生年金保険 被保険者資格取得届",
          "被扶養者（異動）届（扶養家族がいる場合）",
          "扶養家族のマイナンバー・続柄確認書類",
        ],
        notes: [
          "提出期限：資格取得日（入社日）から5日以内（法定）",
          "短時間労働者は週20時間以上・月額賃金8.8万円以上等の条件を確認",
          "役員も報酬があれば原則加入",
          "年金受給者で短時間勤務の場合は加入不要な場合あり（要確認）",
        ],
      },
      {
        id: "koyo_hoken",
        label: "雇用保険 加入届の提出",
        deadline: "入社翌月10日まで",
        deadlineVariant: "warning",
        where: "ハローワーク（岩見沢公共職業安定所）",
        docs: [
          "雇用保険 被保険者資格取得届",
          "賃金台帳の写し（初回賃金確定後）",
          "マイナンバー記載書類",
        ],
        notes: [
          "提出期限：資格取得日の翌月10日まで（雇用保険法 第7条）",
          "週20時間以上かつ31日以上の雇用見込みで加入義務",
          "役員・65歳以上の日雇い等は適用除外",
          "被保険者番号は前職のものを引き継ぐ（ハローワークで確認）",
        ],
      },
    ],
  },
  {
    id: "monthly",
    label: "月内対応",
    labelSub: "入社月〜翌月まで",
    color: "info",
    steps: [
      {
        id: "shotoku_zei",
        label: "扶養控除等申告書の受領（所得税）",
        deadline: "最初の給与支払い日まで",
        deadlineVariant: "warning",
        where: "社内保管（税務署への提出は不要）",
        docs: [
          "給与所得者の扶養控除等（異動）申告書",
          "扶養家族がいる場合：続柄・マイナンバー確認書類",
        ],
        notes: [
          "甲欄（源泉徴収税額表）を適用するために必須。提出がない場合は乙欄（高い税率）で徴収",
          "毎年1回、年末調整前（または入社時）に提出してもらう",
          "他社でも勤務している場合は1社にしか提出できない（副業注意）",
          "社内に5年間保管義務（税務署への提出は不要だが保管は義務）",
        ],
      },
      {
        id: "jumin_zei",
        label: "住民税の切り替え手続き",
        deadline: "初回給与支払い前月末まで",
        deadlineVariant: "warning",
        where: "岩見沢市役所（特別徴収切替の場合）",
        docs: [
          "特別徴収への切替申請書（市区町村所定の書式）",
          "前職で特別徴収だった場合：特別徴収切替申請書または給与支払報告書",
        ],
        notes: [
          "入社時の住民税が「普通徴収（本人振込）」か「特別徴収（給与天引き）」かを確認",
          "前職がある場合：5月まで前職で特別徴収→6月から新会社で切替",
          "新卒・前年収入ゼロの場合は6月以降から課税（住民税ゼロ）",
        ],
      },
      {
        id: "rousai",
        label: "労災保険の確認",
        deadline: "随時（既加入ならOK）",
        deadlineVariant: "default",
        where: "労働基準監督署（既加入なら追加手続き不要）",
        docs: ["既存の労働保険番号の確認"],
        notes: [
          "労災保険は全従業員が自動適用（会社が加入済みなら個別届出は不要）",
          "保険料は年1回の「労働保険の年度更新」で人数・賃金実績を申告",
          "初めて人を雇う場合のみ「労働保険関係成立届」が必要",
        ],
      },
      {
        id: "other_docs",
        label: "その他の社内書類の受領",
        deadline: "入社1ヶ月以内",
        deadlineVariant: "default",
        where: "社内保管",
        docs: [
          "住所・緊急連絡先 届出書",
          "通勤経路・交通費 申請書",
          "銀行口座 振込依頼書（本人名義のみ）",
          "健康診断結果（直近3ヶ月以内または新規実施）",
        ],
        notes: [
          "通勤手当の非課税限度額に注意（マイカー：距離に応じて変動）",
          "健康診断は入社後1年以内に実施義務（従業員数に関わらず義務）",
        ],
      },
    ],
  },
  {
    id: "system",
    label: "システム操作",
    labelSub: "入社日当日",
    color: "success",
    steps: [
      {
        id: "hrmos_register",
        label: "HRMOSに従業員を追加登録",
        deadline: "入社日当日",
        deadlineVariant: "danger",
        where: "HRMOS（ieyasu.co）",
        link: "https://ieyasu.co",
        linkLabel: "HRMOSを開く",
        docs: ["登録情報：氏名・部署・雇用形態・メールアドレス"],
        notes: [
          "登録後に表示される「社員番号」を必ずメモしてください",
          "この社員番号を下の本アプリ登録フォームの「HRMOS連携ID」に入力します",
        ],
      },
      {
        id: "app_register",
        label: "本アプリに従業員を登録",
        deadline: "入社日当日",
        deadlineVariant: "danger",
        where: "本アプリ（下のフォーム）",
        docs: ["氏名・部署・雇用区分・基本給・標準報酬月額・保険加入状況・HRMOS連携ID"],
        notes: [
          "HRMOS連携ID（社員番号）を必ず設定すること",
          "役員は「役員フラグ」をONにし雇用保険をOFFにする",
        ],
      },
    ],
  },
];

// ===== 退社手続きグループ定義 =====

const OFFBOARDING_GROUPS = [
  {
    id: "urgent_off",
    label: "急ぎ対応",
    labelSub: "退職日〜5日以内",
    color: "danger",
    steps: [
      {
        id: "shakai_hoken_off",
        label: "健康保険・厚生年金 喪失届の提出",
        deadline: "退職日翌日から5日以内",
        deadlineVariant: "danger",
        where: "岩見沢 年金事務所",
        docs: [
          "健康保険・厚生年金保険 被保険者資格喪失届",
          "健康保険証の回収（本人・扶養家族分すべて）",
        ],
        notes: [
          "提出期限：退職日翌日から5日以内（法定）",
          "健康保険証は退職日に回収。紛失の場合は「亡失届」を添付",
          "退職後は国民健康保険か任意継続被保険者を選択（本人が手続き）",
        ],
      },
      {
        id: "koyo_hoken_off",
        label: "雇用保険 喪失届・離職票の手続き",
        deadline: "退職翌日から10日以内",
        deadlineVariant: "danger",
        where: "ハローワーク（岩見沢公共職業安定所）",
        docs: [
          "雇用保険 被保険者資格喪失届",
          "離職証明書（本人が希望する場合または59歳以上は必須）",
        ],
        notes: [
          "提出期限：退職翌日から10日以内（雇用保険法）",
          "離職票（ハローワーク発行）は失業給付の申請に必要",
          "59歳以上の退職者は本人の希望に関わらず離職票を交付する義務",
          "自己都合・会社都合で給付制限が異なるため、離職理由の記載に注意",
        ],
      },
    ],
  },
  {
    id: "monthly_after",
    label: "後日対応",
    labelSub: "退職月〜翌々月まで",
    color: "warning",
    steps: [
      {
        id: "jumin_zei_off",
        label: "住民税の異動届（特別徴収→普通徴収）",
        deadline: "退職月の翌月10日まで",
        deadlineVariant: "warning",
        where: "岩見沢市役所",
        docs: ["給与支払報告書 特別徴収にかかる給与所得者異動届出書"],
        notes: [
          "1〜5月退職：残税額を最後の給与・退職金から一括徴収するか、普通徴収に切替",
          "6〜12月退職：普通徴収に切替（本人が自分で支払い）",
          "本人への連絡：退職後に市から納付書が届く旨を事前に伝えること",
        ],
      },
      {
        id: "gensen_choshu",
        label: "源泉徴収票の発行・交付",
        deadline: "退職日から1ヶ月以内",
        deadlineVariant: "warning",
        where: "退職者本人へ交付（社内副本も作成）",
        docs: ["給与所得の源泉徴収票（退職時）"],
        notes: [
          "退職後1ヶ月以内に交付義務（所得税法 第226条）",
          "次の就職先での年末調整や確定申告に使用される",
          "電子交付も可（本人同意が必要）",
        ],
      },
      {
        id: "return_items",
        label: "会社貸与品の回収・退職書類の整備",
        deadline: "退職日当日",
        deadlineVariant: "danger",
        where: "社内",
        docs: [
          "退職届（本人署名済み）",
          "健康保険証（回収済みか確認）",
          "その他貸与品（制服・鍵・IDカード等）",
        ],
        notes: [
          "退職証明書は本人から請求があれば2週間以内に交付義務",
          "競業避止義務・守秘義務誓約書を取得しておくと安心",
        ],
      },
    ],
  },
  {
    id: "system_off",
    label: "システム操作",
    labelSub: "退職日当日",
    color: "success",
    steps: [
      {
        id: "app_retire",
        label: "本アプリで退職処理",
        deadline: "退職日当日",
        deadlineVariant: "danger",
        where: "本アプリ（下のフォーム）",
        docs: [],
        notes: [
          "下の「退職処理を実行」ボタンを押してください",
          "ステータスが「退職」に変わります（給与履歴は残ります）",
        ],
      },
      {
        id: "hrmos_off",
        label: "HRMOSで退職処理",
        deadline: "退職日当日",
        deadlineVariant: "danger",
        where: "HRMOS（ieyasu.co）",
        link: "https://ieyasu.co",
        linkLabel: "HRMOSを開く",
        docs: [],
        notes: ["HRMOS上でも退職手続きを行ってください（勤怠の同期が止まります）"],
      },
    ],
  },
];

// ===== StepCard =====

function StepCard({ step, checked, onToggle }) {
  const [open, setOpen] = useState(false);
  const hasDetails = step.docs.length > 0 || step.notes.length > 0;

  return (
    <div
      className="collapsible"
      style={{
        marginBottom: 6,
        opacity: checked ? 0.6 : 1,
        transition: "opacity 0.15s ease",
        background: checked ? "var(--success-soft)" : "#fff",
        borderColor: checked ? "#bbf7d0" : "var(--line)",
      }}
    >
      <div
        className="collapsible-header"
        style={{
          background: checked ? "var(--success-soft)" : "#f8fafc",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
        }}
        onClick={() => hasDetails && setOpen((v) => !v)}
      >
        {/* チェックボックス */}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => { e.stopPropagation(); onToggle(); }}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 16, height: 16, accentColor: "var(--success)", cursor: "pointer", flexShrink: 0 }}
        />
        {/* タイトル */}
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: checked ? "var(--success)" : "var(--ink)",
            textDecoration: checked ? "line-through" : "none",
            textDecorationColor: "var(--success)",
          }}
        >
          {step.label}
        </span>
        {/* 締切バッジ */}
        <Badge variant={step.deadlineVariant}>{step.deadline}</Badge>
        {/* 展開矢印 */}
        {hasDetails && (
          <span
            className="arrow"
            style={{
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
              color: "var(--muted)",
              fontSize: 12,
            }}
          >
            ▾
          </span>
        )}
      </div>

      {/* 展開エリア */}
      {open && hasDetails && (
        <div className="collapsible-body" style={{ padding: "12px 16px" }}>
          {/* 提出先 */}
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>提出先</span>
            <span>{step.where}</span>
            {step.link && (
              <a
                href={step.link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary"
                style={{ marginLeft: 8 }}
                onClick={(e) => e.stopPropagation()}
              >
                {step.linkLabel || "開く"}
              </a>
            )}
          </div>

          {step.docs.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                必要書類・情報
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {step.docs.map((d, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--ink)" }}>
                    <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }}>■</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step.notes.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                注意事項
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {step.notes.map((n, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--muted)" }}>
                    <span style={{ flexShrink: 0, marginTop: 2 }}>•</span>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 従業員登録フォーム =====

function InlineRegisterForm({ employees, setEmployees, setAttendance, setPaidLeaveBalance, setChangeLogs, settings, onDone }) {
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [jobType, setJobType] = useState("");
  const [basicPay, setBasicPay] = useState("");
  const [stdMonthly, setStdMonthly] = useState("");
  const [employmentType, setEmploymentType] = useState("正社員");
  const [joinDate, setJoinDate] = useState("");
  const [hrmosId, setHrmosId] = useState("");
  const [hasKaigo, setHasKaigo] = useState(false);
  const [hasPension, setHasPension] = useState(true);
  const [hasEmployment, setHasEmployment] = useState(true);
  const [isOfficer, setIsOfficer] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const depts = settings?.departments?.filter((d) => d !== "全部門") || ["運送事業"];
  const jobTypes = settings?.jobTypes || [];

  useEffect(() => { if (isOfficer) setHasEmployment(false); }, [isOfficer]);

  const handleEmploymentTypeChange = (v) => {
    setEmploymentType(v);
    const officer = v === "役員";
    setIsOfficer(officer);
    if (officer) setHasEmployment(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("氏名を入力してください");
    if (!joinDate) return setError("入社日を入力してください");
    const pay = parseInt(basicPay, 10);
    if (isNaN(pay) || pay <= 0) return setError("基本給を正しく入力してください");
    const normalizedHrmos = normalizeHrmosEmployeeNumber(hrmosId);
    if (normalizedHrmos && employees.some((e) => getEmployeeHrmosNumber(e) === normalizedHrmos)) {
      return setError("HRMOS連携IDが他の従業員と重複しています");
    }
    const newId = employees.length > 0 ? Math.max(...employees.map((e) => e.id)) + 1 : 1;
    const emp = {
      id: newId,
      name: name.trim(),
      dept: dept || depts[0] || "",
      jobType: jobType || jobTypes[0] || "",
      basicPay: pay,
      dutyAllowance: 0,
      commuteAllow: 0,
      stdMonthly: parseInt(stdMonthly, 10) || pay,
      avgMonthlyHours: settings?.avgMonthlyHoursDefault || 173.0,
      hasKaigo,
      hasPension: isOfficer ? true : hasPension,
      hasEmployment: isOfficer ? false : hasEmployment,
      dependents: 0,
      residentTax: 0,
      isOfficer,
      employmentType,
      joinDate,
      hrmosEmployeeNumber: normalizedHrmos,
      status: "在籍",
      incomeTaxOverride: null,
    };
    setEmployees((prev) => [...prev, emp]);
    setAttendance((prev) => ({ ...prev, [newId]: { ...EMPTY_ATTENDANCE } }));
    setPaidLeaveBalance((prev) => [...prev, { empId: newId, granted: 0, used: 0, carry: 0 }]);
    setChangeLogs?.((prev) => [...(prev || []), { ts: new Date().toISOString(), type: "入社", detail: `${emp.name}（ID:${newId}）を登録` }]);
    setDone(true);
    onDone?.(emp);
  };

  if (done) {
    return (
      <div className="alert-box success" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>✓ 従業員を登録しました</span>
        <button className="btn btn-sm btn-secondary" onClick={() => setDone(false)}>続けて登録</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <div className="alert-box critical">{error}</div>}

      <div className="form-grid">
        <label className="form-label">
          氏名 *
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" />
        </label>
        <label className="form-label">
          入社日 *
          <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
        </label>
        <label className="form-label">
          部署
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="form-label">
          職種
          <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
            {jobTypes.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </label>
        <label className="form-label">
          雇用区分
          <select value={employmentType} onChange={(e) => handleEmploymentTypeChange(e.target.value)}>
            {["正社員", "嘱託社員", "パート・アルバイト", "役員"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="form-label">
          基本給 *
          <input type="number" value={basicPay} onChange={(e) => setBasicPay(e.target.value)} placeholder="例：200000" />
        </label>
        <label className="form-label">
          標準報酬月額
          <input type="number" value={stdMonthly} onChange={(e) => setStdMonthly(e.target.value)} placeholder="空欄＝基本給と同じ" />
        </label>
        <label className="form-label">
          HRMOS連携ID（社員番号）
          <input value={hrmosId} onChange={(e) => setHrmosId(e.target.value)} placeholder="例：7" />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label className="checkbox-label">
          <input type="checkbox" checked={hasPension} onChange={(e) => setHasPension(e.target.checked)} disabled={isOfficer} />
          厚生年金加入
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={hasKaigo} onChange={(e) => setHasKaigo(e.target.checked)} />
          介護保険加入（40歳以上）
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={hasEmployment} onChange={(e) => setHasEmployment(e.target.checked)} disabled={isOfficer} />
          雇用保険加入
        </label>
      </div>

      {isOfficer && (
        <div className="alert-box warning">役員は雇用保険が適用除外になります</div>
      )}

      <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
        従業員を登録する
      </button>
    </form>
  );
}

// ===== メインコンポーネント =====

export function OnboardingWizardPage({ employees, setEmployees, setAttendance, setPaidLeaveBalance, setChangeLogs, settings, setPage }) {
  const [mode, setMode] = useState("onboard");
  const [checked, setChecked] = useState({});
  const [targetEmpId, setTargetEmpId] = useState("");
  const [retireDate, setRetireDate] = useState("");
  const [retireError, setRetireError] = useState("");
  const [retireDone, setRetireDone] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  const storageKey = `onboarding-checked-${mode}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setChecked(saved ? JSON.parse(saved) : {});
    } catch { setChecked({}); }
  }, [storageKey]);

  const toggleCheck = useCallback((id) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [storageKey]);

  const resetChecked = () => {
    setChecked({});
    try { localStorage.removeItem(storageKey); } catch {}
  };

  const groups = mode === "onboard" ? ONBOARDING_GROUPS : OFFBOARDING_GROUPS;
  const totalSteps = groups.reduce((s, g) => s + g.steps.length, 0);
  const checkedCount = groups.reduce((s, g) => s + g.steps.filter((st) => checked[st.id]).length, 0);
  const progressPct = totalSteps > 0 ? (checkedCount / totalSteps) * 100 : 0;

  const activeEmployees = employees.filter((e) => e.status === "在籍");

  const handleRetire = () => {
    setRetireError("");
    if (!targetEmpId) return setRetireError("退職者を選択してください");
    if (!retireDate) return setRetireError("退職日を入力してください");
    setEmployees((prev) => prev.map((e) =>
      String(e.id) === String(targetEmpId) ? { ...e, status: "退職", retireDate } : e
    ));
    setChangeLogs?.((prev) => {
      const emp = employees.find((e) => String(e.id) === String(targetEmpId));
      return [...(prev || []), { ts: new Date().toISOString(), type: "退職", detail: `${emp?.name || ""}（退職日：${retireDate}）` }];
    });
    setRetireDone(true);
  };

  return (
    <div>
      {/* ページヘッダー */}
      <div className="page-header">
        <h1 className="page-title">入退社手続き</h1>
        {checkedCount > 0 && (
          <button className="btn btn-sm btn-outline" onClick={resetChecked}>
            チェックをリセット
          </button>
        )}
      </div>

      {/* タブ */}
      <div className="tabs">
        <button
          className={`tab-btn${mode === "onboard" ? " active" : ""}`}
          onClick={() => { setMode("onboard"); setRetireDone(false); setRetireError(""); }}
        >
          入社手続き
        </button>
        <button
          className={`tab-btn${mode === "offboard" ? " active" : ""}`}
          onClick={() => { setMode("offboard"); setRetireDone(false); setRetireError(""); }}
          style={mode === "offboard" ? { background: "var(--danger)", borderColor: "var(--danger)" } : {}}
        >
          退社手続き
        </button>
      </div>

      {/* 進捗バー */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
            進捗：<span style={{ color: "var(--ink)", fontWeight: 700, fontFamily: "var(--mono)" }}>{checkedCount}</span> / {totalSteps} 完了
          </span>
          {checkedCount === totalSteps && totalSteps > 0 && (
            <span className="badge badge-success">すべて完了</span>
          )}
        </div>
        <div className="leave-bar">
          <div
            className="leave-bar-fill"
            style={{
              width: `${progressPct}%`,
              background: mode === "offboard" ? "var(--danger)" : "var(--accent)",
            }}
          />
        </div>
      </Card>

      {/* 手続きグループ */}
      {groups.map((group) => (
        <div key={group.id} style={{ marginTop: 16 }}>
          <div className="section-divider">
            <Badge variant={group.color}>{group.label}</Badge>
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
              {group.labelSub}
            </span>
          </div>
          {group.steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              checked={!!checked[step.id]}
              onToggle={() => toggleCheck(step.id)}
            />
          ))}
        </div>
      ))}

      {/* 入社：従業員登録フォーム */}
      {mode === "onboard" && (
        <div style={{ marginTop: 24 }}>
          <Card
            title="従業員をアプリに登録"
            className={showRegisterForm ? "" : ""}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showRegisterForm ? 16 : 0 }}>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                HRMOSへの登録が完了したら、このアプリにも従業員情報を登録してください。
              </p>
              <button
                className={`btn btn-sm ${showRegisterForm ? "btn-secondary" : "btn-primary"}`}
                onClick={() => setShowRegisterForm((v) => !v)}
                style={{ flexShrink: 0, marginLeft: 12 }}
              >
                {showRegisterForm ? "閉じる" : "登録フォームを開く"}
              </button>
            </div>
            {showRegisterForm && (
              <InlineRegisterForm
                employees={employees}
                setEmployees={setEmployees}
                setAttendance={setAttendance}
                setPaidLeaveBalance={setPaidLeaveBalance}
                setChangeLogs={setChangeLogs}
                settings={settings}
                onDone={() => setShowRegisterForm(false)}
              />
            )}
          </Card>
        </div>
      )}

      {/* 退社：退職処理 */}
      {mode === "offboard" && (
        <div style={{ marginTop: 24 }}>
          <Card title="退職処理を実行">
            {retireDone ? (
              <div className="alert-box success">
                ✓ 退職処理が完了しました
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {retireError && <div className="alert-box critical">{retireError}</div>}
                <div className="form-grid">
                  <label className="form-label">
                    退職者
                    <select value={targetEmpId} onChange={(e) => setTargetEmpId(e.target.value)}>
                      <option value="">選択してください</option>
                      {activeEmployees.map((e) => (
                        <option key={e.id} value={String(e.id)}>{e.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="form-label">
                    退職日
                    <input type="date" value={retireDate} onChange={(e) => setRetireDate(e.target.value)} />
                  </label>
                </div>
                <div>
                  <button className="btn btn-danger" onClick={handleRetire}>
                    退職処理を実行する
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
