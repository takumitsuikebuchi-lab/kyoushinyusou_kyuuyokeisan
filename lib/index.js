// lib/index.js - Barrel export for all payroll library modules
// Usage: import { calcPayroll, estimateTax, ... } from "@/lib";

export {
  DEFAULT_RATES,
  buildRates,
  calcOvertime,
  calcPayroll,
  TAX_TABLE_R8,
  estimateTax,
  STD_MONTHLY_GRADES,
  findGradeByStdMonthly,
  findGradeByPay,
} from "./payroll-calc.js";

export {
  pad2,
  parsePayDay,
  isNextMonthPay,
  toIsoDate,
  processingMonthOf,
  fiscalYearOf,
  buildFiscalMonths,
  monthFullLabel,
  monthLabel,
  fiscalYearFromDate,
  parseDateLike,
  formatDateJP,
  calcDefaultPayDateByMonth,
  defaultPayDateStringByMonth,
  payrollCycleLabel,
  fmt,
  money,
  parseMoney,
  normalizeName,
  normalizeHrmosEmployeeNumber,
  getEmployeeHrmosNumber,
  upsertMonthHistory,
  nextActionText,
  EMPTY_ATTENDANCE,
} from "./date-utils.js";

export {
  findEmployeesByHrmosNumber,
  collectEmployeeSetupIssues,
  matchEmployeeByHrmosRecord,
  hrmosMatchTypeLabel,
  toAttendanceFromHrmosRecord,
} from "./hrmos-matching.js";

export {
  parseCsvRows,
  detectDelimiter,
  normalizeHeader,
  findIndexBy,
} from "./csv-parser.js";
