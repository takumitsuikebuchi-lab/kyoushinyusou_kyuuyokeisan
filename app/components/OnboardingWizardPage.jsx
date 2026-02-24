"use client";
import React, { useState, useEffect } from "react";
import { DocumentUploadPanel } from "@/app/components/DocumentUploadPanel";
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
        guide: {
            summary: "入社前または入社当日に必ず実施します。書類は会社と本人各1部保管してください。",
            items: [
                "正社員・嘱託：「労働条件通知書」は法律上の交付義務があります（必须）",
                "役員：「委任契約書」を用意します（雇用契約書ではありません）",
                "記載必須項目：労働時間、休日、賃金、就業場所、契約期間など",
                "書類は5年間（旧3年）の保管義務があります",
            ],
            links: [],
        },
    },
    {
        id: "mynumber",
        label: "マイナンバーの収集",
        kind: "external",
        note: "社会保険・税務申告に必要です。マイナンバーカードのコピーまたは通知カード＋身分証を受領します。",
        guide: {
            summary: "マイナンバーは社会保険の加入届・年末調整・源泉徴収票の作成に必要です。適切に管理する義務があります。",
            items: [
                "マイナンバーカード（表裏）のコピー　または　通知カード＋運転免許証等の身分証のコピー",
                "収集した書類は施錠できる場所に保管し、目的外利用は禁止です",
                "扶養家族がいる場合は、家族分のマイナンバーも収集します",
                "派遣社員・パートも同様に必要です",
            ],
            links: [],
        },
    },
    {
        id: "hrmos_register",
        label: "HRMOSに従業員を登録",
        kind: "external",
        link: "https://ieyasu.co",
        linkLabel: "HRMOSを開く",
        note: "HRMOS勤怠管理システムに新規従業員を追加し、従業員番号（HRMOS連携ID）を控えておいてください。",
        guide: {
            summary: "HRMOSへの登録後、表示される「従業員番号」を必ずメモしてください。次のステップで使います。",
            items: [
                "HRMOS（ieyasu.co）にログインし、「従業員管理」から「新規追加」",
                "氏名・入社日・所属・雇用区分を入力して保存",
                "登録後に表示される「従業員番号（例: 10023）」を控える",
                "この番号が「HRMOS連携ID」として次のステップで必要になります",
            ],
            links: [{ label: "HRMOS勤怠 ログイン", url: "https://ieyasu.co" }],
        },
    },
    {
        id: "system_register",
        label: "このシステムに従業員を登録",
        kind: "system",
        action: "register",
        note: "HRMOSで確認した従業員番号を使って、このシステムに従業員情報を登録します。",
        guide: {
            summary: "「登録フォームを開く」ボタンから必要事項を入力します。不明な項目はテンプレートを使うと便利です。",
            items: [
                "HRMOS連携ID：前のステップで控えた従業員番号を入力",
                "標準報酬月額：基本給＋手当合計をもとに、国の等級表から近い金額を選択（社会保険料計算に使用）",
                "住民税：前職源泉徴収票や市区町村の通知書に記載の月額を入力（不明な場合は0でOK、後で変更可）",
                "雇用区分テンプレートを使うと初期値が自動設定されて便利です",
            ],
            links: [],
        },
    },
    {
        id: "shakai_hoken",
        label: "社会保険（健康保険・厚生年金）加入届の提出",
        kind: "external",
        deadline: "入社日から5日以内",
        deadlineUrgent: true,
        note: "資格取得日（入社日）から5日以内に年金事務所へ提出します。被扶養者がいる場合は扶養届も一緒に。",
        guide: {
            summary: "「被保険者資格取得届」を所轄の年金事務所に提出します。e-Govからオンライン申請もできます。",
            items: [
                "書類名：「健康保険・厚生年金保険 被保険者資格取得届」",
                "提出先：会社所在地を管轄する年金事務所（窓口持参 または 郵送 または e-Gov電子申請）",
                "必要情報：氏名・生年月日・マイナンバー・入社日・報酬月額（標準報酬月額）",
                "扶養家族がいる場合は「被扶養者（異動）届」も同時提出",
                "健康保険証は手続き完了後に事務所から交付されます（数日〜2週間かかることがあります）",
                "⚠️ 60歳以上・週30時間未満のパートは加入不要の場合あり（要確認）",
            ],
            links: [
                { label: "日本年金機構 資格取得届（記載例）", url: "https://www.nenkin.go.jp/service/kounen/todokesho/" },
                { label: "e-Gov 電子申請ポータル", url: "https://shinsei.e-gov.go.jp/" },
                { label: "全国の年金事務所を探す", url: "https://www.nenkin.go.jp/section/soudan/" },
            ],
            forms: [
                {
                    name: "健康保険・厚生年金保険 被保険者資格取得届",
                    url: "https://www.nenkin.go.jp/service/kounen/todokesho/hihokensha/20141210.html",
                    note: "日本年金機構 公式ページ。リンク先からPDFをダウンロードし、印刷して記入→年金事務所へ提出",
                },
                {
                    name: "健康保険 被扶養者（異動）届（扶養家族がいる場合）",
                    url: "https://www.nenkin.go.jp/service/kounen/todokesho/hihokensha/20141211.html",
                    note: "扶養に入れる家族がいる場合のみ。上の届と一緒に提出",
                },
            ],
        },
    },
    {
        id: "koyo_hoken",
        label: "雇用保険 資格取得届の提出",
        kind: "external",
        deadline: "入社月の翌月10日まで",
        deadlineUrgent: false,
        note: "資格取得日の属する月の翌月10日までにハローワークへ提出します。",
        guide: {
            summary: "「雇用保険被保険者資格取得届」をハローワークに提出します。e-Gov からオンライン申請も可能です。",
            items: [
                "書類名：「雇用保険被保険者資格取得届」",
                "提出先：事業所所在地を管轄するハローワーク（窓口 または e-Gov電子申請）",
                "必要情報：氏名・マイナンバー・入社日・雇用形態・週所定労働時間・賃金",
                "⚠️ 週所定労働時間が20時間以上かつ31日以上継続見込みの場合に加入義務あり",
                "役員・個人事業主は原則加入不可",
                "提出後に「雇用保険被保険者証」が発行されます（新卒初就職は新規発行）",
            ],
            links: [
                { label: "ハローワーク 雇用保険の手続き", url: "https://www.hellowork.mhlw.go.jp/insurance/insurance_guide.html" },
                { label: "e-Gov 電子申請ポータル", url: "https://shinsei.e-gov.go.jp/" },
                { label: "全国のハローワーク", url: "https://www.hellowork.mhlw.go.jp/offices/list.html" },
            ],
            forms: [
                {
                    name: "雇用保険 被保険者資格取得届",
                    url: "https://www.hellowork.mhlw.go.jp/multiContents/index.html?action=displayContents&screenId=100001000000&contentsType=kourei",
                    note: "ハローワーク インターネットサービス 書類一覧。リンク先ページ内の「雇用保険被保険者資格取得届」からPDFをダウンロード",
                },
            ],
        },
    },
    {
        id: "jumin_tax",
        label: "住民税の特別徴収 切替手続き（前職がある場合）",
        kind: "external",
        note: "前職の会社から「給与所得者異動届出書」を取り寄せ、当社の市区町村へ提出して特別徴収の切り替えを行います。",
        guide: {
            summary: "前職がある場合のみ必要です。新卒・初就職・無職期間があった方は不要なことが多いです。",
            items: [
                "前職の会社に「給与所得者異動届出書」の作成を依頼し、受け取る",
                "受け取った書類に当社の情報を記入し、市区町村の税務課へ提出",
                "手続きが完了すると、翌月以降の住民税が給与から天引きされます",
                "前職なし・新卒の場合：6月頃に市区町村から通知が来るまでそのまま待つ",
                "住民税額が変わったら、このシステムの従業員情報画面で「住民税」欄を更新してください",
            ],
            links: [],
        },
    },
    {
        id: "payroll",
        label: "翌月の給与計算に含める",
        kind: "system",
        action: "go_payroll",
        note: "登録後、翌月の給与計算画面で新しい従業員が対象になっているか確認します。",
        guide: {
            summary: "「給与計算ページへ」ボタンで遷移し、対象月に新しい従業員が表示されているかを確認してください。",
            items: [
                "月次給与計算ページで「対象月」を選択し、従業員が一覧に表示されているか確認",
                "入社日が月の途中の場合は日割り計算が必要です（勤怠の実労働日数を入力）",
                "HRMOS連携で勤務データを取り込むと勤怠が自動入力されます",
            ],
            links: [],
        },
    },
];

const OFFBOARDING_STEPS = [
    {
        id: "confirm_date",
        label: "退職日・最終出勤日の確定",
        kind: "input",
        note: "本人・会社双方で合意した退職日を確認します。退職届の受理日も記録しておいてください。",
        guide: {
            summary: "退職日は書面（退職届・合意書）で確認します。口頭のみは後でトラブルになるため注意。",
            items: [
                "退職届（または合意退職書）を受領し、退職日を書面で確認する",
                "最終出勤日・有給休暇の消化日数も合わせて確認",
                "社会保険の資格喪失日は「退職日の翌日」になります（重要）",
                "給与の締め日・支払い日を確認し、最終給与の計算タイミングを決める",
            ],
            links: [],
        },
    },
    {
        id: "hrmos_offboard",
        label: "HRMOSで退職処理",
        kind: "external",
        link: "https://ieyasu.co",
        linkLabel: "HRMOSを開く",
        note: "HRMOS勤怠管理システムで対象従業員の退職日を入力し、退職処理を行います。",
        guide: {
            summary: "HRMOSで退職処理をしないと、勤怠データの取込に影響が出ることがあります。",
            items: [
                "HRMOS にログインし、「従業員管理」から対象者を検索",
                "退職日を入力して退職処理を実行",
                "最終月の勤怠データが正しく記録されているか確認してから処理する",
            ],
            links: [{ label: "HRMOS勤怠 ログイン", url: "https://ieyasu.co" }],
        },
    },
    {
        id: "system_offboard",
        label: "このシステムで退職処理",
        kind: "system",
        action: "offboard",
        note: "対象従業員を選んで退職処理を実行します。雇用保険が自動でOFFになります。",
        guide: {
            summary: "対象者を選んで「退職処理を実行」を押すと、ステータスが「退職」に変わり給与計算対象から外れます。",
            items: [
                "対象者を選択し、退職日が正しいことを確認してから実行",
                "実行後は元に戻せません。必ずHRMOSでの処理が完了してから行ってください",
                "雇用保険フラグは自動でOFFになります",
            ],
            links: [],
        },
    },
    {
        id: "shakai_loss",
        label: "社会保険 資格喪失届の提出",
        kind: "external",
        deadline: "退職日翌日から5日以内",
        deadlineUrgent: true,
        note: "退職日の翌日（資格喪失日）から5日以内に年金事務所へ提出します。健康保険証を回収・返却してください。",
        guide: {
            summary: "「被保険者資格喪失届」を年金事務所に提出します。健康保険証の回収も忘れずに。",
            items: [
                "書類名：「健康保険・厚生年金保険 被保険者資格喪失届」",
                "提出先：所轄の年金事務所（窓口 / 郵送 / e-Gov）",
                "健康保険証を本人から回収して同封します（紛失の場合は「亡失届」が必要）",
                "資格喪失日は退職日の翌日です（例：3月31日退職 → 喪失日は4月1日）",
                "扶養家族がいた場合は、家族の保険証も回収します",
                "退職者が任意継続を希望する場合は、退職後20日以内に本人が年金事務所に手続きします",
            ],
            links: [
                { label: "日本年金機構 資格喪失届（記載例）", url: "https://www.nenkin.go.jp/service/kounen/todokesho/" },
                { label: "e-Gov 電子申請ポータル", url: "https://shinsei.e-gov.go.jp/" },
            ],
            forms: [
                {
                    name: "健康保険・厚生年金保険 被保険者資格喪失届",
                    url: "https://www.nenkin.go.jp/service/kounen/todokesho/hihokensha/20141210.files/1210-22.pdf",
                    note: "日本年金機構 公式PDF。健康保険証と一緒に年金事務所へ提出",
                },
            ],
        },
    },
    {
        id: "koyo_loss",
        label: "雇用保険 資格喪失届の提出",
        kind: "external",
        deadline: "退職月の翌々月10日まで",
        deadlineUrgent: false,
        note: "退職した日の翌々月10日までにハローワークへ提出します。離職票が必要な場合は一緒に申請します。",
        guide: {
            summary: "「雇用保険被保険者資格喪失届」をハローワークに提出します。離職票が必要な方には忘れずに発行します。",
            items: [
                "書類名：「雇用保険被保険者資格喪失届」",
                "提出先：所轄のハローワーク（窓口 / e-Gov）",
                "退職者が失業給付を受けたい場合は「離職票（1・2）」の発行も同時に申請する",
                "離職票は退職者本人への交付義務があります（請求があった場合）",
                "手続きが完了すると「雇用保険被保険者資格喪失確認通知書」が交付されます",
            ],
            links: [
                { label: "ハローワーク 資格喪失届の手続き", url: "https://www.hellowork.mhlw.go.jp/insurance/insurance_guide.html" },
                { label: "e-Gov 電子申請ポータル", url: "https://shinsei.e-gov.go.jp/" },
            ],
            forms: [
                {
                    name: "雇用保険 被保険者資格喪失届",
                    url: "https://www.hellowork.mhlw.go.jp/doc/koyou_hihokensha_shikaku_soshitsu_todoke.pdf",
                    note: "ハローワーク インターネットサービス 公式PDF",
                },
                {
                    name: "離職証明書（離職票が必要な場合）",
                    url: "https://www.hellowork.mhlw.go.jp/doc/rishoku_shomeisho.pdf",
                    note: "退職者が失業給付を申請する場合のみ必要",
                },
            ],
        },
    },
    {
        id: "final_payroll",
        label: "最終月の給与計算・確定",
        kind: "system",
        action: "go_payroll",
        note: "最終出勤月の給与を計算・確定します。日割り計算が必要な場合は勤怠を正しく入力してください。",
        guide: {
            summary: "月途中退職の場合は日割り計算が必要です。有給消化分の扱いも確認してください。",
            items: [
                "月途中退職：当月の実働日数÷所定労働日数×月給 で日割り計算",
                "有給休暇の残日数を消化している場合は、有給分も含めて計算",
                "社会保険料：退職月は徴収しない（資格喪失月の保険料は不要）のが原則",
                "所得税の源泉徴収は通常通り行い、年末調整または退職後の確定申告で精算",
            ],
            links: [],
        },
    },
    {
        id: "gensen",
        label: "源泉徴収票の発行（翌年1月31日まで）",
        kind: "external",
        deadline: "退職年の翌年1月31日まで",
        deadlineUrgent: false,
        note: "退職した年の源泉徴収票を、退職者に翌年1月31日までに交付する義務があります。マネーフォワードで発行できます。",
        guide: {
            summary: "源泉徴収票の交付は法律上の義務です。中途退職者は翌職場や確定申告で使います。",
            items: [
                "交付期限：退職した年の翌年1月31日まで（できれば退職後1ヶ月以内が理想）",
                "マネーフォワード給与で源泉徴収票を発行できます",
                "退職者の確定申告・次の会社での年末調整に使います",
                "従業員の同意がある場合は電子交付（メール添付・PDF送付）も可能",
                "発行した記録（日付・交付方法）を残しておくことをお勧めします",
            ],
            links: [
                { label: "国税庁 源泉徴収票の交付義務", url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2792.htm" },
            ],
        },
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

// ===== 詳細ガイドパネル =====
const GuidePanel = ({ guide }) => {
    if (!guide) return null;
    return (
        <div style={{
            marginTop: 10,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 13,
            lineHeight: 1.7,
        }}>
            {guide.summary && (
                <div style={{ color: "#1e293b", fontWeight: 600, marginBottom: 8 }}>
                    {guide.summary}
                </div>
            )}
            {guide.items && guide.items.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 20, color: "#475569" }}>
                    {guide.items.map((item, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{item}</li>
                    ))}
                </ul>
            )}
            {guide.links && guide.links.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {guide.links.map((link, i) => (
                        <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                fontSize: 12, color: "#2563eb", textDecoration: "none",
                                background: "#eff6ff", border: "1px solid #bfdbfe",
                                borderRadius: 6, padding: "3px 8px",
                            }}
                        >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                            {link.label}
                        </a>
                    ))}
                </div>
            )}
            {/* 書類ダウンロードセクション */}
            {guide.forms && guide.forms.length > 0 && (
                <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 6 }}>📥 書類ダウンロード（クリックでPDF取得）</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {guide.forms.map((form, i) => (
                            <a
                                key={i}
                                href={form.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ textDecoration: "none" }}
                            >
                                <div style={{
                                    display: "flex", alignItems: "flex-start", gap: 10,
                                    background: "#f0fdf4", border: "1px solid #86efac",
                                    borderRadius: 8, padding: "8px 12px",
                                    transition: "background 0.15s",
                                    cursor: "pointer",
                                }}>
                                    <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>{form.name}</div>
                                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{form.note}</div>
                                    </div>
                                    <div style={{
                                        flexShrink: 0, fontSize: 11, fontWeight: 600,
                                        background: "#16a34a", color: "white",
                                        borderRadius: 5, padding: "2px 8px",
                                        alignSelf: "center",
                                    }}>↓ PDF</div>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
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

    // 各フィールドのヘルプテキスト
    const helpText = {
        hrmosId: "HRMOSで確認した従業員番号（例: 10023）を入力してください",
        stdMonthly: "基本給＋各種手当の合計をもとに近い等級を選んでください。社会保険料の計算に使用します",
        residentTax: "前職の源泉徴収票や市区町村の通知書に記載の月額。不明な場合は0でOKです（後で変更できます）",
        dependents: "配偶者・子など、所得税の扶養に入っている家族の人数（本人を除く）",
    };

    return (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: "#1e40af" }}>従業員情報を入力</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                ❓ 各項目にカーソルを合わせると説明が表示されます。わからない項目は「テンプレ適用」で初期値を設定できます。
            </div>
            <div className="form-grid" style={{ marginBottom: 10 }}>
                <label className="form-label">氏名 *
                    <input placeholder="山田 太郎" value={name} onChange={e => setName(e.target.value)} className={errors.name ? "error" : ""} />
                    {errors.name && <span className="error-text">{errors.name}</span>}
                </label>
                <label className="form-label" title={helpText.hrmosId}>
                    HRMOS連携ID *　<span style={{ fontSize: 11, color: "#94a3b8" }}>（HRMOSの従業員番号）</span>
                    <input placeholder="例: 10023" value={hrmosId} onChange={e => setHrmosId(e.target.value)} className={errors.hrmosId ? "error" : ""} />
                    {errors.hrmosId && <span className="error-text">{errors.hrmosId}</span>}
                    <span style={{ fontSize: 11, color: "#64748b", marginTop: 2, display: "block" }}>{helpText.hrmosId}</span>
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
                <label className="form-label" title={helpText.dependents}>
                    扶養人数　<span style={{ fontSize: 11, color: "#94a3b8" }}>（所得税計算用）</span>
                    <input type="number" min="0" step="1" value={dependents} onChange={e => setDependents(e.target.value)} />
                    <span style={{ fontSize: 11, color: "#64748b", marginTop: 2, display: "block" }}>{helpText.dependents}</span>
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
                <label className="form-label" title={helpText.stdMonthly}>
                    標準報酬月額　<span style={{ fontSize: 11, color: "#94a3b8" }}>（社会保険料の計算に使用）</span>
                    <select value={stdMonthly} onChange={e => setStdMonthly(e.target.value)} className={errors.stdMonthly ? "error" : ""}>
                        <option value="">-- 等級を選択 --</option>
                        {STD_MONTHLY_GRADES.map(g => (
                            <option key={g.grade} value={String(g.stdMonthly)}>{g.grade}等級 — ¥{g.stdMonthly.toLocaleString()}</option>
                        ))}
                    </select>
                    <span style={{ fontSize: 11, color: "#64748b", marginTop: 2, display: "block" }}>{helpText.stdMonthly}</span>
                </label>
                <label className="form-label" title={helpText.residentTax}>
                    住民税（月額・円）　<span style={{ fontSize: 11, color: "#94a3b8" }}>（不明なら0でOK）</span>
                    <input type="number" value={residentTax} onChange={e => setResidentTax(e.target.value)} />
                    <span style={{ fontSize: 11, color: "#64748b", marginTop: 2, display: "block" }}>{helpText.residentTax}</span>
                </label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                <label className="checkbox-label"><input type="checkbox" checked={hasKaigo} onChange={e => setHasKaigo(e.target.checked)} /> 介護保険　<span style={{ fontSize: 11, color: "#94a3b8" }}>（40歳以上）</span></label>
                <label className="checkbox-label" style={employmentType === "役員" ? { opacity: 0.5 } : {}}>
                    <input type="checkbox" checked={hasEmployment} disabled={employmentType === "役員"} onChange={e => setHasEmployment(e.target.checked)} /> 雇用保険　<span style={{ fontSize: 11, color: "#94a3b8" }}>（役員は不可）</span>
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
    const [openGuides, setOpenGuides] = useState({});
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
        setOpenGuides({});
    };

    const toggleCheck = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));
    const toggleGuide = (id) => setOpenGuides(prev => ({ ...prev, [id]: !prev[id] }));

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
                        ステップに従って手続きを進めてください。「📖 詳細ガイド」を開くと、書類名・提出先・期限などを確認できます。
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
                    const guideOpen = Boolean(openGuides[step.id]);

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
                                    {/* チェックボックス */}
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

                                {/* 期限バッジ */}
                                {step.deadline && (
                                    <div style={{ marginTop: 6 }}>
                                        <span style={{
                                            display: "inline-flex", alignItems: "center", gap: 4,
                                            fontSize: 12, fontWeight: 700,
                                            color: step.deadlineUrgent ? "#dc2626" : "#b45309",
                                            background: step.deadlineUrgent ? "#fef2f2" : "#fffbeb",
                                            border: `1px solid ${step.deadlineUrgent ? "#fecaca" : "#fde68a"}`,
                                            borderRadius: 6, padding: "2px 8px",
                                        }}>
                                            {step.deadlineUrgent ? "⚠️" : "📅"} 期限：{step.deadline}
                                        </span>
                                    </div>
                                )}

                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, lineHeight: 1.6 }}>
                                    {step.note}
                                </div>

                                {/* 詳細ガイドボタン */}
                                {step.guide && (
                                    <div style={{ marginTop: 8 }}>
                                        <button
                                            onClick={() => toggleGuide(step.id)}
                                            style={{
                                                display: "inline-flex", alignItems: "center", gap: 5,
                                                fontSize: 12, color: "#2563eb", background: "none",
                                                border: "1px solid #bfdbfe", borderRadius: 6,
                                                padding: "3px 10px", cursor: "pointer",
                                                transition: "background 0.15s",
                                            }}
                                        >
                                            📖 詳細ガイド {guideOpen ? "▲ 閉じる" : "▼ 見る"}
                                        </button>
                                        {guideOpen && <GuidePanel guide={step.guide} />}
                                    </div>
                                )}

                                {/* 外部リンク（ステップレベル） */}
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
                                        {/* 書類アップロード＆入力ガイドパネル（登録前後どちらでも使用可） */}
                                        <DocumentUploadPanel
                                            employeeId={registeredEmployee?.id || null}
                                            employeeName={registeredEmployee?.name || null}
                                        />
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
                        setOpenGuides({});
                    }}
                >
                    🔄 チェックをリセット
                </button>
            </div>
        </div>
    );
};
