"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  calcPayroll, buildRates, estimateTax, taxYearFromPayMonth,
  calcBonus, calcYearEndAdjustment,
  STD_MONTHLY_GRADES, findGradeByStdMonthly, findGradeByPay,
  TAX_TABLE_R7, TAX_TABLE_R8,
} from "@/lib/payroll-calc";
import {
  INITIAL_EMPLOYEES, INITIAL_ATTENDANCE, INITIAL_MONTHLY_HISTORY,
  INITIAL_PAID_LEAVE_BALANCE, INITIAL_MASTER_SETTINGS,
  INITIAL_HRMOS_SETTINGS, INITIAL_MONTHLY_SNAPSHOTS
} from "@/lib/constants";
import { IconChevron, Tip, Card, Badge, statusBadgeVariant, Collapsible } from "@/app/components/ui";
import { SettingsPage } from "@/app/components/SettingsPage";
import { Nav } from "@/app/components/Nav";
import { HistoryPage } from "@/app/components/HistoryPage";
import { LeavePage } from "@/app/components/LeavePage";
import { AuditLogPanel } from "@/app/components/AuditLogPanel";
import { BackupPanel } from "@/app/components/BackupPanel";

import {
  pad2, parsePayDay, isNextMonthPay, toIsoDate, processingMonthOf, fiscalYearOf, buildFiscalMonths,
  monthFullLabel, monthLabel, fiscalYearFromDate, parseDateLike, formatDateJP,
  calcDefaultPayDateByMonth, defaultPayDateStringByMonth, payrollCycleLabel, fmt, money, parseMoney,
  normalizeName, normalizeHrmosEmployeeNumber, getEmployeeHrmosNumber, upsertMonthHistory, nextActionText, EMPTY_ATTENDANCE
} from "@/lib/date-utils";
import { findEmployeesByHrmosNumber, collectEmployeeSetupIssues, matchEmployeeByHrmosRecord, hrmosMatchTypeLabel, toAttendanceFromHrmosRecord } from "@/lib/hrmos-matching";
import { parseCsvRows, detectDelimiter, normalizeHeader, findIndexBy } from "@/lib/csv-parser";
import {
  REF_TODAY, CURRENT_MONTH, CURRENT_PAY_DATE, CURRENT_PROCESSING_MONTH,
  toSnapshotRowFromCalc, buildMonthlyChecks, ANNUAL_EVENTS, getUpcomingReminders, buildInsights
} from "@/lib/page-utils";

// ===== 税額表・等級表・計算ロジックは lib/payroll-calc.js から import =====

import { DashboardPage } from "@/app/components/DashboardPage";
import { PayrollPage } from "@/app/components/PayrollPage";
import { EmployeesPage } from "@/app/components/EmployeesPage";

// ===== Main App =====
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [attendance, setAttendance] = useState(INITIAL_ATTENDANCE);
  const [monthlyHistory, setMonthlyHistory] = useState(() =>
    upsertMonthHistory(INITIAL_MONTHLY_HISTORY, CURRENT_PROCESSING_MONTH, { payDate: defaultPayDateStringByMonth(CURRENT_PROCESSING_MONTH, INITIAL_MASTER_SETTINGS.paymentDay), gross: 0, net: 0, confirmedBy: "-", status: "未計算" })
  );
  const [monthlySnapshots, setMonthlySnapshots] = useState(INITIAL_MONTHLY_SNAPSHOTS);
  const [paidLeaveBalance, setPaidLeaveBalance] = useState(INITIAL_PAID_LEAVE_BALANCE);
  const [settings, setSettings] = useState(INITIAL_MASTER_SETTINGS);
  const [hrmosSettings, setHrmosSettings] = useState(INITIAL_HRMOS_SETTINGS);
  const [hrmosSyncPreview, setHrmosSyncPreview] = useState(null);
  const [hrmosUnmatchedRecords, setHrmosUnmatchedRecords] = useState([]);
  const [syncStatus, setSyncStatus] = useState("");
  const [calcStatus, setCalcStatus] = useState("");
  const [isAttendanceDirty, setIsAttendanceDirty] = useState(false);
  const [changeLogs, setChangeLogs] = useState([]);
  const [isStateHydrated, setIsStateHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState("読込中");
  const isSavingRef = useRef(false);
  const hydratedAtRef = useRef(null); // hydrate完了時刻（直後のauto-save抑制用）
  const [userEmail, setUserEmail] = useState("");

  // Fetch logged-in user email
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
  }, []);

  const sortedMonthlyHistory = useMemo(() => [...monthlyHistory].sort((a, b) => a.month.localeCompare(b.month)), [monthlyHistory]);
  const oldestUnconfirmed = sortedMonthlyHistory.find((m) => m.status !== "確定");
  const payrollTargetMonth = oldestUnconfirmed?.month || CURRENT_PROCESSING_MONTH;
  const payrollTargetRow = sortedMonthlyHistory.find((m) => m.month === payrollTargetMonth);
  const payrollTargetPayDate = payrollTargetRow?.payDate || defaultPayDateStringByMonth(payrollTargetMonth, settings.paymentDay);
  const payrollTargetStatus = payrollTargetRow?.status || "未計算";
  const monthlyChecks = useMemo(
    () => buildMonthlyChecks(employees, attendance, payrollTargetStatus, hrmosSettings, hrmosUnmatchedRecords, findEmployeesByHrmosNumber, normalizeHrmosEmployeeNumber, getEmployeeHrmosNumber, collectEmployeeSetupIssues, EMPTY_ATTENDANCE),
    [employees, attendance, payrollTargetStatus, hrmosSettings, hrmosUnmatchedRecords]
  );
  const latestConfirmedMonth = useMemo(() => sortedMonthlyHistory.filter((m) => m.status === "確定").map((m) => m.month).sort((a, b) => a.localeCompare(b)).at(-1) || null, [sortedMonthlyHistory]);
  const monthlyProgressText = oldestUnconfirmed ? `確定済み: ${latestConfirmedMonth ? monthFullLabel(latestConfirmedMonth) : "なし"} / 次: ${monthFullLabel(oldestUnconfirmed.month)}` : `全期間確定済み`;
  const actionText = nextActionText(payrollTargetStatus, isAttendanceDirty);

  // Status bar dot color
  const statusDotClass = payrollTargetStatus === "確定" && !isAttendanceDirty ? "green" : isAttendanceDirty || payrollTargetStatus === "計算中" ? "yellow" : payrollTargetStatus === "未計算" ? "red" : "green";

  useEffect(() => {
    setMonthlyHistory((prev) => upsertMonthHistory(prev, CURRENT_PROCESSING_MONTH, { payDate: defaultPayDateStringByMonth(CURRENT_PROCESSING_MONTH, settings.paymentDay), status: prev.find((m) => m.month === CURRENT_PROCESSING_MONTH)?.status || "未計算" }));
  }, []);

  // Hydrate
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        setSaveStatus("読込中");
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const payload = await res.json();
        const saved = payload?.data;
        if (saved && !cancelled) {
          // リロード時は常にダッシュボードから開始（saved.pageは復元しない）
          setEmployees((saved.employees || INITIAL_EMPLOYEES).map((emp) => ({ ...emp, hrmosEmployeeNumber: getEmployeeHrmosNumber(emp) })));

          // attendanceが配列形式の場合、オブジェクト形式に変換
          let attendanceData = saved.attendance || INITIAL_ATTENDANCE;
          if (Array.isArray(attendanceData)) {
            const attendanceObj = {};
            attendanceData.forEach(att => {
              const empId = String(att.employeeId);
              attendanceObj[empId] = {
                ...EMPTY_ATTENDANCE,
                workDays: att.workDays || 0,
                legalOT: att.overtimeHours || 0,
                nightOT: att.lateNightHours || 0,
              };
            });
            attendanceData = attendanceObj;
          } else {
            // 旧オブジェクト形式に不足フィールドがあればEMPTY_ATTENDANCEのデフォルトをマージ
            const migrated = {};
            for (const [empId, att] of Object.entries(attendanceData)) {
              migrated[empId] = { ...EMPTY_ATTENDANCE, ...att };
            }
            attendanceData = migrated;
          }
          setAttendance(attendanceData);
          const mergedSettings = { ...INITIAL_MASTER_SETTINGS, ...(saved.settings || {}) };
          // マイグレーション: 旧‰値が残っている場合は全料率を自動で%に変換
          // 判定基準: 厚生年金率が50超なら旧‰形式（%で50超は現実的にありえない）
          const rateKeys = ["healthRate", "healthRateEmployer", "kaigoRate", "kaigoRateEmployer", "pensionRate", "pensionRateEmployer", "childCareRate", "employmentRate"];
          if (typeof mergedSettings.pensionRate === "number" && mergedSettings.pensionRate > 50) {
            for (const k of rateKeys) {
              if (typeof mergedSettings[k] === "number") {
                mergedSettings[k] = Math.round(mergedSettings[k] / 10 * 10000) / 10000;
              }
            }
          }
          setMonthlyHistory(upsertMonthHistory(saved.monthlyHistory || INITIAL_MONTHLY_HISTORY, CURRENT_PROCESSING_MONTH, { payDate: defaultPayDateStringByMonth(CURRENT_PROCESSING_MONTH, mergedSettings.paymentDay), status: (saved.monthlyHistory || []).find((m) => m.month === CURRENT_PROCESSING_MONTH)?.status || "未計算" }));
          setMonthlySnapshots(saved.monthlySnapshots || INITIAL_MONTHLY_SNAPSHOTS);
          setPaidLeaveBalance(saved.paidLeaveBalance || INITIAL_PAID_LEAVE_BALANCE);
          setSettings(mergedSettings);
          setHrmosSettings({ ...INITIAL_HRMOS_SETTINGS, ...(saved.hrmosSettings || {}) });
          setHrmosSyncPreview(saved.hrmosSyncPreview || null);
          setHrmosUnmatchedRecords(Array.isArray(saved.hrmosUnmatchedRecords) ? saved.hrmosUnmatchedRecords : []);
          setSyncStatus(saved.syncStatus || "");
          setCalcStatus(saved.calcStatus || "");
          setIsAttendanceDirty(Boolean(saved.isAttendanceDirty));
          setChangeLogs(Array.isArray(saved.changeLogs) ? saved.changeLogs : []);
        }
        if (!cancelled) {
          setSaveStatus("保存済み");
        }
      } catch { if (!cancelled) setSaveStatus("ローカル保存未接続"); }
      finally {
        if (!cancelled) {
          hydratedAtRef.current = Date.now();
          setIsStateHydrated(true);
        }
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, []);

  // Auto-save (debounced 800ms to reduce rapid-fire writes)
  useEffect(() => {
    if (!isStateHydrated) return;
    const timer = setTimeout(async () => {
      // hydrate直後2秒間はauto-saveをスキップ（連続書き込みによる重複を防ぐ）
      if (hydratedAtRef.current && Date.now() - hydratedAtRef.current < 2000) return;
      // 保存中なら重複リクエストをスキップ
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      try {
        setSaveStatus("保存中");
        const res = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employees,
            attendance,
            monthlyHistory,
            monthlySnapshots,
            paidLeaveBalance,
            settings,
            hrmosSettings,
            hrmosSyncPreview,
            hrmosUnmatchedRecords,
            syncStatus,
            calcStatus,
            isAttendanceDirty,
            changeLogs,
            _userEmail: userEmail || null,
          }),
        });
        if (!res.ok) throw new Error("failed");
        setSaveStatus("保存済み");
      } catch { setSaveStatus("保存失敗"); }
      finally { isSavingRef.current = false; }
    }, 800);
    return () => clearTimeout(timer);
  }, [isStateHydrated, employees, attendance, monthlyHistory, monthlySnapshots, paidLeaveBalance, settings, hrmosSettings, hrmosSyncPreview, hrmosUnmatchedRecords, syncStatus, calcStatus, isAttendanceDirty, changeLogs]);

  const onConfirmPayroll = (results) => {
    const totalGross = results.reduce((s, r) => s + r.result.gross, 0);
    const totalNet = results.reduce((s, r) => s + r.result.netPay, 0);
    setMonthlyHistory((prev) => upsertMonthHistory(prev, payrollTargetMonth, { payDate: payrollTargetPayDate, gross: totalGross, net: totalNet, confirmedBy: "管理者", status: "確定" }));
    setMonthlySnapshots((prev) => ({ ...prev, [payrollTargetMonth]: results.map((r) => toSnapshotRowFromCalc(r.emp, r.result, r.att || attendance[r.emp.id] || EMPTY_ATTENDANCE)) }));
    setCalcStatus("手動確定完了");
    setIsAttendanceDirty(false);
    setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "確定", text: `${monthFullLabel(payrollTargetMonth)} を手動確定` }, ...prev].slice(0, 30));
  };

  const onUndoConfirm = () => {
    setMonthlyHistory((prev) => upsertMonthHistory(prev, payrollTargetMonth, { status: "計算済", confirmedBy: "-" }));
    setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "取消", text: `${monthFullLabel(payrollTargetMonth)} の確定を取り消し` }, ...prev].slice(0, 30));
  };

  const onAttendanceChange = () => {
    setMonthlyHistory((prev) => upsertMonthHistory(prev, payrollTargetMonth, { status: "計算中", confirmedBy: "-" }));
    setIsAttendanceDirty(true);
  };

  const onHrmosSync = async () => {
    setSyncStatus("同期中...");
    try {
      const res = await fetch("/api/hrmos/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...hrmosSettings, targetMonth: payrollTargetMonth }) });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "同期に失敗しました");
      }
      if (!Array.isArray(data.data)) {
        throw new Error("勤怠データ形式が不正です");
      }

      const previewRows = data.data.map((hrmosRecord, idx) => {
        const matched = matchEmployeeByHrmosRecord(hrmosRecord, employees);
        const matchedEmployee = employees.find((e) => String(e.id) === String(matched.matchedEmployeeId));
        return {
          recordKey: `${String(hrmosRecord.employeeId || "")}:${normalizeName(hrmosRecord.employeeName)}:${idx}`,
          hrmosEmployeeId: String(hrmosRecord.employeeId || ""),
          hrmosEmployeeName: String(hrmosRecord.employeeName || "").trim(),
          hrmosRecord,
          matchType: matched.matchType,
          matchReason: matched.reason || "",
          matchedEmployeeId: matched.matchedEmployeeId ? String(matched.matchedEmployeeId) : "",
          matchedEmployeeName: matchedEmployee?.name || "",
        };
      });
      const autoApplicableCount = previewRows.filter((row) => row.matchType === "hrmosId" || row.matchType === "legacyId").length;
      const manualReviewCount = previewRows.length - autoApplicableCount;
      setHrmosSyncPreview({
        month: data.month || payrollTargetMonth,
        syncedAt: data.syncedAt || new Date().toISOString(),
        recordCount: data.recordCount || previewRows.length,
        autoApplicableCount,
        manualReviewCount,
        rows: previewRows,
      });
      setSyncStatus(`プレビュー作成: ${previewRows.length}件（自動反映 ${autoApplicableCount} / 手動確認 ${manualReviewCount}）`);
      setChangeLogs((prev) => [{
        at: new Date().toISOString(),
        type: "連携",
        text: `HRMOS取込プレビューを作成（${previewRows.length}件）`,
      }, ...prev].slice(0, 30));
    } catch (err) {
      setSyncStatus(`同期失敗: ${err.message}`);
      setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "エラー", text: `HRMOS同期エラー: ${err.message}` }, ...prev].slice(0, 30));
    }
  };

  const onClearHrmosPreview = () => {
    setHrmosSyncPreview(null);
    setSyncStatus("プレビューを破棄しました");
  };

  const onApplyHrmosPreview = () => {
    if (!hrmosSyncPreview || !Array.isArray(hrmosSyncPreview.rows)) return;
    const nextAttendance = { ...attendance };
    const nextUnmatched = [];
    let appliedCount = 0;
    hrmosSyncPreview.rows.forEach((row) => {
      if (row.matchType === "hrmosId" || row.matchType === "legacyId") {
        const targetEmpId = String(row.matchedEmployeeId || "");
        if (targetEmpId) {
          const prevAtt = nextAttendance[targetEmpId] || EMPTY_ATTENDANCE;
          nextAttendance[targetEmpId] = toAttendanceFromHrmosRecord(row.hrmosRecord, prevAtt, hrmosSyncPreview.syncedAt);
          appliedCount += 1;
          return;
        }
      }
      nextUnmatched.push({
        recordKey: row.recordKey,
        hrmosEmployeeId: row.hrmosEmployeeId,
        hrmosEmployeeName: row.hrmosEmployeeName,
        reason: row.matchReason || (row.matchType === "nameOnly" ? "氏名一致のみ（手動確認が必要）" : "未紐付け"),
        suggestedEmployeeId: row.matchType === "nameOnly" ? String(row.matchedEmployeeId || "") : "",
        assignedEmployeeId: row.matchType === "nameOnly" ? String(row.matchedEmployeeId || "") : "",
        hrmosRecord: row.hrmosRecord,
        syncedAt: hrmosSyncPreview.syncedAt,
      });
    });
    setAttendance(nextAttendance);
    if (appliedCount > 0) setIsAttendanceDirty(true);
    setHrmosUnmatchedRecords(nextUnmatched);
    setHrmosSyncPreview(null);
    setSyncStatus(`反映完了: ${appliedCount}件 / 未紐付け ${nextUnmatched.length}件`);
    setChangeLogs((prev) => [{
      at: new Date().toISOString(),
      type: "連携",
      text: `HRMOS反映: ${appliedCount}件適用 / 未紐付け${nextUnmatched.length}件`,
    }, ...prev].slice(0, 30));

    if (hrmosSettings.autoCalcEnabled && nextUnmatched.length === 0 && appliedCount > 0) {
      onRunAutoCalc(nextAttendance, { unmatchedCount: nextUnmatched.length });
    }
  };

  const onSetHrmosUnmatchedAssignment = (recordKey, employeeId) => {
    setHrmosUnmatchedRecords((prev) => prev.map((row) => (
      row.recordKey === recordKey ? { ...row, assignedEmployeeId: String(employeeId || "") } : row
    )));
  };

  const onApplyHrmosUnmatchedAssignments = () => {
    if (!Array.isArray(hrmosUnmatchedRecords) || hrmosUnmatchedRecords.length === 0) return;
    const nextAttendance = { ...attendance };
    const remain = [];
    let appliedCount = 0;

    hrmosUnmatchedRecords.forEach((row) => {
      const targetEmpId = String(row.assignedEmployeeId || "");
      if (targetEmpId && employees.some((e) => String(e.id) === targetEmpId)) {
        const prevAtt = nextAttendance[targetEmpId] || EMPTY_ATTENDANCE;
        nextAttendance[targetEmpId] = toAttendanceFromHrmosRecord(row.hrmosRecord, prevAtt, row.syncedAt);
        appliedCount += 1;
      } else {
        remain.push(row);
      }
    });

    if (appliedCount === 0) {
      setSyncStatus("未紐付けデータに割当先がありません");
      return;
    }

    setAttendance(nextAttendance);
    setIsAttendanceDirty(true);
    setHrmosUnmatchedRecords(remain);
    setSyncStatus(`未紐付け反映: ${appliedCount}件 / 残り ${remain.length}件`);
    setChangeLogs((prev) => [{
      at: new Date().toISOString(),
      type: "連携",
      text: `未紐付け割当を反映（${appliedCount}件）`,
    }, ...prev].slice(0, 30));

    if (hrmosSettings.autoCalcEnabled && remain.length === 0) {
      onRunAutoCalc(nextAttendance, { unmatchedCount: remain.length });
    }
  };

  const onRunAutoCalc = (attendanceOverride, options = {}) => {
    const unresolvedCount = typeof options.unmatchedCount === "number"
      ? options.unmatchedCount
      : (hrmosUnmatchedRecords || []).length;
    if (unresolvedCount > 0) {
      setCalcStatus("計算停止（未紐付けデータあり）");
      return;
    }
    setCalcStatus("計算実行中...");
    try {
      const att = attendanceOverride || attendance;
      const active = employees.filter((e) => e.status === "在籍");
      const txYear = taxYearFromPayMonth(payrollTargetMonth);
      const results = active.map((emp) => ({
        emp,
        result: calcPayroll(emp, att[emp.id] || EMPTY_ATTENDANCE, settings, { taxYear: txYear }),
      }));

      const totalGross = results.reduce((s, r) => s + r.result.gross, 0);
      const totalNet = results.reduce((s, r) => s + r.result.netPay, 0);
      const totalOT = results.reduce((s, r) => {
        const a = att[r.emp.id] || EMPTY_ATTENDANCE;
        return s + (a.legalOT || 0) + (a.prescribedOT || 0) + (a.nightOT || 0) + (a.holidayOT || 0);
      }, 0);

      setMonthlyHistory((prev) => upsertMonthHistory(prev, payrollTargetMonth, { payDate: payrollTargetPayDate, gross: totalGross, net: totalNet, status: "計算済", confirmedBy: "-" }));
      setMonthlySnapshots((prev) => ({ ...prev, [payrollTargetMonth]: results.map(({ emp, result }) => { const a2 = att[emp.id] || EMPTY_ATTENDANCE; return toSnapshotRowFromCalc(emp, result, a2); }) }));
      setIsAttendanceDirty(false);
      setCalcStatus(`${monthFullLabel(payrollTargetMonth)} 自動計算完了`);
      setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "計算", text: `${monthFullLabel(payrollTargetMonth)} を自動計算（残業${totalOT.toFixed(1)}h）` }, ...prev].slice(0, 30));
    } catch (err) {
      console.error("[onRunAutoCalc] エラー:", err);
      setCalcStatus("計算失敗");
    }
  };

  const onImportHistoryData = (imports) => {
    setMonthlyHistory((prev) => {
      let next = [...prev];
      imports.forEach((item) => { next = upsertMonthHistory(next, item.month, { payDate: item.payDate, gross: item.gross, net: item.net, status: "確定", confirmedBy: "CSV取込" }); });
      return next;
    });
    setMonthlySnapshots((prev) => {
      const next = { ...prev };
      imports.forEach((item) => { next[item.month] = item.details; });
      return next;
    });
    setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "取込", text: `${imports.length}件のCSVを取り込み` }, ...prev].slice(0, 30));
  };

  return (
    <div className="app-layout">
      <Nav page={page} setPage={setPage} userEmail={userEmail} />
      <main className="app-main">
        {/* Compact Status Bar */}
        <div className="status-bar">
          <span className={`status-dot ${statusDotClass}`} />
          <span>{monthFullLabel(payrollTargetMonth)}</span>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <span>{actionText}</span>
          <span style={{ color: "#cbd5e1" }}>|</span>
          <span style={{ color: saveStatus === "保存失敗" ? "#dc2626" : undefined }}>{saveStatus}</span>
        </div>


        {page === "dashboard" && (
          <DashboardPage employees={employees} attendance={attendance}
            payrollMonth={payrollTargetMonth} payrollPayDate={payrollTargetPayDate}
            payrollStatus={payrollTargetStatus} isAttendanceDirty={isAttendanceDirty}
            monthlyHistory={monthlyHistory} settings={settings} setPage={setPage}
            paidLeaveBalance={paidLeaveBalance} />
        )}
        {page === "payroll" && (
          <PayrollPage employees={employees} attendance={attendance} setAttendance={setAttendance}
            onConfirmPayroll={onConfirmPayroll} onUndoConfirm={onUndoConfirm} onAttendanceChange={onAttendanceChange}
            payrollMonth={payrollTargetMonth} payrollPayDate={payrollTargetPayDate}
            payrollStatus={payrollTargetStatus} isAttendanceDirty={isAttendanceDirty}
            hrmosSettings={hrmosSettings} setHrmosSettings={setHrmosSettings}
            onHrmosSync={onHrmosSync} onRunAutoCalc={onRunAutoCalc}
            syncStatus={syncStatus} calcStatus={calcStatus} monthlyChecks={monthlyChecks}
            monthlyProgressText={monthlyProgressText} settings={settings}
            hrmosSyncPreview={hrmosSyncPreview} hrmosUnmatchedRecords={hrmosUnmatchedRecords}
            onApplyHrmosPreview={onApplyHrmosPreview} onClearHrmosPreview={onClearHrmosPreview}
            onSetHrmosUnmatchedAssignment={onSetHrmosUnmatchedAssignment}
            onApplyHrmosUnmatchedAssignments={onApplyHrmosUnmatchedAssignments} />
        )}
        {page === "employees" && (
          <EmployeesPage employees={employees} setEmployees={setEmployees} setAttendance={setAttendance}
            setPaidLeaveBalance={setPaidLeaveBalance} onGoPayroll={() => setPage("payroll")} setChangeLogs={setChangeLogs} settings={settings} />
        )}
        {page === "history" && (
          <HistoryPage employees={employees} attendance={attendance} monthlyHistory={monthlyHistory}
            monthlySnapshots={monthlySnapshots} onImportHistoryData={onImportHistoryData} companyName={settings.companyName}
            settings={settings} payrollTargetMonth={payrollTargetMonth} onRefreshTargetSnapshot={() => onRunAutoCalc(attendance)} />
        )}
        {page === "leave" && <LeavePage employees={employees} paidLeaveBalance={paidLeaveBalance} setPaidLeaveBalance={setPaidLeaveBalance} />}
        {page === "settings" && <SettingsPage settings={settings} setSettings={setSettings} />}

        {/* Activity Log - Collapsible */}
        <div style={{ marginTop: 24 }}>
          <Collapsible title={`操作履歴（${changeLogs.length}件）`}>
            {changeLogs.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>操作履歴はありません</div>
            ) : (
              <div>
                {changeLogs.map((log, idx) => (
                  <div key={`${log.at}-${idx}`} className="log-row">
                    <span className="log-type">{log.type}</span>
                    <span className="log-time">{new Date(log.at).toLocaleString("ja-JP")}</span>
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>
            )}
          </Collapsible>
        </div>

        {/* Audit Log - Server-side logs from Supabase */}
        <div style={{ marginTop: 8 }}>
          <AuditLogPanel />
        </div>

        {/* Backup / Rollback */}
        <div style={{ marginTop: 8 }}>
          <BackupPanel userEmail={userEmail} onRestore={(data) => {
            if (!data || typeof data !== "object") return;
            if (!window.confirm("このバックアップからデータを復元しますか？現在のデータは上書きされます。")) return;
            if (data.employees) setEmployees(data.employees);
            if (data.attendance) setAttendance(data.attendance);
            if (data.monthlyHistory) setMonthlyHistory(data.monthlyHistory);
            if (data.monthlySnapshots) setMonthlySnapshots(data.monthlySnapshots);
            if (data.paidLeaveBalance) setPaidLeaveBalance(data.paidLeaveBalance);
            if (data.settings) setSettings({ ...INITIAL_MASTER_SETTINGS, ...data.settings });
            if (data.hrmosSettings) setHrmosSettings({ ...INITIAL_HRMOS_SETTINGS, ...data.hrmosSettings });
            setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "復元", text: "バックアップから復元しました" }, ...prev].slice(0, 30));
          }} stateForBackup={{
            employees, attendance, monthlyHistory, monthlySnapshots, paidLeaveBalance,
            settings, hrmosSettings, changeLogs,
          }} />
        </div>
      </main>
    </div>
  );
}
