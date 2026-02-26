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
            summary: "入社前か入社当日に必ず行います。「何時から何時まで働くか」「給料はいくらか」などを書面にして本人に渡す義務があります。会社用・本人用の2部作ってください。",
            items: [
                "正社員・嘱託の場合：「労働条件通知書」を必ず渡す（法律で義務付けられています）",
                "役員の場合：「委任契約書」を用意します（雇用契約書とは別物です）",
                "書類には「勤務時間・休日・給与・勤務場所」などを記載します",
                "書類は5年間保管する義務があります",
            ],
            links: [],
        },
    },
    {
        id: "mynumber",
        label: "マイナンバーの収集",
        kind: "external",
        note: "社会保険・税の手続きに必要です。マイナンバーカードのコピーか、通知カード＋身分証のコピーを受け取ります。",
        guide: {
            summary: "マイナンバー（12桁の番号）は、社会保険の加入手続きや年末調整などで使います。受け取ったコピーは鍵のかかる場所で保管してください。受け取った書類は上の「書類アップロード」からアップロードすると、AIが使い方を教えてくれます。",
            items: [
                "受け取るもの①：マイナンバーカードのコピー（表と裏）",
                "受け取るもの②：通知カードのコピー＋運転免許証などの身分証のコピー（カードがない場合）",
                "扶養家族がいる場合は、家族のマイナンバーも必要です",
                "受け取ったコピーは厳重に保管してください（目的外の使用は法律で禁止）",
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
        note: "勤怠管理システム（HRMOS）に新しい従業員を追加します。登録後に表示される「従業員番号」を必ずメモしてください。",
        guide: {
            summary: "HRMOSは勤怠（出退勤）を管理するシステムです。ここに登録しないと、出退勤のデータが給与計算に反映されません。登録後に表示される数字の番号（例：10023）を手元に控えておいてください。",
            items: [
                "「HRMOSを開く」ボタンからログインします",
                "「従業員管理」→「新規追加」から氏名・入社日・所属を入力して保存",
                "登録後に表示される「従業員番号」をメモする（次のステップで使います）",
                "この番号が分からないと次に進めません。必ず控えておいてください",
            ],
            links: [{ label: "HRMOS勤怠 ログイン", url: "https://ieyasu.co" }],
        },
    },
    {
        id: "system_register",
        label: "このシステムに従業員を登録",
        kind: "system",
        action: "register",
        note: "HRMOSで確認した従業員番号を使って、このシステムに従業員情報を登録します。給与計算に必要な情報をここで設定します。",
        guide: {
            summary: "「登録フォームを開く」から入力します。難しい項目は「雇用区分テンプレート」を選ぶと自動で埋まります。分からない項目は後から変更できるので、まずは入力できる部分だけで登録してOKです。",
            items: [
                "HRMOS連携ID：前のステップでメモした従業員番号を入力",
                "標準報酬月額：基本給＋手当の合計額に近い金額を選ぶ（社会保険料の計算に使います）",
                "住民税（月額）：前職の源泉徴収票に記載の金額か、市区町村からの通知書の金額を入力（不明なら0でOK）",
                "雇用区分テンプレートを使うと、正社員・嘱託・役員ごとに初期値が自動設定されます",
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
        note: "⚠️ 急ぎ！入社日から5日以内に最寄りの年金事務所へ提出が必要です。",
        guide: {
            summary: "健康保険証を発行してもらうための手続きです。下の📄ボタンから書類（PDF）を印刷して記入し、年金事務所に持参か郵送してください。窓口・郵送・e-Gov電子申請が選べます。提出後、保険証が届くまで数日〜2週間かかります。",
            items: [
                "書類に記入する内容：氏名・生年月日・マイナンバー・入社日・標準報酬月額（このシステムに登録した金額）",
                "扶養家族（配偶者や子ども）がいる場合は「被扶養者（異動）届」も一緒に提出します",
                "⚠️ 週30時間未満のパートや60歳以上の方は、加入不要な場合があります（不明な場合は年金事務所に確認）",
                "近くの年金事務所は下のリンクから検索できます",
            ],
            links: [
                { label: "日本年金機構 資格取得届（記載例）", url: "https://www.nenkin.go.jp/service/kounen/todokesho/" },
                { label: "e-Gov 電子申請ポータル", url: "https://shinsei.e-gov.go.jp/" },
                { label: "全国の年金事務所を探す", url: "https://www.nenkin.go.jp/section/soudan/" },
            ],
            forms: [
                {
                    name: "健康保険・厚生年金保険 被保険者資格取得届",
                    url: "/forms/shakai_hoken_shikaku_shutoku.pdf",
                    note: "厚生労働省 公式様式（PDF）。印刷して記入し、年金事務所へ提出",
                },
                {
                    name: "健康保険 被扶養者（異動）届（扶養家族がいる場合）",
                    url: "/forms/shakai_hoken_fuyou_ido.pdf",
                    note: "厚生労働省 公式様式（PDF）。扶養に入れる家族がいる場合のみ。上の届と一緒に提出",
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
        note: "入社月の翌月10日までにハローワークへ提出します。",
        guide: {
            summary: "失業給付などを保障する「雇用保険」に加入するための手続きです。下の📄ボタンから書類を印刷して、最寄りのハローワーク窓口に持参してください（e-Gov電子申請も可）。提出後に「雇用保険被保険者証」が発行されます。",
            items: [
                "書類に記入する内容：氏名・マイナンバー・入社日・雇用形態・1週間の所定労働時間・給与額",
                "⚠️ 週20時間以上＋31日以上働く見込みの方が対象です（パートやアルバイトも含みます）",
                "役員は原則加入できません",
                "前の職場がある場合は「雇用保険被保険者証」の番号が必要です（本人から受け取ってください）",
            ],
            links: [
                { label: "ハローワーク 雇用保険の手続き", url: "https://www.hellowork.mhlw.go.jp/insurance/insurance_guide.html" },
                { label: "e-Gov 電子申請ポータル", url: "https://shinsei.e-gov.go.jp/" },
                { label: "全国のハローワーク", url: "https://www.hellowork.mhlw.go.jp/offices/list.html" },
            ],
            forms: [
                {
                    name: "雇用保険 被保険者資格取得届",
                    url: "/forms/koyo_hoken_shikaku_shutoku.pdf",
                    note: "ハローワーク 公式様式（PDF）。印刷して記入し、管轄ハローワーク窓口へ提出",
                },
            ],
        },
    },
    {
        id: "jumin_tax",
        label: "住民税の引き落とし切替（前職がある場合）",
        kind: "external",
        note: "前の会社で給与天引きされていた住民税を、当社での天引きに切り替える手続きです。前職がない場合は不要です。",
        guide: {
            summary: "前の職場で住民税が給与から天引き（特別徴収）されていた場合のみ必要な手続きです。前職がない方・新卒の方はこのステップをスキップして「完了」にチェックしてください。",
            items: [
                "前職の会社に「給与所得者異動届出書」という書類を作成してもらいます（郵送・メールで依頼してOK）",
                "届いた書類に当社の情報を追記して、市区町村の税務課に提出します",
                "手続き後、翌月から住民税が給与から自動で天引きされます",
                "住民税の月額が分かったら、このシステムの従業員情報「住民税（月額）」欄に入力してください",
            ],
            links: [],
        },
    },
    {
        id: "payroll",
        label: "翌月の給与計算に含める",
        kind: "system",
        action: "go_payroll",
        note: "ここまでの手続きが完了したら、翌月の給与計算画面で新しい従業員が対象に含まれているか確認します。",
        guide: {
            summary: "「給与計算ページへ」ボタンで移動し、新しい従業員の名前が一覧に表示されていれば完了です。初月は入社日が月の途中の場合、日割り計算が必要になります。",
            items: [
                "給与計算ページで対象月を選択し、新しい従業員が表示されていることを確認",
                "入社日が月の途中の場合は日割り計算が必要です（実際に働いた日数分だけ計算）",
                "HRMOSと連携していれば、出退勤データが自動で取り込まれます",
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
            summary: "健康保険証を本人から回収し、届書と一緒に年金事務所へ提出します（窓口・郵送・e-Gov可）。",
            items: [
                "資格喪失日は退職日の翌日（例：3/31退職 → 喪失日は4/1）",
                "健康保険証を本人から回収して同封（紛失の場合は「亡失届」も必要）",
                "扶養家族がいた場合は家族の保険証も回収します",
                "任意継続を希望する退職者は、退職後20日以内に本人が年金事務所へ手続き",
            ],
            links: [
                { label: "日本年金機構 資格喪失届（記載例）", url: "https://www.nenkin.go.jp/service/kounen/todokesho/" },
                { label: "e-Gov 電子申請ポータル", url: "https://shinsei.e-gov.go.jp/" },
            ],
            forms: [
                {
                    name: "健康保険・厚生年金保険 被保険者資格喪失届",
                    url: "/forms/shakai_hoken_shikaku_soshitsu.pdf",
                    note: "厚生労働省 公式様式（PDF）。健康保険証と一緒に年金事務所へ提出",
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
            summary: "離職票（1・2）の発行が必要かどうかを退職者に事前に確認してください。",
            items: [
                "ハローワーク窓口または e-Gov 電子申請で提出",
                "失業給付を希望する退職者には「離職票（1・2）」の発行を同時申請（交付義務あり）",
                "離職証明書の離職理由欄は退職者本人の確認・署名が必要です",
                "手続き完了後に「雇用保険被保険者資格喪失確認通知書」が交付されます",
            ],
            links: [
                { label: "ハローワーク 資格喪失届の手続き", url: "https://www.hellowork.mhlw.go.jp/insurance/insurance_guide.html" },
                { label: "e-Gov 電子申請ポータル", url: "https://shinsei.e-gov.go.jp/" },
            ],
            forms: [
                {
                    name: "雇用保険 被保険者資格喪失届",
                    url: "https://hoken.hellowork.mhlw.go.jp/assist/001000.do?screenId=001000&action=koyohohiSoshitsuLink",
                    note: "ハローワーク インターネットサービスで作成・印刷（PDFダウンロード不可・オンライン入力後に印刷）",
                    isOnline: true,
                },
                {
                    name: "離職証明書（離職票が必要な場合）",
                    url: "https://hoken.hellowork.mhlw.go.jp/assist/001000.do?screenId=001000&action=initDisp",
                    note: "退職者が失業給付を希望する場合のみ必要。PDFダウンロード不可のため、ハローワーク窓口または上記オンラインサービスで作成",
                    isOnline: true,
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
                "マネーフォワード給与から発行できます（期限はステップ上部に表示）",
                "退職者の確定申告・次の会社での年末調整で使用します",
                "本人の同意があれば電子交付（メール添付など）も可能",
                "発行日・交付方法の記録を残しておくことをお勧めします",
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

// ===== ユーティリティ =====
const getUrgentGuides = (steps) =>
    Object.fromEntries(steps.filter(s => s.deadlineUrgent).map(s => [s.id, true]));

const loadChecked = () => {
    try { return JSON.parse(localStorage.getItem("wizard_checked") || "{}"); } catch { return {}; }
};
const saveChecked = (obj) => {
    try { localStorage.setItem("wizard_checked", JSON.stringify(obj)); } catch {}
};

// ===== オンボーディングセッション管理 =====
const loadSessions = () => {
    try { return JSON.parse(localStorage.getItem("onboarding_sessions") || "[]"); } catch { return []; }
};
const saveSessions = (arr) => {
    try { localStorage.setItem("onboarding_sessions", JSON.stringify(arr)); } catch {}
};
const newSession = (name, joinDate) => ({
    id: Date.now().toString(),
    name,
    joinDate,
    checked: {},
    openGuides: getUrgentGuides(ONBOARDING_STEPS),
    registeredEmpId: null,
    showRegisterForm: false,
});

// ===== 届出書記入チェックシート =====
const FORM_FIELDS = {
    shakai_hoken: [
        { label: "被保険者氏名（漢字）",     getValue: (s) => s.name,       hint: "入社する方の氏名（漢字）" },
        { label: "被保険者氏名（フリガナ）", getValue: () => null,           hint: "カタカナ読み（本人に確認）" },
        { label: "生年月日",                 getValue: () => null,           hint: "マイナンバー書類か本人に確認" },
        { label: "性別",                     getValue: () => null,           hint: "本人に確認" },
        { label: "個人番号（マイナンバー）", getValue: () => null,           hint: "マイナンバーカードの12桁の番号" },
        { label: "資格取得年月日",           getValue: (s) => s.joinDate,   hint: "入社日をそのまま記入" },
        { label: "報酬月額",                 getValue: (s, e) => e ? `${((e.basicPay||0)+(e.dutyAllowance||0)+(e.commuteAllow||0)).toLocaleString()}円` : null, hint: "このシステムの従業員情報（基本給＋手当）" },
        { label: "標準報酬月額",             getValue: (s, e) => e ? `${(e.stdMonthly||0).toLocaleString()}円` : null, hint: "このシステムの従業員情報の「標準報酬月額」" },
    ],
    koyo_hoken: [
        { label: "被保険者氏名（漢字）",     getValue: (s) => s.name,       hint: "入社する方の氏名（漢字）" },
        { label: "被保険者氏名（フリガナ）", getValue: () => null,           hint: "カタカナ読み（本人に確認）" },
        { label: "生年月日",                 getValue: () => null,           hint: "マイナンバー書類か本人に確認" },
        { label: "性別",                     getValue: () => null,           hint: "本人に確認" },
        { label: "個人番号（マイナンバー）", getValue: () => null,           hint: "マイナンバーカードの12桁の番号" },
        { label: "資格取得年月日",           getValue: (s) => s.joinDate,   hint: "入社日をそのまま記入" },
        { label: "雇用形態",                 getValue: (s, e) => e?.employmentType || null, hint: "このシステムの従業員情報の雇用区分" },
        { label: "1週間の所定労働時間",      getValue: () => "40時間",      hint: "雇用契約書で確認（正社員・ドライバーは通常40時間）" },
        { label: "賃金月額",                 getValue: (s, e) => e ? `${(e.basicPay||0).toLocaleString()}円` : null, hint: "このシステムの従業員情報の基本給" },
    ],
};

const FormFillingGuide = ({ formType, session, employee }) => {
    const fields = FORM_FIELDS[formType];
    if (!fields || !session) return null;
    const knownCount = fields.filter(f => f.getValue(session, employee) !== null).length;
    return (
        <div style={{ marginTop: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                    📋 届出書の記入チェックシート
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                    確認済み {knownCount} / {fields.length} 項目
                </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {fields.map((f, i) => {
                    const value = f.getValue(session, employee);
                    return (
                        <div key={i} style={{ display: "flex", gap: 8, padding: "5px 6px", background: i % 2 === 0 ? "white" : "#fefce8", borderRadius: 4, alignItems: "baseline", flexWrap: "wrap" }}>
                            <div style={{ minWidth: 190, fontSize: 12, fontWeight: 600, color: "#1e293b", flexShrink: 0 }}>{f.label}</div>
                            <div style={{ minWidth: 140, fontSize: 12, flexShrink: 0 }}>
                                {value
                                    ? <span style={{ color: "#15803d", fontWeight: 700 }}>✓ {value}</span>
                                    : <span style={{ color: "#b45309", fontWeight: 600 }}>⬜ 要確認</span>
                                }
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{f.hint}</div>
                        </div>
                    );
                })}
            </div>
            {knownCount < fields.length && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#92400e" }}>
                    ⬜ の項目は「受け取り書類アップロード」から書類をアップロードするか、本人に直接確認してください。
                </div>
            )}
        </div>
    );
};

// ===== メインコンポーネント =====
export const OnboardingWizardPage = ({
    employees, setEmployees, setAttendance, setPaidLeaveBalance, setChangeLogs,
    settings, setPage,
}) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const [wizardType, setWizardType] = useState(() => localStorage.getItem("wizard_type") || "onboarding");

    // ── onboarding: multi-session ──
    const [sessions, setSessions] = useState(loadSessions);
    const [activeSessionId, setActiveSessionId] = useState(() => {
        const s = loadSessions(); return s[0]?.id || null;
    });
    const [showAddForm, setShowAddForm] = useState(false);
    const [addName, setAddName] = useState("");
    const [addJoinDate, setAddJoinDate] = useState(todayStr);

    const activeSession = sessions.find(s => s.id === activeSessionId) || null;

    const updateActiveSession = (patch) => {
        if (!activeSessionId) return;
        setSessions(prev => {
            const next = prev.map(s => s.id === activeSessionId ? { ...s, ...patch } : s);
            saveSessions(next);
            return next;
        });
    };
    const addSession = (name, joinDate) => {
        const s = newSession(name.trim(), joinDate);
        setSessions(prev => { const next = [...prev, s]; saveSessions(next); return next; });
        setActiveSessionId(s.id);
        try { localStorage.setItem("active_session_id", s.id); } catch {}
    };
    const removeSession = (id) => {
        setSessions(prev => { const next = prev.filter(s => s.id !== id); saveSessions(next); return next; });
        setActiveSessionId(prev => prev === id ? (sessions.filter(s => s.id !== id)[0]?.id || null) : prev);
    };

    // ── offboarding: single session (unchanged) ──
    const [offChecked, setOffChecked] = useState(loadChecked);
    const [offOpenGuides, setOffOpenGuides] = useState(() => getUrgentGuides(OFFBOARDING_STEPS));
    const [selectedEmpId, setSelectedEmpId] = useState("");
    const [leaveDate, setLeaveDate] = useState(todayStr);
    const [offboardConfirmed, setOffboardConfirmed] = useState(false);
    const [offboardDone, setOffboardDone] = useState(false);

    // ── 統一インターフェース（JSX共通） ──
    const checked = wizardType === "onboarding" ? (activeSession?.checked || {}) : offChecked;
    const openGuides = wizardType === "onboarding" ? (activeSession?.openGuides || {}) : offOpenGuides;
    const registeredEmployee = wizardType === "onboarding" && activeSession?.registeredEmpId
        ? employees.find(e => String(e.id) === String(activeSession.registeredEmpId)) || null
        : null;
    const showRegisterForm = activeSession?.showRegisterForm || false;

    const setChecked = (updater) => {
        if (wizardType === "onboarding") {
            setSessions(prev => {
                const cur = prev.find(s => s.id === activeSessionId);
                const next_c = typeof updater === "function" ? updater(cur?.checked || {}) : updater;
                const next = prev.map(s => s.id === activeSessionId ? { ...s, checked: next_c } : s);
                saveSessions(next); return next;
            });
        } else {
            setOffChecked(prev => {
                const next = typeof updater === "function" ? updater(prev) : updater;
                saveChecked(next); return next;
            });
        }
    };
    const setShowRegisterForm = (val) => {
        const v = typeof val === "function" ? val(showRegisterForm) : val;
        updateActiveSession({ showRegisterForm: v });
    };
    const setRegisteredEmployee = (emp) => updateActiveSession({ registeredEmpId: emp?.id || null });

    const activeEmployees = employees.filter(e => e.status === "在籍");
    const steps = wizardType === "onboarding" ? ONBOARDING_STEPS : OFFBOARDING_STEPS;
    const completedCount = steps.filter(s => checked[s.id]).length;
    const progress = Math.round((completedCount / steps.length) * 100);
    const currentStepIdx = steps.findIndex(s => !checked[s.id]);

    // タブ切替時にリセット
    const switchWizard = (type) => {
        try { localStorage.setItem("wizard_type", type); } catch {}
        setWizardType(type);
        if (type === "offboarding") {
            const reset = {};
            saveChecked(reset);
            setOffChecked(reset);
            setSelectedEmpId("");
            setLeaveDate(todayStr);
            setOffboardConfirmed(false);
            setOffboardDone(false);
            setOffOpenGuides(getUrgentGuides(OFFBOARDING_STEPS));
        }
    };

    const toggleCheck = (id) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));
    const toggleGuide = (id) => {
        if (wizardType === "onboarding") {
            setSessions(prev => {
                const cur = prev.find(s => s.id === activeSessionId);
                const next_g = { ...(cur?.openGuides || {}), [id]: !(cur?.openGuides || {})[id] };
                const next = prev.map(s => s.id === activeSessionId ? { ...s, openGuides: next_g } : s);
                saveSessions(next); return next;
            });
        } else {
            setOffOpenGuides(prev => ({ ...prev, [id]: !prev[id] }));
        }
    };

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
        setChecked(prev => {
            const next = { ...prev, system_offboard: true };
            saveChecked(next);
            return next;
        });
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
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => {
                                if (!window.confirm("チェック状態をリセットしますか？")) return;
                                if (wizardType === "onboarding") {
                                    updateActiveSession({ checked: {}, showRegisterForm: false, registeredEmpId: null, openGuides: getUrgentGuides(ONBOARDING_STEPS) });
                                } else {
                                    const reset = {};
                                    saveChecked(reset);
                                    setOffChecked(reset);
                                    setSelectedEmpId("");
                                    setLeaveDate(todayStr);
                                    setOffboardConfirmed(false);
                                    setOffboardDone(false);
                                    setOffOpenGuides(getUrgentGuides(OFFBOARDING_STEPS));
                                }
                            }}
                        >
                            🔄 リセット
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: progress === 100 ? "#16a34a" : "#2563eb" }}>
                            {progress}%
                        </span>
                    </div>
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

            {/* 入社: セッションタブ */}
            {wizardType === "onboarding" && (
                <div style={{ marginBottom: 16 }}>
                    {/* タブ行 */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                        {sessions.map(s => {
                            const prog = Math.round(ONBOARDING_STEPS.filter(st => s.checked?.[st.id]).length / ONBOARDING_STEPS.length * 100);
                            const isActive = s.id === activeSessionId;
                            return (
                                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                                    <button
                                        onClick={() => { setActiveSessionId(s.id); try { localStorage.setItem("active_session_id", s.id); } catch {} }}
                                        style={{
                                            padding: "6px 12px", borderRadius: "8px 0 0 8px",
                                            border: `2px solid ${isActive ? "#2563eb" : "#e2e8f0"}`,
                                            borderRight: "none",
                                            background: isActive ? "#eff6ff" : "white",
                                            cursor: "pointer", fontSize: 13,
                                            fontWeight: isActive ? 700 : 400,
                                            color: isActive ? "#1e40af" : "#374151",
                                        }}
                                    >
                                        👤 {s.name}
                                        <span style={{ marginLeft: 6, fontSize: 11, color: prog === 100 ? "#16a34a" : "#64748b" }}>{prog}%</span>
                                    </button>
                                    <button
                                        onClick={() => { if (window.confirm(`${s.name}さんの手続きを削除しますか？`)) removeSession(s.id); }}
                                        style={{
                                            padding: "6px 8px", borderRadius: "0 8px 8px 0",
                                            border: `2px solid ${isActive ? "#2563eb" : "#e2e8f0"}`,
                                            background: isActive ? "#eff6ff" : "white",
                                            cursor: "pointer", fontSize: 13, color: "#94a3b8",
                                            lineHeight: 1,
                                        }}
                                        title="削除"
                                    >×</button>
                                </div>
                            );
                        })}

                        {/* 追加フォーム */}
                        {showAddForm ? (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 12px" }}>
                                <input
                                    type="text" placeholder="氏名（例: 山田 太郎）" value={addName}
                                    onChange={e => setAddName(e.target.value)}
                                    autoFocus
                                    style={{ padding: "4px 8px", fontSize: 13, borderRadius: 5, border: "1px solid #86efac", minWidth: 160 }}
                                />
                                <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                                    入社日:
                                    <input type="date" value={addJoinDate} onChange={e => setAddJoinDate(e.target.value)} style={{ padding: "4px 6px" }} />
                                </label>
                                <button className="btn btn-sm btn-primary" disabled={!addName.trim()}
                                    onClick={() => { addSession(addName, addJoinDate); setAddName(""); setShowAddForm(false); }}>
                                    追加
                                </button>
                                <button className="btn btn-sm btn-outline" onClick={() => { setShowAddForm(false); setAddName(""); }}>キャンセル</button>
                            </div>
                        ) : (
                            <button className="btn btn-sm btn-outline" onClick={() => setShowAddForm(true)}>
                                ＋ 新しい方を追加
                            </button>
                        )}
                    </div>

                    {/* セッション未選択・空 */}
                    {sessions.length === 0 && (
                        <div style={{ background: "#f8fafc", border: "2px dashed #e2e8f0", borderRadius: 10, padding: "32px", textAlign: "center" }}>
                            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>入社手続き中の方がいません</div>
                            <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                                ＋ 入社手続きを開始する
                            </button>
                        </div>
                    )}

                    {/* アクティブセッション: 受け取り書類アップロード */}
                    {activeSession && (
                        <div style={{ marginBottom: 16, padding: "14px 18px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "#1e40af", marginBottom: 4 }}>
                                📁 {activeSession.name}さんから受け取った書類をアップロード
                            </div>
                            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                                マイナンバーや源泉徴収票など、受け取った書類をアップロードしてください。AIが内容を読み取り、どこに何を入力すればいいかを教えてくれます。
                            </div>
                            <DocumentUploadPanel
                                employeeId={registeredEmployee?.id || null}
                                employeeName={activeSession.name}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* 退社: 対象者を最初に確定 */}
            {wizardType === "offboarding" && (
                <div style={{ marginBottom: 16, padding: "14px 18px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e", marginBottom: 10 }}>
                        📋 まず退社する従業員と退職日を確認してください
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <select
                            value={selectedEmpId}
                            onChange={e => { setSelectedEmpId(e.target.value); setOffboardConfirmed(false); setChecked(prev => { const n = { ...prev, confirm_date: false }; saveChecked(n); return n; }); }}
                            disabled={offboardConfirmed}
                            style={{ padding: "6px 10px", minWidth: 180, fontSize: 13 }}
                        >
                            <option value="">対象者を選択...</option>
                            {activeEmployees.map(e => (
                                <option key={e.id} value={e.id}>{e.name}（{e.employmentType || "正社員"}）</option>
                            ))}
                        </select>
                        <label style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                            退職日:
                            <input
                                type="date"
                                value={leaveDate}
                                onChange={e => { setLeaveDate(e.target.value); setOffboardConfirmed(false); setChecked(prev => { const n = { ...prev, confirm_date: false }; saveChecked(n); return n; }); }}
                                disabled={offboardConfirmed}
                                style={{ padding: "4px 8px" }}
                            />
                        </label>
                        {offboardConfirmed ? (
                            <button className="btn btn-sm btn-outline" onClick={() => {
                                setOffboardConfirmed(false);
                                setChecked(prev => { const n = { ...prev, confirm_date: false }; saveChecked(n); return n; });
                            }}>変更する</button>
                        ) : (
                            <button
                                className="btn btn-sm btn-primary"
                                disabled={!selectedEmpId}
                                onClick={() => {
                                    setOffboardConfirmed(true);
                                    setChecked(prev => { const n = { ...prev, confirm_date: true }; saveChecked(n); return n; });
                                }}
                            >確定</button>
                        )}
                        {offboardConfirmed && (
                            <span style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>
                                ✓ {activeEmployees.find(e => String(e.id) === String(selectedEmpId))?.name} / 退職日: {leaveDate}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* ステップ一覧 */}
            {wizardType === "onboarding" && !activeSession && null}
            <div style={{ display: wizardType === "onboarding" && !activeSession ? "none" : "flex", flexDirection: "column", gap: 12 }}>
                {steps.map((step, idx) => {
                    const done = Boolean(checked[step.id]);
                    const isCurrent = idx === currentStepIdx;
                    const isActive = !done;
                    const guideOpen = Boolean(openGuides[step.id]);

                    return (
                        <div
                            key={step.id}
                            style={{
                                display: "flex",
                                gap: 14,
                                padding: "16px 18px",
                                background: done ? "#f0fdf4" : isCurrent ? "#fefce8" : step.kind === "system" ? "#eff6ff" : "white",
                                border: `2px solid ${done ? "#86efac" : isCurrent ? "#fbbf24" : step.kind === "system" ? "#bfdbfe" : "#e2e8f0"}`,
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
                                {isCurrent && (
                                    <div style={{ marginBottom: 6 }}>
                                        <span style={{
                                            display: "inline-flex", alignItems: "center", gap: 4,
                                            fontSize: 11, fontWeight: 700, color: "#92400e",
                                            background: "#fef3c7", border: "1px solid #fbbf24",
                                            borderRadius: 5, padding: "2px 8px",
                                        }}>
                                            ▶ 今やること
                                        </span>
                                    </div>
                                )}
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

                                {/* 書類バッジ（ガイドを開かなくても視認） */}
                                {step.guide?.forms?.length > 0 && (
                                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                                        {step.guide.forms.map((form, i) => (
                                            <a
                                                key={i}
                                                href={form.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    fontSize: 11, textDecoration: "none",
                                                    color: form.isOnline ? "#1d4ed8" : "#15803d",
                                                    background: form.isOnline ? "#eff6ff" : "#f0fdf4",
                                                    border: `1px solid ${form.isOnline ? "#bfdbfe" : "#86efac"}`,
                                                    borderRadius: 4, padding: "2px 7px",
                                                    display: "inline-flex", alignItems: "center", gap: 3,
                                                }}
                                            >
                                                {form.isOnline ? "→" : "📄"} {form.name.length > 20 ? form.name.slice(0, 20) + "…" : form.name}
                                            </a>
                                        ))}
                                    </div>
                                )}

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
                                        {guideOpen && (step.id === "shakai_hoken" || step.id === "koyo_hoken") && wizardType === "onboarding" && (
                                            <FormFillingGuide formType={step.id} session={activeSession} employee={registeredEmployee} />
                                        )}
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
                                    </div>
                                )}

                                {/* 退職日確認ステップ（上部パネルで処理） */}
                                {step.action === undefined && step.kind === "input" && (
                                    <div style={{ marginTop: 8 }}>
                                        {done
                                            ? <Badge variant="success">✓ 退職日: {leaveDate}</Badge>
                                            : <div style={{ fontSize: 12, color: "#b45309" }}>↑ ページ上部で対象者と退職日を選択して「確定」してください</div>
                                        }
                                    </div>
                                )}

                                {/* 退職処理ステップ */}
                                {step.action === "offboard" && (
                                    <div style={{ marginTop: 10 }}>
                                        {offboardDone ? (
                                            <Badge variant="success">✓ 退職処理完了</Badge>
                                        ) : !offboardConfirmed ? (
                                            <div style={{ fontSize: 12, color: "#b45309" }}>↑ ページ上部で対象者と退職日を先に確定してください</div>
                                        ) : (
                                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                                <span style={{ fontSize: 13, color: "#475569" }}>
                                                    対象: <strong>{activeEmployees.find(e => String(e.id) === String(selectedEmpId))?.name}</strong>　退職日: <strong>{leaveDate}</strong>
                                                </span>
                                                <button
                                                    className="btn btn-sm btn-danger"
                                                    onClick={handleOffboard}
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

        </div>
    );
};
