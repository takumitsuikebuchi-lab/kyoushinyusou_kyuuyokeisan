import { INITIAL_MASTER_SETTINGS } from "./constants";
import { pad2, parsePayDay, isNextMonthPay, toIsoDate, formatDateJP, fmt } from "./date-utils";
import { calcPayroll, findGradeByStdMonthly, taxYearFromPayMonth } from "./payroll-calc";

export const REF_TODAY = new Date();
export const CURRENT_MONTH = `${REF_TODAY.getFullYear()}-${pad2(REF_TODAY.getMonth() + 1)}`;
export const _INIT_PAY_DAY = parsePayDay(INITIAL_MASTER_SETTINGS.paymentDay);
export const NEXT_PAY_DATE_OBJ = isNextMonthPay(INITIAL_MASTER_SETTINGS.paymentDay)
    ? new Date(REF_TODAY.getFullYear(), REF_TODAY.getMonth() + 1, _INIT_PAY_DAY)
    : new Date(REF_TODAY.getFullYear(), REF_TODAY.getMonth(), _INIT_PAY_DAY);
export const CURRENT_PAY_DATE = toIsoDate(NEXT_PAY_DATE_OBJ);

export const processingMonthOf = (date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    if (date.getDate() <= _INIT_PAY_DAY) d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
export const CURRENT_PROCESSING_MONTH = processingMonthOf(REF_TODAY);

export const toSnapshotRowFromCalc = (emp, result, att) => ({
    empId: emp.id, name: emp.name, jobType: emp.jobType, dept: emp.dept || "",
    employmentType: emp.employmentType || (emp.isOfficer ? "役員" : "正社員"),
    basicPay: emp.basicPay || 0, dutyAllowance: emp.dutyAllowance || 0,
    commuteAllow: emp.commuteAllow || 0,
    fixedOvertimePay: result.fixedOvertimePay || 0, excessOvertimePay: result.excessOvertimePay || 0,
    hasFixedOT: result.hasFixedOT || false,
    overtimePay: result.otLegal || 0, prescribedOvertimePay: result.otPrescribed || 0,
    nightOvertimePay: result.otNight || 0, holidayPay: result.otHoliday || 0,
    otAdjust: result.otAdjust || 0, basicPayAdjust: result.basicPayAdj || 0,
    otherAllowance: result.otherAllowance || 0,
    workDays: att?.workDays || 0, scheduledDays: att?.scheduledDays || 0,
    workHours: att?.workHours || 0, scheduledHours: att?.scheduledHours || 0,
    legalOT: att?.legalOT || 0, prescribedOT: att?.prescribedOT || 0, nightOT: att?.nightOT || 0, holidayOT: att?.holidayOT || 0,
    gross: result.gross || 0, health: result.health || 0, kaigo: result.kaigo || 0,
    pension: result.pension || 0, employment: result.employment || 0,
    incomeTax: result.incomeTax || 0, residentTax: result.residentTax || 0,
    yearAdjustment: 0, totalDeduct: result.totalDeduct || 0, net: result.netPay || 0,
    incomeTaxOverride: emp.incomeTaxOverride ?? null,
});

export const buildMonthlyChecks = (employees, attendance, monthStatus, hrmosSettings, hrmosUnmatchedRecords, findEmployeesByHrmosNumber, normalizeHrmosEmployeeNumber, getEmployeeHrmosNumber, collectEmployeeSetupIssues, EMPTY_ATTENDANCE) => {
    const critical = [];
    const warning = [];
    const active = employees.filter((e) => e.status === "在籍");
    const hrmosEnabled = Boolean(hrmosSettings?.companyUrl && hrmosSettings?.apiKey);
    const hrmosUnmatchedCount = Array.isArray(hrmosUnmatchedRecords) ? hrmosUnmatchedRecords.length : 0;
    if (active.length === 0) critical.push("在籍者が0名です。従業員登録を行ってください。");
    if (hrmosUnmatchedCount > 0) {
        critical.push(`HRMOS未紐付けデータが${hrmosUnmatchedCount}件あります。紐付け完了まで自動計算できません。`);
    }
    active.forEach((emp) => {
        if (!emp.name) critical.push("氏名が空の従業員がいます。");
        if ((emp.basicPay || 0) <= 0) critical.push(`${emp.name}: 基本給が未設定です。`);
        if ((emp.stdMonthly || 0) <= 0) critical.push(`${emp.name}: 標準報酬月額が未設定です。`);
        if ((emp.dependents || 0) < 0) critical.push(`${emp.name}: 扶養人数が不正です。`);
        if (emp.isOfficer && emp.hasEmployment) critical.push(`${emp.name}: 役員は雇用保険対象外です。`);
        const setupIssues = collectEmployeeSetupIssues(emp, employees);
        if (setupIssues.includes("HRMOS連携ID重複")) critical.push(`${emp.name}: HRMOS連携IDが重複しています。`);
        if (hrmosEnabled && setupIssues.includes("HRMOS連携ID未設定")) {
            warning.push(`${emp.name}: HRMOS連携IDが未設定です。`);
        }
        if (emp.stdMonthly > 0 && !findGradeByStdMonthly(emp.stdMonthly)) warning.push(`${emp.name}: 標準報酬月額 ¥${fmt(emp.stdMonthly)} が等級表に該当しません。`);
        if (!attendance[emp.id]) warning.push(`${emp.name}: 勤怠データがありません（0時間で計算）。`);
        if (!emp.joinDate) warning.push(`${emp.name}: 入社日が未入力です。`);
        if (!emp.employmentType) warning.push(`${emp.name}: 雇用区分が未入力です。`);
    });
    if (monthStatus === "未計算") warning.push("当月が未計算です。勤怠取込後に計算してください。");
    if (monthStatus === "計算中") warning.push("当月は計算中です。確定前に合計金額を再確認してください。");
    return { critical, warning };
};

export const ANNUAL_EVENTS = [
    // 1月
    { month: 1, day: 20, label: "源泉所得税の納付（納期の特例・7〜12月分）", desc: "10人未満の特例適用事業所は7〜12月分の源泉所得税を1/20までに納付" },
    { month: 1, day: 31, label: "法定調書合計表・給与支払報告書 提出期限", desc: "税務署に法定調書合計表、市区町村に給与支払報告書を提出。源泉徴収票も従業員へ交付" },
    // 2月
    { month: 2, day: 15, label: "協会けんぽ 新年度料率の確認", desc: "例年2月に翌年度の健康保険・介護保険料率が公表される。マスタ設定の更新準備を。※R7年度: 北海道 健保5.155%（変更なし）/ 介護0.795%（変更なし）" },
    // 3月
    { month: 3, day: 1, label: "健康保険・介護保険料率の改定（3月分〜）", desc: "協会けんぽの新料率が3月分から適用。翌月徴収の場合4月給与から控除額が変わる。マスタ設定の料率を必ず確認。※R7年度: 北海道 健保10.31%（折半5.155%）/ 介護1.59%（折半0.795%）→ 前年度と同率" },
    { month: 3, day: 15, label: "36協定の更新確認（4月起算の場合）", desc: "36協定の有効期間が4/1起算の場合、更新届を労基署へ提出。運送業は年960時間上限に注意" },
    // 4月
    { month: 4, day: 1, label: "雇用保険料率の改定", desc: "雇用保険料率が年度替わりで変更される場合あり。4/1以降に締日がくる給与から新料率を適用。※R7年度: 一般事業 労働者0.55%/事業主0.9%（R6年度の0.6%/0.95%から引下げ）" },
    { month: 4, day: 1, label: "子ども・子育て拠出金率の確認", desc: "事業主のみ負担の拠出金率を確認。変更があればマスタ設定を更新。※R7年度: 0.36%で据置き（R2年度から6年連続同率）" },
    // 5月
    { month: 5, day: 20, label: "住民税 特別徴収税額決定通知書の受領・確認", desc: "市区町村から届く通知書で各従業員の新年度住民税額を確認。6月〜翌5月の12回分を給与システムに反映" },
    // 6月
    { month: 6, day: 1, label: "住民税 新年度額の天引き開始", desc: "6月給与から新年度の住民税額に切替。初月は端数調整で他の月と金額が異なる場合あり" },
    { month: 6, day: 1, label: "労働保険 年度更新（申告期間開始）", desc: "6/1〜7/10が申告期間。前年度の確定保険料と新年度の概算保険料を申告・納付。労災保険率決定通知書も確認" },
    // 7月
    { month: 7, day: 1, label: "算定基礎届の届出（7/1〜7/10）", desc: "4〜6月の報酬をもとに標準報酬月額を届出。9月から新等級が適用（翌月徴収なら10月給与から反映）" },
    { month: 7, day: 10, label: "労働保険 年度更新の申告・納付期限", desc: "労働保険の年度更新手続き最終期限。労災保険料・雇用保険料の確定・概算申告" },
    { month: 7, day: 10, label: "源泉所得税の納付（納期の特例・1〜6月分）", desc: "10人未満の特例適用事業所は1〜6月分の源泉所得税を7/10までに納付" },
    // 9月
    { month: 9, day: 1, label: "新標準報酬月額の適用開始", desc: "算定基礎届の結果に基づく新等級が9月分から適用。翌月徴収の場合10月給与から保険料が変わる。従業員の標報を更新すること" },
    // 10月
    { month: 10, day: 1, label: "最低賃金の改定・発効", desc: "都道府県別の最低賃金が改定（例年10/1発効）。全従業員の時間単価が最低賃金以上か確認" },
    { month: 10, day: 1, label: "新標準報酬月額に基づく保険料控除開始", desc: "翌月徴収の場合、10月給与から9月適用の新標準報酬月額で社会保険料を控除" },
    { month: 10, day: 15, label: "有給休暇の取得状況確認", desc: "年10日以上付与の従業員は年5日の取得が義務（違反で1人30万円以下の罰金）。基準日から1年以内の消化状況を確認" },
    // 11月
    { month: 11, day: 1, label: "年末調整 準備開始", desc: "扶養控除等申告書・保険料控除申告書・配偶者控除等申告書・基礎控除申告書を従業員から回収" },
    { month: 11, day: 15, label: "定期健康診断の実施確認", desc: "年1回の定期健診が全従業員に対して完了しているか確認。未実施なら年内に実施すること（事業者の義務）" },
    // 12月
    { month: 12, day: 20, label: "年末調整の実施", desc: "12月支給分の給与で年末調整の過不足を精算。扶養人数・保険料控除・基礎控除等を反映して所得税を再計算" },
];

export const getUpcomingReminders = () => {
    const today = new Date();
    const y = today.getFullYear();
    const events = [];
    for (const ev of ANNUAL_EVENTS) {
        const d1 = new Date(y, ev.month - 1, ev.day);
        const d2 = new Date(y + 1, ev.month - 1, ev.day);
        events.push({ ...ev, date: d1 });
        events.push({ ...ev, date: d2 });
    }
    return events
        .filter((e) => e.date >= today)
        .sort((a, b) => a.date - b.date)
        .slice(0, 8)
        .map((e) => {
            const diff = Math.ceil((e.date - today) / 86400000);
            return { ...e, daysUntil: diff, urgency: diff <= 14 ? "urgent" : diff <= 45 ? "soon" : "ok" };
        });
};

export const buildInsights = (employees, attendance, prevMonthHistory, settings, payrollMonth, paidLeaveBalance = [], calculatedResults = null, EMPTY_ATTENDANCE) => {
    const txYear = taxYearFromPayMonth(payrollMonth);
    const getResult = (emp) => {
        if (calculatedResults) {
            const found = calculatedResults.find((r) => r.emp.id === emp.id);
            if (found) return found.result;
        }
        return calcPayroll(emp, attendance[emp.id] || EMPTY_ATTENDANCE, settings, { taxYear: txYear });
    };
    const insights = [];
    const active = employees.filter((e) => e.status === "在籍");
    const warnH = Number(settings?.overtimeWarningHours) || 45;
    const limitH = Number(settings?.overtimeLimitHours) || 80;

    if (payrollMonth) {
        const mm = parseInt(payrollMonth.split("-")[1], 10);
        if (mm === 6) {
            insights.push({ type: "warn", text: "【重要】6月支給分の給与です。今年度の「住民税」が変更になります。従業員一覧の「住民税 一括更新」から新年度の額を適用してください。" });
        } else if (mm === 9) {
            insights.push({ type: "warn", text: "【重要】9月支給分の給与です。算定基礎届による新しい「標準報酬月額」が適用開始となります。従業員設定から各等級を更新してください。" });
        } else if (mm === 7) {
            insights.push({ type: "info", text: "【お知らせ】7月は「算定基礎届」の提出月です。4〜6月の支給実績をもとに標準報酬月額を算定し、年金事務所へ提出してください。" });
        }
    }

    active.forEach((emp) => {
        const att = attendance[emp.id];
        if (!att) return;
        const totalOT = (att.legalOT || 0) + (att.prescribedOT || 0) + (att.nightOT || 0) + (att.holidayOT || 0);
        if (totalOT >= limitH) {
            insights.push({ type: "warn", text: `${emp.name}: 残業${totalOT}hは上限${limitH}hに到達。36協定違反の可能性があります。` });
        } else if (totalOT >= warnH) {
            insights.push({ type: "warn", text: `${emp.name}: 残業${totalOT}hは警告ライン（${warnH}h）を超えています。` });
        }
        if ((emp.fixedOvertimeHours || 0) > 0) {
            const actualOT = (att.legalOT || 0) + (att.prescribedOT || 0);
            if (actualOT > emp.fixedOvertimeHours) {
                insights.push({ type: "info", text: `${emp.name}: 固定残業${emp.fixedOvertimeHours}hを超過（実${actualOT.toFixed(1)}h）。超過分${(actualOT - emp.fixedOvertimeHours).toFixed(1)}hの残業手当を追加支給します。` });
            }
        }
    });

    if (prevMonthHistory && prevMonthHistory.gross > 0) {
        const currentGross = active.reduce((s, emp) => s + getResult(emp).gross, 0);
        const diff = currentGross - prevMonthHistory.gross;
        const pct = Math.round((diff / prevMonthHistory.gross) * 100);
        if (Math.abs(pct) >= 10) {
            insights.push({ type: "info", text: `総支給額が前月比 ${pct > 0 ? "+" : ""}${pct}%（${diff > 0 ? "+" : ""}¥${fmt(diff)}）変動しています。残業時間の増減が主な要因です。` });
        }
    }

    active.forEach((emp) => {
        const result = getResult(emp);
        if (emp.stdMonthly > 0 && Math.abs(result.gross - emp.stdMonthly) / emp.stdMonthly > 0.2) {
            insights.push({ type: "info", text: `${emp.name}: 実際の総支給（¥${fmt(result.gross)}）と標準報酬月額（¥${fmt(emp.stdMonthly)}）の差が20%超。算定基礎届の時期に等級変更を検討してください。` });
        }
        if (emp.stdMonthly > 0 && !findGradeByStdMonthly(emp.stdMonthly)) {
            insights.push({ type: "warn", text: `${emp.name}: 標準報酬月額 ¥${fmt(emp.stdMonthly)} が等級表に該当しません。従業員マスタで正しい等級を選択してください。` });
        }
    });

    if (prevMonthHistory && prevMonthHistory.status === "確定" && prevMonthHistory.gross > 0) {
        const currentResults = active.map((emp) => calcPayroll(emp, attendance[emp.id] || EMPTY_ATTENDANCE, settings, { taxYear: txYear }));
        const currentTotalDeduct = currentResults.reduce((s, r) => s + r.totalDeduct, 0);
        const savedTotalDeduct = prevMonthHistory.gross - prevMonthHistory.net;
        if (savedTotalDeduct > 0 && Math.abs(currentTotalDeduct - savedTotalDeduct) / savedTotalDeduct > 0.1) {
            insights.push({ type: "warn", text: "直近の確定月と現在の設定で控除額の計算結果に差異があります。料率や標報が変更されていないか確認してください。" });
        }
    }

    active.forEach((emp) => {
        const leave = paidLeaveBalance.find((row) => row.empId === emp.id);
        if (!leave) return;
        const annualGranted = (leave.granted || 0) + (leave.carry || 0);
        const baseGrant = leave.granted || 0;
        if (baseGrant >= 10) {
            const used = leave.used || 0;
            if (used < 5) {
                insights.push({
                    type: "warn",
                    text: `${emp.name}: 年度付与${baseGrant}日のうち取得済み${used}日。法令で必要な年５日取得まであと${(5 - used).toFixed(1)}日。早めに取得促進を。`,
                });
            }
        }
    });

    if (insights.length === 0) {
        insights.push({ type: "ok", text: "特に問題は検出されませんでした。" });
    }
    return insights;
};
