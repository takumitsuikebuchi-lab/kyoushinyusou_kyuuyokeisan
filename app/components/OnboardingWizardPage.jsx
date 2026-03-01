"use client";
import React, { useState, useEffect, useCallback } from "react";
import { EMPTY_ATTENDANCE, fiscalYearFromDate, getEmployeeHrmosNumber, normalizeHrmosEmployeeNumber } from "@/lib/date-utils";

// ===== 入社手続きグループ定義 =====

const ONBOARDING_GROUPS = [
  {
    id: "urgent",
    label: "⚡ 急ぎ対応（入社日当日〜3日以内）",
    steps: [
      {
        id: "contract",
        label: "雇用契約書・労働条件通知書の署名",
        deadline: "入社日当日",
        where: "社内（会社保管）",
        details: {
          docs: ["労働条件通知書（正社員・嘱託）", "委任契約書（役員の場合）", "就業規則の写し"],
          notes: [
            "正社員・嘱託は「労働条件通知書」を必ず交付（労働基準法 第15条）",
            "役員は「委任契約書」。雇用契約とは別物",
            "勤務時間・休日・賃金・勤務場所を明記すること",
            "会社用・本人用の2部作成。書類は5年間保管義務",
          ],
        },
      },
      {
        id: "mynumber",
        label: "マイナンバーの収集",
        deadline: "入社日〜1週間以内",
        where: "社内（厳重保管）",
        details: {
          docs: [
            "マイナンバーカードのコピー（表・裏）",
            "または：通知カードのコピー＋身分証（運転免許証等）のコピー",
            "扶養家族がいる場合：家族全員のマイナンバー",
          ],
          notes: [
            "社会保険・雇用保険・年末調整などすべての手続きで必要",
            "受け取った書類は施錠できる場所に保管（番号法で厳格管理が義務）",
            "目的外の使用・第三者提供は法律で禁止",
          ],
        },
      },
      {
        id: "shakai_hoken",
        label: "健康保険・厚生年金 加入届",
        deadline: "入社日から5日以内",
        where: "年金事務所（岩見沢 年金事務所）",
        details: {
          docs: [
            "健康保険・厚生年金保険 被保険者資格取得届",
            "扶養家族がいる場合：被扶養者（異動）届",
            "扶養家族のマイナンバー・続柄確認書類",
          ],
          notes: [
            "提出期限：資格取得日（入社日）から5日以内（法定）",
            "短時間労働者は週20時間以上・月額賃金8.8万円以上等の条件を確認",
            "役員も原則加入（報酬があれば）",
            "年金受給者で短時間勤務の場合は加入不要な場合あり（要確認）",
          ],
        },
      },
      {
        id: "koyo_hoken",
        label: "雇用保険 加入届",
        deadline: "入社翌月10日まで",
        where: "ハローワーク（岩見沢公共職業安定所）",
        details: {
          docs: [
            "雇用保険 被保険者資格取得届",
            "賃金台帳の写し（初回賃金確定後）",
            "マイナンバー記載の書類",
          ],
          notes: [
            "提出期限：資格取得日の翌月10日まで（雇用保険法 第7条）",
            "週20時間以上かつ31日以上雇用見込みで加入義務",
            "役員・65歳以上の日雇い等は適用除外",
            "被保険者番号は前職のものを引き継ぐ（ハローワークで確認）",
          ],
        },
      },
    ],
  },
  {
    id: "monthly",
    label: "📋 月内対応（入社月中〜翌月まで）",
    steps: [
      {
        id: "shotoku_zei",
        label: "扶養控除等申告書の受領（所得税）",
        deadline: "最初の給与支払い日まで",
        where: "社内保管（税務署への提出は原則不要）",
        details: {
          docs: [
            "給与所得者の扶養控除等（異動）申告書",
            "扶養家族がいる場合：続柄・マイナンバー確認書類",
          ],
          notes: [
            "甲欄（源泉徴収税額表）を適用するために必須",
            "提出がない場合は乙欄（高い税率）で徴収",
            "毎年1回、年末調整前（または入社時）に提出してもらう",
            "他の会社でも勤務している場合は1社にしか提出できない（副業注意）",
            "社内に5年間保管義務（税務署への提出は不要だが保管は義務）",
          ],
        },
      },
      {
        id: "jumin_zei",
        label: "住民税の切り替え手続き",
        deadline: "初回給与支払い日の前月末まで（普通徴収→特別徴収切替時）",
        where: "市区町村（岩見沢市役所など）",
        details: {
          docs: [
            "特別徴収への切替申請書（市区町村所定の書式）",
            "前職で特別徴収だった場合：特別徴収切替申請書 または 給与支払報告書",
          ],
          notes: [
            "入社月の住民税は「普通徴収（本人振込）」か「特別徴収（給与天引）」を確認",
            "前職があれば5月まで前職で特別徴収→6月から新しい会社で特別徴収に切替",
            "新卒・住民税ゼロの場合は6月以降から課税（前年収入がない）",
            "退職者から引き継ぐ場合は「異動届出書」で処理",
          ],
        },
      },
      {
        id: "rousai",
        label: "労災保険の確認",
        deadline: "随時",
        where: "労働基準監督署（加入済みなら手続き不要）",
        details: {
          docs: ["既存の労働保険番号の確認（新規採用なら追加手続き不要）"],
          notes: [
            "労災保険は全従業員が自動適用（会社が加入していれば個別届出は不要）",
            "保険料は年1回（労働保険の年度更新）で人数・賃金実績を申告",
            "初めて人を雇う場合は「労働保険関係成立届」が必要（今回は既加入）",
          ],
        },
      },
      {
        id: "other_docs",
        label: "その他の社内書類の受領",
        deadline: "入社1ヶ月以内",
        where: "社内保管",
        details: {
          docs: [
            "住所・緊急連絡先 届出書",
            "通勤経路・交通費 申請書",
            "銀行口座 振込依頼書",
            "健康診断結果（直近3ヶ月以内のもの、または新規実施）",
          ],
          notes: [
            "通勤手当は非課税限度額に注意（電車：月15万円、マイカー：距離に応じて変動）",
            "健康診断は入社後1年以内に必ず実施義務（常時50名未満でも義務）",
            "口座は本人名義のみ（家族名義口座への振込は原則NG）",
          ],
        },
      },
    ],
  },
  {
    id: "system",
    label: "🖥️ システム操作（本アプリ）",
    steps: [
      {
        id: "hrmos_register",
        label: "HRMOSに従業員を追加登録",
        deadline: "入社日当日",
        where: "HRMOS（ieyasu.co）",
        details: {
          docs: ["HRMOSへの新規登録情報（氏名・部署・雇用形態・メールアドレス）"],
          notes: [
            "登録後に表示される「社員番号」を必ずメモ",
            "社員番号は後ほど本アプリのHRMOS連携IDに入力する",
          ],
        },
        link: "https://ieyasu.co",
        linkLabel: "HRMOSを開く",
      },
      {
        id: "app_register",
        label: "本アプリに従業員を登録（下のフォーム）",
        deadline: "入社日当日",
        where: "本アプリ",
        details: {
          docs: ["氏名・部署・雇用形態・基本給・標準報酬月額・保険加入状況"],
          notes: [
            "HRMOS社員番号（HRMOS連携ID）を必ず設定すること",
            "標準報酬月額は社保の等級確認が必要",
            "役員は「役員フラグ」をONにし雇用保険をOFFにする",
          ],
        },
      },
    ],
  },
];

// ===== 退社手続きグループ定義 =====

const OFFBOARDING_GROUPS = [
  {
    id: "urgent",
    label: "⚡ 急ぎ対応（退職日当日〜5日以内）",
    steps: [
      {
        id: "shakai_hoken_off",
        label: "健康保険・厚生年金 喪失届",
        deadline: "退職日翌日から5日以内",
        where: "年金事務所（岩見沢 年金事務所）",
        details: {
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
      },
      {
        id: "koyo_hoken_off",
        label: "雇用保険 喪失届・離職票発行",
        deadline: "退職翌日から10日以内",
        where: "ハローワーク（岩見沢公共職業安定所）",
        details: {
          docs: [
            "雇用保険 被保険者資格喪失届",
            "離職証明書（本人が希望する場合または59歳以上は必須）",
          ],
          notes: [
            "提出期限：退職翌日から10日以内（雇用保険法）",
            "離職票（ハローワーク発行）は失業給付の申請に必要",
            "59歳以上の退職者は本人の希望に関わらず離職票を交付する義務がある",
            "自己都合・会社都合で給付制限が異なるため、離職理由の記載に注意",
          ],
        },
      },
    ],
  },
  {
    id: "monthly_after",
    label: "📋 後日対応（退職月〜翌々月まで）",
    steps: [
      {
        id: "jumin_zei_off",
        label: "住民税の異動届（特別徴収→普通徴収）",
        deadline: "退職月の翌月10日まで",
        where: "市区町村（岩見沢市役所など）",
        details: {
          docs: ["給与支払報告書 特別徴収にかかる給与所得者異動届出書"],
          notes: [
            "1月1日〜5月31日退職：残税額を最後の給与・退職金から一括徴収するか、普通徴収に切替",
            "6月1日〜12月31日退職：普通徴収に切替（本人が自分で支払う）",
            "本人への連絡：退職後に市から納付書が届く旨を伝えること",
          ],
        },
      },
      {
        id: "gensen_choshu",
        label: "源泉徴収票の発行",
        deadline: "退職日から1ヶ月以内",
        where: "退職者本人へ交付（社内保管用の副本も作成）",
        details: {
          docs: ["給与所得の源泉徴収票（退職時）"],
          notes: [
            "退職後1ヶ月以内に交付義務（所得税法 第226条）",
            "次の就職先での年末調整や確定申告に使われる",
            "電子交付も可（本人同意が必要）",
          ],
        },
      },
      {
        id: "return_items",
        label: "会社貸与品の回収・退職書類の整備",
        deadline: "退職日当日",
        where: "社内",
        details: {
          docs: [
            "退職届（本人署名済み）",
            "健康保険証（回収済みか確認）",
            "その他貸与品チェックリスト（制服・鍵・IDカード等）",
          ],
          notes: [
            "退職証明書は本人から請求があれば2週間以内に交付義務",
            "競業避止義務・守秘義務誓約書を取得しておくと安心",
          ],
        },
      },
    ],
  },
  {
    id: "system_off",
    label: "🖥️ システム操作（本アプリ）",
    steps: [
      {
        id: "app_retire",
        label: "本アプリで退職処理（下のボタン）",
        deadline: "退職日当日",
        where: "本アプリ",
        details: {
          docs: [],
          notes: [
            "下の「退職処理を実行」ボタンを押してください",
            "ステータスが「退職」に変わります",
            "給与計算・勤怠には影響しません（履歴は残ります）",
          ],
        },
      },
      {
        id: "hrmos_off",
        label: "HRMOSで退職処理",
        deadline: "退職日当日",
        where: "HRMOS（ieyasu.co）",
        details: {
          docs: [],
          notes: [
            "HRMOS上でも退職手続きを行ってください",
            "勤怠の同期が止まります",
          ],
        },
        link: "https://ieyasu.co",
        linkLabel: "HRMOSを開く",
      },
    ],
  },
];

// ===== StepCard コンポーネント =====

function StepCard({ step, checked, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border rounded-lg mb-2 transition-all ${checked ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start gap-3 p-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 w-4 h-4 accent-green-600 flex-shrink-0 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-medium text-sm ${checked ? "line-through text-gray-400" : "text-gray-800"}`}>
              {step.label}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
              {step.deadline}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">提出先：{step.where}</div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0 mt-0.5"
          title={expanded ? "閉じる" : "詳細を見る"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-100 mt-1 pt-2">
          {step.details.docs.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-semibold text-gray-600 mb-1">必要書類・情報</div>
              <ul className="space-y-1">
                {step.details.docs.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                    <span className="text-blue-400 mt-0.5 flex-shrink-0">📄</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {step.details.notes.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">注意事項</div>
              <ul className="space-y-1">
                {step.details.notes.map((n, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <span className="flex-shrink-0 mt-0.5">•</span>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {step.link && (
            <a
              href={step.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              {step.linkLabel || step.link}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ===== インライン従業員登録フォーム =====

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

  useEffect(() => {
    if (isOfficer) setHasEmployment(false);
  }, [isOfficer]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("氏名を入力してください");
    if (!joinDate) return setError("入社日を入力してください");
    const pay = parseInt(basicPay, 10);
    if (isNaN(pay) || pay <= 0) return setError("基本給を正しく入力してください");

    const newId = employees.length > 0 ? Math.max(...employees.map((e) => e.id)) + 1 : 1;
    const normalizedHrmos = normalizeHrmosEmployeeNumber(hrmosId);

    // HRMOS連携ID重複チェック
    if (normalizedHrmos && employees.some((e) => getEmployeeHrmosNumber(e) === normalizedHrmos)) {
      return setError("HRMOS連携IDが他の従業員と重複しています");
    }

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

    const fy = fiscalYearFromDate(joinDate);
    const grantedDays = 0;

    setEmployees((prev) => [...prev, emp]);
    setAttendance((prev) => ({ ...prev, [newId]: { ...EMPTY_ATTENDANCE } }));
    setPaidLeaveBalance((prev) => [...prev, { empId: newId, granted: grantedDays, used: 0, carry: 0 }]);
    setChangeLogs?.((prev) => [...(prev || []), {
      ts: new Date().toISOString(),
      type: "入社",
      detail: `${emp.name}（ID:${newId}）を登録`,
    }]);

    setDone(true);
    onDone?.(emp);
  };

  if (done) {
    return (
      <div className="bg-green-50 border border-green-300 rounded-lg p-4 text-center">
        <div className="text-green-700 font-semibold mb-1">✓ 従業員を登録しました</div>
        <button onClick={() => setDone(false)} className="text-xs text-green-600 underline">
          続けて別の従業員を登録
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">氏名 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="例：山田 太郎" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">入社日 *</label>
          <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">部署</label>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">職種</label>
          <select value={jobType} onChange={(e) => setJobType(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
            {jobTypes.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">雇用区分</label>
          <select value={employmentType} onChange={(e) => { setEmploymentType(e.target.value); setIsOfficer(e.target.value === "役員"); }} className="w-full border rounded px-2 py-1.5 text-sm">
            {["正社員", "嘱託社員", "パート・アルバイト", "役員"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">基本給 *</label>
          <input type="number" value={basicPay} onChange={(e) => setBasicPay(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="例：200000" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">標準報酬月額</label>
          <input type="number" value={stdMonthly} onChange={(e) => setStdMonthly(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="空欄＝基本給と同じ" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">HRMOS連携ID（社員番号）</label>
          <input value={hrmosId} onChange={(e) => setHrmosId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="例：7" />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={hasPension} onChange={(e) => setHasPension(e.target.checked)} disabled={isOfficer} className="accent-blue-600" />
          厚生年金加入
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={hasKaigo} onChange={(e) => setHasKaigo(e.target.checked)} className="accent-blue-600" />
          介護保険加入（40歳以上）
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={hasEmployment} onChange={(e) => setHasEmployment(e.target.checked)} disabled={isOfficer} className="accent-blue-600" />
          雇用保険加入
        </label>
      </div>
      {isOfficer && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          役員：雇用保険は自動的にOFFになります（適用外）
        </div>
      )}
      <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 text-sm">
        従業員を登録する
      </button>
    </form>
  );
}

// ===== メインコンポーネント =====

export function OnboardingWizardPage({ employees, setEmployees, setAttendance, setPaidLeaveBalance, setChangeLogs, settings, setPage }) {
  const [mode, setMode] = useState("onboard"); // "onboard" | "offboard"
  const [checked, setChecked] = useState({});
  const [targetEmpId, setTargetEmpId] = useState("");
  const [retireDate, setRetireDate] = useState("");
  const [retireError, setRetireError] = useState("");
  const [retireDone, setRetireDone] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  // チェック状態をlocalStorageに保存
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

  // 退職処理
  const activeEmployees = employees.filter((e) => e.status === "在籍");

  const handleRetire = () => {
    setRetireError("");
    if (!targetEmpId) return setRetireError("退職者を選択してください");
    if (!retireDate) return setRetireError("退職日を入力してください");
    setEmployees((prev) => prev.map((e) =>
      String(e.id) === String(targetEmpId)
        ? { ...e, status: "退職", retireDate }
        : e
    ));
    setChangeLogs?.((prev) => {
      const emp = employees.find((e) => String(e.id) === String(targetEmpId));
      return [...(prev || []), { ts: new Date().toISOString(), type: "退職", detail: `${emp?.name || ""}（退職日：${retireDate}）` }];
    });
    setRetireDone(true);
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* タブ切替 */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setMode("onboard"); setRetireDone(false); setRetireError(""); }}
          className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors ${mode === "onboard" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          入社手続き
        </button>
        <button
          onClick={() => { setMode("offboard"); setRetireDone(false); setRetireError(""); }}
          className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors ${mode === "offboard" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          退社手続き
        </button>
      </div>

      {/* 進捗バー */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500">進捗：{checkedCount} / {totalSteps} 完了</span>
          {checkedCount > 0 && (
            <button onClick={resetChecked} className="text-xs text-gray-400 hover:text-gray-600 underline">
              リセット
            </button>
          )}
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${mode === "onboard" ? "bg-blue-500" : "bg-red-500"}`}
            style={{ width: `${totalSteps > 0 ? (checkedCount / totalSteps) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* チェックリスト */}
      {groups.map((group) => (
        <div key={group.id} className="mb-6">
          <h2 className="text-sm font-bold text-gray-700 mb-3 border-b pb-1">{group.label}</h2>
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
        <div className="mt-4 border border-blue-200 rounded-xl p-4 bg-blue-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-sm text-blue-800">従業員をアプリに登録</h3>
            <button
              onClick={() => setShowRegisterForm((v) => !v)}
              className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              {showRegisterForm ? "フォームを閉じる" : "登録フォームを開く"}
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
        </div>
      )}

      {/* 退社：退職処理ボタン */}
      {mode === "offboard" && (
        <div className="mt-4 border border-red-200 rounded-xl p-4 bg-red-50">
          <h3 className="font-semibold text-sm text-red-800 mb-3">退職処理を実行</h3>
          {retireDone ? (
            <div className="text-green-700 font-medium text-sm">✓ 退職処理が完了しました</div>
          ) : (
            <div className="space-y-3">
              {retireError && <div className="text-red-600 text-sm bg-red-100 border border-red-300 rounded p-2">{retireError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">退職者</label>
                  <select value={targetEmpId} onChange={(e) => setTargetEmpId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                    <option value="">選択してください</option>
                    {activeEmployees.map((e) => (
                      <option key={e.id} value={String(e.id)}>{e.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">退職日</label>
                  <input type="date" value={retireDate} onChange={(e) => setRetireDate(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" />
                </div>
              </div>
              <button onClick={handleRetire} className="w-full py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 text-sm">
                退職処理を実行する
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
