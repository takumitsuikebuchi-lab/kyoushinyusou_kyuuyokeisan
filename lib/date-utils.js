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

// ===== 日本の祝日計算 =====

// 月の第n月曜日を返す（day of month）
const _nthMonday = (n, year, month) => {
  const dow = new Date(year, month - 1, 1).getDay(); // 0=日, 1=月, ..., 6=土
  const first = dow <= 1 ? 2 - dow : 9 - dow;
  return first + (n - 1) * 7;
};

// 春分の日（3月）の日にちを返す（1980〜2099年有効）
const _springEquinox = (year) =>
  Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

// 秋分の日（9月）の日にちを返す（1980〜2099年有効）
const _autumnEquinox = (year) =>
  Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));

// 指定年の国民の祝日を Set<"YYYY-MM-DD"> で返す
export const getJPHolidaySet = (year) => {
  const h = new Set();
  const k = (m, d) => `${year}-${pad2(m)}-${pad2(d)}`;

  // 固定祝日
  h.add(k(1, 1));   // 元日
  h.add(k(2, 11));  // 建国記念の日
  h.add(k(2, 23));  // 天皇誕生日
  h.add(k(4, 29));  // 昭和の日
  h.add(k(5, 3));   // 憲法記念日
  h.add(k(5, 4));   // みどりの日
  h.add(k(5, 5));   // こどもの日
  h.add(k(8, 11));  // 山の日
  h.add(k(11, 3));  // 文化の日
  h.add(k(11, 23)); // 勤労感謝の日

  // 春分の日・秋分の日
  h.add(k(3, _springEquinox(year)));
  h.add(k(9, _autumnEquinox(year)));

  // ハッピーマンデー
  h.add(k(1,  _nthMonday(2, year, 1)));  // 成人の日（1月第2月曜）
  h.add(k(7,  _nthMonday(3, year, 7)));  // 海の日（7月第3月曜）
  h.add(k(9,  _nthMonday(3, year, 9)));  // 敬老の日（9月第3月曜）
  h.add(k(10, _nthMonday(2, year, 10))); // スポーツの日（10月第2月曜）

  // 国民の休日（2つの祝日に挟まれた平日）
  for (let mo = 1; mo <= 12; mo++) {
    const last = new Date(year, mo, 0).getDate();
    for (let d = 2; d < last; d++) {
      const curr = k(mo, d);
      if (h.has(curr)) continue;
      if (new Date(year, mo - 1, d).getDay() === 0) continue; // 日曜は対象外
      if (h.has(k(mo, d - 1)) && h.has(k(mo, d + 1))) h.add(curr);
    }
  }

  // 振替休日（日曜祝日 → 翌以降の非祝日・非日曜の平日）
  const base = new Set(h);
  base.forEach((dateStr) => {
    const d = new Date(dateStr);
    if (d.getDay() !== 0) return;
    let next = new Date(d.getTime() + 86400000);
    let guard = 0;
    while ((h.has(toIsoDate(next)) || next.getDay() === 0) && guard++ < 7) {
      next = new Date(next.getTime() + 86400000);
    }
    h.add(toIsoDate(next));
  });

  return h;
};

// 支給日が土日祝の場合、直前の営業日（平日・非祝日）に戻す
export const adjustForHoliday = (date) => {
  const cache = {};
  const hols = (y) => { if (!cache[y]) cache[y] = getJPHolidaySet(y); return cache[y]; };
  let d = new Date(date.getTime());
  for (let i = 0; i < 10; i++) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !hols(d.getFullYear()).has(toIsoDate(d))) break;
    d = new Date(d.getTime() - 86400000);
  }
  return d;
};

// month は「支給月」（翌月計算済み）なのでその月の日付をそのまま返す
// 土日祝の場合は直前の営業日に自動調整する
export const payDateForPaymentMonth = (paymentMonth, paymentDayStr) => {
  const [y, m] = String(paymentMonth || "").split("-").map(Number);
  if (!y || !m) return "";
  const raw = new Date(y, m - 1, parsePayDay(paymentDayStr));
  return toIsoDate(adjustForHoliday(raw));
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
