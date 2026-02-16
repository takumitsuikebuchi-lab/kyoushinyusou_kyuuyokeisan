// ===== HRMOS マッチングロジック =====
import { normalizeName, normalizeHrmosEmployeeNumber, getEmployeeHrmosNumber, EMPTY_ATTENDANCE } from "./date-utils.js";

export const findEmployeesByHrmosNumber = (employees, hrmosEmployeeNumber) => {
  const normalized = normalizeHrmosEmployeeNumber(hrmosEmployeeNumber);
  if (!normalized) return [];
  return employees.filter((e) => getEmployeeHrmosNumber(e) === normalized);
};

export const collectEmployeeSetupIssues = (emp, employees = []) => {
  if (emp.status !== "在籍") return [];
  const issues = [];
  if (!emp.joinDate) issues.push("入社日未設定");
  if (!emp.employmentType) issues.push("雇用区分未設定");
  if ((emp.basicPay || 0) <= 0) issues.push("基本給未設定");
  if ((emp.stdMonthly || 0) <= 0) issues.push("標準報酬未設定");
  if (String(emp.note || "").includes("仮登録")) issues.push("仮登録のまま");
  if ((emp.employmentType === "役員" || emp.isOfficer) && emp.hasEmployment) issues.push("役員で雇保ON");
  if (!getEmployeeHrmosNumber(emp)) issues.push("HRMOS連携ID未設定");
  if (
    getEmployeeHrmosNumber(emp) &&
    employees.some((e) => String(e.id) !== String(emp.id) && getEmployeeHrmosNumber(e) === getEmployeeHrmosNumber(emp))
  ) {
    issues.push("HRMOS連携ID重複");
  }
  return issues;
};

export const matchEmployeeByHrmosRecord = (hrmosRecord, employees) => {
  const hrmosEmployeeNumber = normalizeHrmosEmployeeNumber(hrmosRecord?.employeeId);
  const matchedByHrmosId = findEmployeesByHrmosNumber(employees, hrmosEmployeeNumber);
  if (matchedByHrmosId.length === 1) {
    return { matchedEmployeeId: String(matchedByHrmosId[0].id), matchType: "hrmosId", reason: "" };
  }
  if (matchedByHrmosId.length > 1) {
    return { matchedEmployeeId: null, matchType: "conflict", reason: `HRMOS連携ID ${hrmosEmployeeNumber} が重複` };
  }

  const legacyDirectId = String(hrmosRecord?.employeeId || "");
  if (legacyDirectId && employees.some((e) => String(e.id) === legacyDirectId)) {
    return { matchedEmployeeId: legacyDirectId, matchType: "legacyId", reason: "従業員ID一致（旧方式）" };
  }

  const targetName = normalizeName(hrmosRecord?.employeeName);
  if (!targetName) return { matchedEmployeeId: null, matchType: "unmatched", reason: "氏名情報なし" };
  const nameMatched = employees.filter((e) => normalizeName(e.name) === targetName);
  if (nameMatched.length === 1) {
    return { matchedEmployeeId: String(nameMatched[0].id), matchType: "nameOnly", reason: "氏名一致のみ（手動確認が必要）" };
  }
  if (nameMatched.length > 1) {
    return { matchedEmployeeId: null, matchType: "conflict", reason: "同名従業員が複数" };
  }

  return { matchedEmployeeId: null, matchType: "unmatched", reason: "HRMOS連携ID未登録" };
};

export const hrmosMatchTypeLabel = (matchType) => {
  if (matchType === "hrmosId") return "HRMOS連携ID一致";
  if (matchType === "legacyId") return "従業員ID一致（旧方式）";
  if (matchType === "nameOnly") return "氏名一致のみ";
  if (matchType === "conflict") return "要確認（競合）";
  return "未紐付け";
};

export const toAttendanceFromHrmosRecord = (hrmosRecord, prevAtt, syncedAt) => ({
  workDays: parseFloat(hrmosRecord.workDays) || 0,
  scheduledDays: prevAtt?.scheduledDays || 0,
  workHours: parseFloat(hrmosRecord.totalWorkHours) || 0,
  scheduledHours: prevAtt?.scheduledHours || 0,
  legalOT: parseFloat(hrmosRecord.overtimeHours) || 0,
  prescribedOT: parseFloat(hrmosRecord.prescribedHours) || 0,
  nightOT: parseFloat(hrmosRecord.lateNightHours) || 0,
  holidayOT: parseFloat(hrmosRecord.holidayHours) || 0,
  otAdjust: prevAtt?.otAdjust || 0,
  basicPayAdjust: prevAtt?.basicPayAdjust || 0,
  otherAllowance: prevAtt?.otherAllowance || 0,
  hrmosSync: true,
  syncedAt,
});
