// ===== 日付・月次ユーティリティ =====

export const pad2 = (n) => String(n).padStart(2, "0");

export const parsePayDay = (paymentDayStr) => {
  const match = String(paymentDayStr || "").match(/(\d+)/);
  return match ? Number(match[1]) : 20;
};

export const isNextMonthPay = (paymentDayStr) => String(paymentDayStr || "").includes("翌月");

export const toIsoDate = (dateObj) => {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return "";
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
};

export const processingMonthOf = (date, payDay) => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  if (date.getDate() <= payDay) d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

export const fiscalYearOf = (month) => {
  const [y, m] = String(month).split("-").map(Number);
  // 支給月ベース：3月払い〜翌年2月払いを1年度とする
  return m >= 3 ? y : y - 1;
};

export const buildFiscalMonths = (fy) => [
  // 3月支給〜12月支給（当年）
  ...Array.from({ length: 10 }, (_, i) => `${fy}-${String(i + 3).padStart(2, "0")}`),
  // 1月支給、2月支給（翌年）
  `${fy + 1}-01`,
  `${fy + 1}-02`,
];

export const monthFullLabel = (month) => {
  const [y, m] = String(month || "").split("-");
  if (!y || !m) return "-";
  return `${y}年${String(m).padStart(2, "0")}月`;
};

export const monthLabel = monthFullLabel;

export const fiscalYearFromDate = (dateStr, fallbackMonth) => {
  if (!dateStr) return fiscalYearOf(fallbackMonth || "2026-02");
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return fiscalYearOf(fallbackMonth || "2026-02");
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 2 ? y : y - 1;
};

export const parseDateLike = (value) => {
  if (value instanceof Date) return new Date(value.getTime());
  const text = String(value || "").trim();
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  return new Date(text);
};

export const formatDateJP = (value) => {
  const d = parseDateLike(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日`;
};

export const calcDefaultPayDateByMonth = (month, paymentDayStr) => {
  const [y, m] = String(month || "").split("-").map(Number);
  if (!y || !m) return null;
  const day = parsePayDay(paymentDayStr);
  return isNextMonthPay(paymentDayStr) ? new Date(y, m, day) : new Date(y, m - 1, day);
};

export const defaultPayDateStringByMonth = (month, paymentDayStr) => {
  const d = calcDefaultPayDateByMonth(month, paymentDayStr);
  if (!d) return "";
  return toIsoDate(d);
};

// month は「支給月」（翌月計算済み）なのでその月の日付をそのまま返す
export const payDateForPaymentMonth = (paymentMonth, paymentDayStr) => {
  const [y, m] = String(paymentMonth || "").split("-").map(Number);
  if (!y || !m) return "";
  return toIsoDate(new Date(y, m - 1, parsePayDay(paymentDayStr)));
};

export const payrollCycleLabel = (month, payDateOverride) => {
  const [y, m] = String(month || "").split("-").map(Number);
  if (!y || !m) return "-";
  // 支給月の前月末 = new Date(y, m-1, 0)
  const closingDate = new Date(y, m - 1, 0);
  // 支給日（デフォルトは当月20日）
  const payDate = payDateOverride
    ? parseDateLike(payDateOverride)
    : new Date(y, m - 1, 20);
  if (!payDate || Number.isNaN(payDate.getTime())) return "-";
  return `${formatDateJP(payDate)}支給（${formatDateJP(closingDate)}〆）`;
};

// ===== 汎用ヘルパー =====
export const fmt = (n) => n != null ? n.toLocaleString() : "-";
export const money = (n) => `¥${fmt(n || 0)}`;

export const parseMoney = (value) => {
  if (value == null) return 0;
  const num = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
};

export const normalizeName = (value) =>
  String(value || "")
    .replace(/[ 　]/g, "")
    .toLowerCase()
    .trim();

export const normalizeHrmosEmployeeNumber = (value) => String(value || "").trim();

export const getEmployeeHrmosNumber = (emp) => normalizeHrmosEmployeeNumber(emp?.hrmosEmployeeNumber);

export const upsertMonthHistory = (history, month, patch) => {
  const exists = history.some((row) => row.month === month);
  if (!exists) return [...history, { month, payDate: patch?.payDate || "", gross: 0, net: 0, confirmedBy: "-", status: "未計算", ...patch }];
  return history.map((row) => (row.month === month ? { ...row, ...patch } : row));
};

export const nextActionText = (status, isDirty) => {
  if (isDirty) return "勤怠変更あり → 再計算して確定してください";
  if (status === "未計算" || status === "計算中") return "勤怠を取込/入力 → 計算を実行";
  if (status === "計算済") return "計算結果を確認 → 確定してください";
  return "確定済み";
};

export const EMPTY_ATTENDANCE = {
  workDays: 0, scheduledDays: 0, workHours: 0, scheduledHours: 0,
  legalOT: 0, prescribedOT: 0, nightOT: 0, holidayOT: 0,
  otAdjust: 0, basicPayAdjust: 0, otherAllowance: 0,
};
