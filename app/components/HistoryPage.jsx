"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Card, Badge, Collapsible } from "@/app/components/ui";
import {
    monthFullLabel, monthLabel, formatDateJP, fmt, money, parseMoney,
    normalizeName, fiscalYearOf, buildFiscalMonths, payrollCycleLabel,
} from "@/lib/date-utils";
import { calcPayroll, taxYearFromPayMonth } from "@/lib/payroll-calc";
import { toSnapshotRowFromCalc, CURRENT_PROCESSING_MONTH, EMPTY_ATTENDANCE } from "@/lib/page-utils";
import { parseCsvRows, detectDelimiter, normalizeHeader, findIndexBy } from "@/lib/csv-parser";

// 旧APIフォーマット→新フォーマット正規化（後方互換）
export const normalizeSnapshotRow = (row) => ({
    empId: row.empId ?? row.employeeId,
    name: row.name ?? row.employeeName,
    jobType: row.jobType ?? row.dept ?? "",
    dept: row.dept || row.jobType || "",
    employmentType: row.employmentType || "",
    basicPay: row.basicPay || 0,
    dutyAllowance: row.dutyAllowance || 0,
    commuteAllow: row.commuteAllow || 0,
    fixedOvertimePay: row.fixedOvertimePay || 0,
    excessOvertimePay: row.excessOvertimePay || 0,
    hasFixedOT: row.hasFixedOT || false,
    overtimePay: row.overtimePay ?? 0,
    prescribedOvertimePay: row.prescribedOvertimePay || 0,
    nightOvertimePay: row.nightOvertimePay ?? row.lateNightPay ?? 0,
    holidayPay: row.holidayPay || 0,
    otAdjust: row.otAdjust || 0,
    basicPayAdjust: row.basicPayAdjust || 0,
    otherAllowance: row.otherAllowance || 0,
    workDays: row.workDays || 0,
    scheduledDays: row.scheduledDays || 0,
    workHours: row.workHours || 0,
    scheduledHours: row.scheduledHours || 0,
    legalOT: row.legalOT || 0,
    prescribedOT: row.prescribedOT || 0,
    nightOT: row.nightOT || 0,
    holidayOT: row.holidayOT || 0,
    gross: row.gross ?? row.grossPay ?? 0,
    health: row.health ?? row.healthInsurance ?? 0,
    kaigo: row.kaigo || 0,
    pension: row.pension ?? row.pensionInsurance ?? 0,
    employment: row.employment ?? row.employmentInsurance ?? 0,
    incomeTax: row.incomeTax || 0,
    residentTax: row.residentTax || 0,
    yearAdjustment: row.yearAdjustment || 0,
    totalDeduct: row.totalDeduct ?? row.totalDeductions ?? 0,
    net: row.net ?? row.netPay ?? 0,
    incomeTaxOverride: row.incomeTaxOverride ?? null,
});

// ===== HistoryPage =====
export const HistoryPage = ({ employees, attendance, monthlyHistory, monthlySnapshots, onImportHistoryData, companyName, settings, payrollTargetMonth, onRefreshTargetSnapshot }) => {
    const [targetMonth, setTargetMonth] = useState(CURRENT_PROCESSING_MONTH);
    const [selectedFiscalYear, setSelectedFiscalYear] = useState(fiscalYearOf(CURRENT_PROCESSING_MONTH));
    const [importMessage, setImportMessage] = useState("");
    const [mfCompareReport, setMfCompareReport] = useState(null);
    const [payslipEmpId, setPayslipEmpId] = useState(null);
    const monthSet = useMemo(() => new Set(monthlyHistory.map((m) => m.month)), [monthlyHistory]);
    const fiscalYears = Array.from(new Set(monthlyHistory.map((m) => fiscalYearOf(m.month)))).sort((a, b) => a - b);
    const latestFiscalYear = Math.max(fiscalYearOf(CURRENT_PROCESSING_MONTH), ...(fiscalYears.length ? fiscalYears : [fiscalYearOf(CURRENT_PROCESSING_MONTH)]));
    const months = buildFiscalMonths(selectedFiscalYear);

    useEffect(() => {
        if (!fiscalYears.includes(selectedFiscalYear)) setSelectedFiscalYear(latestFiscalYear);
    }, [latestFiscalYear, fiscalYears, selectedFiscalYear]);

    useEffect(() => {
        if (!months.includes(targetMonth)) {
            const defaultMonth = months.find((m) => m === CURRENT_PROCESSING_MONTH) || months.find((m) => monthSet.has(m)) || months[0];
            setTargetMonth(defaultMonth);
        }
    }, [months, targetMonth, monthSet]);

    const buildDetailRowsForMonth = (month) => {
        const rawSnapshot = monthlySnapshots[month] || [];
        if (rawSnapshot.length > 0) return rawSnapshot.map(normalizeSnapshotRow);
        if (month === CURRENT_PROCESSING_MONTH) {
            return employees
                .filter((e) => e.status === "在籍")
                .map((emp) => { const a = attendance[emp.id] || EMPTY_ATTENDANCE; return toSnapshotRowFromCalc(emp, calcPayroll(emp, a, settings, { taxYear: taxYearFromPayMonth(month) }), a); });
        }
        return [];
    };

    const selectedHistory = monthlyHistory.find((m) => m.month === targetMonth);
    const detailRows = buildDetailRowsForMonth(targetMonth);

    const detailTotals = detailRows.reduce((acc, row) => ({
        basicPay: acc.basicPay + (row.basicPay || 0), dutyAllowance: acc.dutyAllowance + (row.dutyAllowance || 0),
        overtimePay: acc.overtimePay + (row.overtimePay || 0), prescribedOvertimePay: acc.prescribedOvertimePay + (row.prescribedOvertimePay || 0),
        nightOvertimePay: acc.nightOvertimePay + (row.nightOvertimePay || 0), holidayPay: acc.holidayPay + (row.holidayPay || 0),
        gross: acc.gross + (row.gross || 0), health: acc.health + (row.health || 0), kaigo: acc.kaigo + (row.kaigo || 0),
        pension: acc.pension + (row.pension || 0), employment: acc.employment + (row.employment || 0),
        incomeTax: acc.incomeTax + (row.incomeTax || 0), residentTax: acc.residentTax + (row.residentTax || 0),
        yearAdjustment: acc.yearAdjustment + (row.yearAdjustment || 0), totalDeduct: acc.totalDeduct + (row.totalDeduct || 0),
        net: acc.net + (row.net || 0),
    }), { basicPay: 0, dutyAllowance: 0, overtimePay: 0, prescribedOvertimePay: 0, nightOvertimePay: 0, holidayPay: 0, gross: 0, health: 0, kaigo: 0, pension: 0, employment: 0, incomeTax: 0, residentTax: 0, yearAdjustment: 0, totalDeduct: 0, net: 0 });

    const findSnapshotByName = (name) => detailRows.find((row) => normalizeName(row.name) === normalizeName(name));
    const youichiRow = findSnapshotByName("渡曾 羊一");
    const monmaRow = findSnapshotByName("門馬 将太");
    const mfChecks = [
        { label: "渡曾羊一: 厚生年金が0円（年金受給者）", ok: !!youichiRow && Number(youichiRow.pension || 0) === 0, detail: youichiRow ? `実値: ${money(youichiRow.pension || 0)}` : "対象データなし" },
        { label: "渡曾羊一: 雇用保険が0円", ok: !!youichiRow && Number(youichiRow.employment || 0) === 0, detail: youichiRow ? `実値: ${money(youichiRow.employment || 0)}` : "対象データなし" },
        { label: "門馬将太: 役員のため雇用保険が0円", ok: !!monmaRow && Number(monmaRow.employment || 0) === 0, detail: monmaRow ? `実値: ${money(monmaRow.employment || 0)}` : "対象データなし" },
        { label: "門馬将太: 健保+介護の合計が22,610円（2026-01基準）", ok: targetMonth !== "2026-01" || (!!monmaRow && Number(monmaRow.health || 0) + Number(monmaRow.kaigo || 0) === 22610), detail: monmaRow ? `実値: ${money((monmaRow.health || 0) + (monmaRow.kaigo || 0))}` : "対象データなし" },
    ];

    const buildMfCompareReport = (currentRows, csvRows, month) => {
        const toTotals = (rows) => rows.reduce((acc, row) => ({ gross: acc.gross + Number(row.gross || 0), totalDeduct: acc.totalDeduct + Number(row.totalDeduct || 0), net: acc.net + Number(row.net || 0) }), { gross: 0, totalDeduct: 0, net: 0 });
        const toRowsByName = (rows) => {
            const byName = new Map();
            rows.forEach((row) => {
                const key = normalizeName(row.name);
                if (!key) return;
                const prev = byName.get(key) || { name: row.name, gross: 0, totalDeduct: 0, net: 0 };
                byName.set(key, { name: prev.name || row.name, gross: prev.gross + Number(row.gross || 0), totalDeduct: prev.totalDeduct + Number(row.totalDeduct || 0), net: prev.net + Number(row.net || 0) });
            });
            return byName;
        };
        const currentTotals = toTotals(currentRows);
        const csvTotals = toTotals(csvRows);
        const diffTotals = { gross: currentTotals.gross - csvTotals.gross, totalDeduct: currentTotals.totalDeduct - csvTotals.totalDeduct, net: currentTotals.net - csvTotals.net };
        const currentByName = toRowsByName(currentRows);
        const csvByName = toRowsByName(csvRows);
        const names = new Set([...currentByName.keys(), ...csvByName.keys()]);
        const perEmployee = Array.from(names).map((key) => {
            const cur = currentByName.get(key); const csv = csvByName.get(key);
            return { name: cur?.name || csv?.name || key, grossDiff: Number(cur?.gross || 0) - Number(csv?.gross || 0), totalDeductDiff: Number(cur?.totalDeduct || 0) - Number(csv?.totalDeduct || 0), netDiff: Number(cur?.net || 0) - Number(csv?.net || 0), missingInCsv: !csv, missingInSystem: !cur };
        }).filter((row) => row.missingInCsv || row.missingInSystem || row.grossDiff !== 0 || row.totalDeductDiff !== 0 || row.netDiff !== 0);
        return { month, currentTotals, csvTotals, diffTotals, perEmployee };
    };

    const handleCsvImport = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const imported = []; let skippedByName = 0; let skippedByHeader = 0;
        for (const file of files) {
            const monthMatch = file.name.match(/(\d{4})[年\-\/]?(\d{1,2})[月\-\/]?(\d{1,2})日?支?給?/);
            if (!monthMatch) { skippedByName += 1; continue; }
            const month = `${monthMatch[1]}-${String(Number(monthMatch[2])).padStart(2, "0")}`;
            const payDate = `${monthMatch[1]}-${String(Number(monthMatch[2])).padStart(2, "0")}-${String(Number(monthMatch[3])).padStart(2, "0")}`;
            const buffer = await file.arrayBuffer();
            const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
            const sjis = new TextDecoder("shift-jis", { fatal: false }).decode(buffer);
            const csvText = utf8.includes("氏名") || utf8.includes("総支給") ? utf8 : sjis;
            const rows = parseCsvRows(csvText, detectDelimiter(csvText));
            if (rows.length < 2) continue;
            const headerRowIdx = rows.findIndex((r) => { const hs = r.map(normalizeHeader); return hs.some((h) => h.includes("氏名") || h.includes("従業員名")) && hs.some((h) => h.includes("総支給") || h.includes("支給合計")) && hs.some((h) => h.includes("差引支給") || h.includes("差引支給額") || h.includes("手取り")); });
            let details = [];
            if (headerRowIdx >= 0) {
                const header = rows[headerRowIdx].map((v) => String(v).trim());
                const norm = header.map(normalizeHeader);
                const nameIdx = norm.findIndex((h) => h.includes("氏名") || h.includes("従業員名"));
                const grossIdx = norm.findIndex((h) => h.includes("総支給") || h.includes("支給合計"));
                const netIdx = norm.findIndex((h) => h.includes("差引支給") || h.includes("差引支給額") || h.includes("手取り"));
                const basicIdx = findIndexBy(norm, (h) => h.includes("基本給") && h.includes("支給"));
                const dutyIdx = findIndexBy(norm, (h) => h.includes("職務手当") && h.includes("支給"));
                const otLegalIdx = findIndexBy(norm, (h) => h.includes("残業手当") && h.includes("支給") && !h.includes("法定内") && !h.includes("深夜"));
                const otPrescribedIdx = findIndexBy(norm, (h) => h.includes("法定内残業手当") && h.includes("支給"));
                const otNightIdx = findIndexBy(norm, (h) => h.includes("深夜残業手当") && h.includes("支給"));
                const otHolidayIndices = norm.map((h, idx) => ({ h, idx })).filter(({ h }) => h.includes("支給") && (h.includes("法定休日手当") || h.includes("所定休日手当"))).map(({ idx }) => idx);
                const healthIdx = findIndexBy(norm, (h) => h.includes("健康保険料"));
                const kaigoIdx = findIndexBy(norm, (h) => h.includes("介護保険料"));
                const pensionIdx = findIndexBy(norm, (h) => h.includes("厚生年金保険料"));
                const employmentIdx = findIndexBy(norm, (h) => h.includes("雇用保険料"));
                const incomeTaxIdx = findIndexBy(norm, (h) => h.includes("所得税"));
                const residentTaxIdx = findIndexBy(norm, (h) => h.includes("住民税"));
                const yearAdjIdx = findIndexBy(norm, (h) => h.includes("年調過不足税額"));
                const totalDeductIdx = findIndexBy(norm, (h) => h.includes("控除合計"));
                if (nameIdx >= 0 && grossIdx >= 0 && netIdx >= 0) {
                    details = rows.slice(headerRowIdx + 1).map((r) => {
                        const gross = parseMoney(r[grossIdx]); const net = parseMoney(r[netIdx]);
                        const health = parseMoney(r[healthIdx]); const kaigo = parseMoney(r[kaigoIdx]);
                        const pension = parseMoney(r[pensionIdx]); const employment = parseMoney(r[employmentIdx]);
                        const incomeTax = parseMoney(r[incomeTaxIdx]); const residentTax = parseMoney(r[residentTaxIdx]);
                        const yearAdjustment = parseMoney(r[yearAdjIdx]);
                        const totalDeduct = totalDeductIdx >= 0 ? parseMoney(r[totalDeductIdx]) : health + kaigo + pension + employment + incomeTax + residentTax + yearAdjustment;
                        return { name: String(r[nameIdx] || "").trim(), basicPay: parseMoney(r[basicIdx]), dutyAllowance: parseMoney(r[dutyIdx]), overtimePay: parseMoney(r[otLegalIdx]), prescribedOvertimePay: parseMoney(r[otPrescribedIdx]), nightOvertimePay: parseMoney(r[otNightIdx]), holidayPay: otHolidayIndices.reduce((s, idx) => s + parseMoney(r[idx]), 0), gross, health, kaigo, pension, employment, incomeTax, residentTax, yearAdjustment, totalDeduct, net };
                    });
                }
            }
            if (details.length === 0) {
                const header2Idx = rows.findIndex((r) => { const hs = r.map(normalizeHeader); return hs.some((h) => h === "姓") && hs.some((h) => h === "名") && hs.some((h) => h.includes("健康保険料")); });
                if (header2Idx >= 0) {
                    const header = rows[header2Idx].map((v) => String(v).trim());
                    const norm = header.map(normalizeHeader);
                    const seiIdx = norm.findIndex((h) => h === "姓"); const meiIdx = norm.findIndex((h) => h === "名");
                    const basicIndices = header.map((h, idx) => ({ h: normalizeHeader(h), idx })).filter(({ h }) => h.includes("基本給") && (h.includes("月給") || h.includes("時給") || h.includes("日給"))).map(({ idx }) => idx);
                    const dutyIndices = header.map((h, idx) => ({ h: normalizeHeader(h), idx })).filter(({ h }) => h.includes("職務手当") && (h.includes("月給") || h.includes("時給") || h.includes("日給"))).map(({ idx }) => idx);
                    const otLegalIndices = header.map((h, idx) => ({ h: normalizeHeader(h), idx })).filter(({ h }) => h.includes("残業手当") && !h.includes("法定内") && !h.includes("深夜") && !h.includes("固定")).map(({ idx }) => idx);
                    const otPrescribedIndices = header.map((h, idx) => ({ h: normalizeHeader(h), idx })).filter(({ h }) => h.includes("法定内残業手当")).map(({ idx }) => idx);
                    const otNightIndices = header.map((h, idx) => ({ h: normalizeHeader(h), idx })).filter(({ h }) => h.includes("深夜残業手当")).map(({ idx }) => idx);
                    const otHolidayIndices = header.map((h, idx) => ({ h: normalizeHeader(h), idx })).filter(({ h }) => h.includes("法定休日手当") || h.includes("所定休日手当")).map(({ idx }) => idx);
                    const payIndices = header.map((h, idx) => ({ h: normalizeHeader(h), idx })).filter(({ h }) => h.includes("月給") || h.includes("時給") || h.includes("日給")).map(({ idx }) => idx);
                    const dedKeys = ["健康保険料", "介護保険料", "厚生年金保険料", "雇用保険料", "所得税", "住民税", "年調過不足税額"];
                    const dedIndices = dedKeys.map((key) => header.findIndex((h) => String(h).includes(key))).filter((i) => i >= 0);
                    const healthIdx = header.findIndex((h) => String(h).includes("健康保険料"));
                    const kaigoIdx = header.findIndex((h) => String(h).includes("介護保険料"));
                    const pensionIdx = header.findIndex((h) => String(h).includes("厚生年金保険料"));
                    const employmentIdx = header.findIndex((h) => String(h).includes("雇用保険料"));
                    const incomeTaxIdx = header.findIndex((h) => String(h).includes("所得税"));
                    const residentTaxIdx = header.findIndex((h) => String(h).includes("住民税"));
                    const yearAdjIdx = header.findIndex((h) => String(h).includes("年調過不足税額"));
                    if (seiIdx >= 0 && meiIdx >= 0 && payIndices.length > 0 && dedIndices.length > 0) {
                        details = rows.slice(header2Idx + 1).map((r) => {
                            const name = `${String(r[seiIdx] || "").trim()} ${String(r[meiIdx] || "").trim()}`.trim();
                            const gross = payIndices.reduce((s, idx) => s + parseMoney(r[idx]), 0);
                            const totalDeduct = dedIndices.reduce((s, idx) => s + parseMoney(r[idx]), 0);
                            return { name, basicPay: basicIndices.reduce((s, idx) => s + parseMoney(r[idx]), 0), dutyAllowance: dutyIndices.reduce((s, idx) => s + parseMoney(r[idx]), 0), overtimePay: otLegalIndices.reduce((s, idx) => s + parseMoney(r[idx]), 0), prescribedOvertimePay: otPrescribedIndices.reduce((s, idx) => s + parseMoney(r[idx]), 0), nightOvertimePay: otNightIndices.reduce((s, idx) => s + parseMoney(r[idx]), 0), holidayPay: otHolidayIndices.reduce((s, idx) => s + parseMoney(r[idx]), 0), gross, health: parseMoney(r[healthIdx]), kaigo: parseMoney(r[kaigoIdx]), pension: parseMoney(r[pensionIdx]), employment: parseMoney(r[employmentIdx]), incomeTax: parseMoney(r[incomeTaxIdx]), residentTax: parseMoney(r[residentTaxIdx]), yearAdjustment: parseMoney(r[yearAdjIdx]), totalDeduct, net: gross - totalDeduct };
                        });
                    }
                }
            }
            details = details.filter((r) => r.name && !r.name.includes("合計") && (r.gross > 0 || r.net > 0)).map((r) => {
                const emp = employees.find((e) => e.name.replace(/\s/g, "") === r.name.replace(/\s/g, ""));
                return { empId: emp?.id || 0, name: r.name, jobType: emp?.jobType || "CSV取込", basicPay: r.basicPay || 0, dutyAllowance: r.dutyAllowance || 0, overtimePay: r.overtimePay || 0, prescribedOvertimePay: r.prescribedOvertimePay || 0, nightOvertimePay: r.nightOvertimePay || 0, holidayPay: r.holidayPay || 0, gross: r.gross, health: r.health || 0, kaigo: r.kaigo || 0, pension: r.pension || 0, employment: r.employment || 0, incomeTax: r.incomeTax || 0, residentTax: r.residentTax || 0, yearAdjustment: r.yearAdjustment || 0, totalDeduct: r.totalDeduct || 0, net: r.net };
            });
            if (details.length === 0) { skippedByHeader += 1; continue; }
            imported.push({ month, payDate, details, gross: details.reduce((s, d) => s + d.gross, 0), net: details.reduce((s, d) => s + d.net, 0) });
        }
        if (imported.length === 0) { setMfCompareReport(null); setImportMessage(`取り込めるCSVが見つかりませんでした（名前不一致:${skippedByName} / ヘッダ不一致:${skippedByHeader}）`); return; }
        const compareTarget = imported.find((item) => item.month === targetMonth) || imported[0];
        const compareRows = buildDetailRowsForMonth(compareTarget.month);
        setMfCompareReport(buildMfCompareReport(compareRows, compareTarget.details, compareTarget.month));
        onImportHistoryData(imported);
        setImportMessage(`${imported.length}ファイルを取り込みました（突合: ${monthFullLabel(compareTarget.month)}）`);
    };

    // ---- 給与明細レンダラ ----
    const renderPayslip = (row) => {
        const monthText = monthFullLabel(targetMonth);
        const payDateText = formatDateJP(selectedHistory?.payDate || "-");
        const socialTotal = (row.health || 0) + (row.kaigo || 0) + (row.pension || 0) + (row.employment || 0);
        const printPayslip = () => {
            const el = document.getElementById("payslip-print-area");
            if (!el) return;
            const win = window.open("", "_blank", "width=900,height=1100");
            if (!win) return;
            win.document.open();
            win.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${row.name}_${monthText}_給与明細</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans JP',-apple-system,sans-serif;color:#111;padding:32px;font-size:12px}
.payslip{max-width:800px;margin:0 auto;border:2px solid #1e293b;padding:0}
.payslip-header{background:#1e293b;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center}
.payslip-header h2{font-size:18px;letter-spacing:2px}
.payslip-meta{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid #e2e8f0}
.payslip-meta-item{padding:8px 16px;border-right:1px solid #e2e8f0;font-size:12px}
.payslip-meta-item:last-child{border-right:none}
.payslip-meta-item .label{color:#64748b;font-size:10px;display:block}
.payslip-meta-item .val{font-weight:700;font-size:13px}
.payslip-body{display:grid;grid-template-columns:1fr 1fr;min-height:0}
.payslip-col{border-right:1px solid #e2e8f0}
.payslip-col:last-child{border-right:none}
.payslip-section-title{background:#f1f5f9;padding:6px 12px;font-weight:700;font-size:11px;color:#334155;border-bottom:1px solid #e2e8f0;border-top:1px solid #e2e8f0;letter-spacing:1px}
.payslip-row{display:flex;justify-content:space-between;padding:5px 12px;border-bottom:1px solid #f1f5f9;font-size:12px}
.payslip-row .lbl{color:#475569}
.payslip-row .amt{font-family:ui-monospace,monospace;font-weight:500;text-align:right}
.payslip-row.sub{background:#f8fafc}
.payslip-total{display:flex;justify-content:space-between;padding:8px 12px;font-weight:700;font-size:13px;border-top:2px solid #cbd5e1}
.payslip-total.green{background:#f0fdf4;color:#15803d}
.payslip-total.red{background:#fef2f2;color:#dc2626}
.payslip-total.blue{background:#eff6ff;color:#1d4ed8}
.payslip-net{background:#1e293b;color:#fff;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;font-size:16px}
.payslip-net .val{font-family:ui-monospace,monospace;font-size:22px;font-weight:700}
.payslip-footer{padding:8px 16px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;text-align:right}
@media print{body{padding:0}.payslip{border-width:1px}}
</style></head><body>`);
            win.document.write(el.innerHTML);
            win.document.write(`</body></html>`);
            win.document.close();
            setTimeout(() => win.print(), 300);
        };
        return (
            <div style={{ padding: "16px 20px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{row.name} の給与明細</h3>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-primary btn-sm" onClick={printPayslip}>印刷 / PDF保存</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setPayslipEmpId(null)}>閉じる</button>
                    </div>
                </div>
                <div id="payslip-print-area">
                    <div className="payslip">
                        <div className="payslip-header"><h2>給 与 明 細 書</h2><div style={{ fontSize: 12, textAlign: "right" }}><div>{companyName}</div></div></div>
                        <div className="payslip-meta">
                            <div className="payslip-meta-item"><span className="label">対象期間</span><span className="val">{monthText}</span></div>
                            <div className="payslip-meta-item"><span className="label">支給日</span><span className="val">{payDateText}</span></div>
                            <div className="payslip-meta-item"><span className="label">氏名</span><span className="val">{row.name}</span></div>
                        </div>
                        <div className="payslip-body">
                            <div className="payslip-col">
                                <div className="payslip-section-title">勤 怠</div>
                                <div className="payslip-row"><span className="lbl">出勤日数</span><span className="amt">{row.workDays || "-"} 日</span></div>
                                <div className="payslip-row"><span className="lbl">所定労働日数</span><span className="amt">{row.scheduledDays || "-"} 日</span></div>
                                <div className="payslip-row"><span className="lbl">出勤時間</span><span className="amt">{row.workHours || "-"} h</span></div>
                                <div className="payslip-row"><span className="lbl">所定労働時間</span><span className="amt">{row.scheduledHours || "-"} h</span></div>
                                <div className="payslip-row"><span className="lbl">時間外労働</span><span className="amt">{row.legalOT || "-"} h</span></div>
                                <div className="payslip-row"><span className="lbl">深夜労働</span><span className="amt">{row.nightOT || "-"} h</span></div>
                                <div className="payslip-row"><span className="lbl">休日労働</span><span className="amt">{row.holidayOT || "-"} h</span></div>
                                <div className="payslip-section-title">支 給</div>
                                <div className="payslip-row"><span className="lbl">基本給</span><span className="amt">{money(row.basicPay)}</span></div>
                                {(row.basicPayAdjust || 0) !== 0 && <div className="payslip-row sub"><span className="lbl">基本給調整</span><span className="amt">{money(row.basicPayAdjust)}</span></div>}
                                <div className="payslip-row"><span className="lbl">職務手当</span><span className="amt">{money(row.dutyAllowance)}</span></div>
                                <div className="payslip-row"><span className="lbl">通勤手当</span><span className="amt">{money(row.commuteAllow || 0)}</span></div>
                                {row.hasFixedOT ? (
                                    <><div className="payslip-row"><span className="lbl">固定残業代</span><span className="amt">{money(row.fixedOvertimePay)}</span></div>
                                        {(row.excessOvertimePay || 0) > 0 && <div className="payslip-row sub"><span className="lbl">超過残業手当</span><span className="amt">{money(row.excessOvertimePay)}</span></div>}</>
                                ) : (
                                    <><div className="payslip-row"><span className="lbl">時間外手当</span><span className="amt">{money(row.overtimePay)}</span></div>
                                        {(row.prescribedOvertimePay || 0) > 0 && <div className="payslip-row sub"><span className="lbl">所定外残業手当</span><span className="amt">{money(row.prescribedOvertimePay)}</span></div>}</>
                                )}
                                {(row.nightOvertimePay || 0) > 0 && <div className="payslip-row sub"><span className="lbl">深夜残業手当</span><span className="amt">{money(row.nightOvertimePay)}</span></div>}
                                {(row.holidayPay || 0) > 0 && <div className="payslip-row sub"><span className="lbl">休日労働手当</span><span className="amt">{money(row.holidayPay)}</span></div>}
                                {(row.otAdjust || 0) !== 0 && <div className="payslip-row sub"><span className="lbl">残業手当調整</span><span className="amt">{money(row.otAdjust)}</span></div>}
                                {(row.otherAllowance || 0) !== 0 && <div className="payslip-row"><span className="lbl">その他手当</span><span className="amt">{money(row.otherAllowance)}</span></div>}
                                <div className="payslip-total green"><span>支給合計</span><span>{money(row.gross)}</span></div>
                            </div>
                            <div className="payslip-col">
                                <div className="payslip-section-title">控 除</div>
                                <div className="payslip-row"><span className="lbl">健康保険料</span><span className="amt">{money(row.health)}</span></div>
                                <div className="payslip-row"><span className="lbl">介護保険料</span><span className="amt">{money(row.kaigo)}</span></div>
                                <div className="payslip-row"><span className="lbl">厚生年金保険料</span><span className="amt">{money(row.pension)}</span></div>
                                <div className="payslip-row"><span className="lbl">雇用保険料</span><span className="amt">{money(row.employment)}</span></div>
                                <div className="payslip-total red" style={{ borderTop: "1px solid #fca5a5" }}><span>社会保険料計</span><span>{money(socialTotal)}</span></div>
                                <div className="payslip-row" style={{ marginTop: 4 }}><span className="lbl">所得税</span><span className="amt">{money(row.incomeTax)}</span></div>
                                <div className="payslip-row"><span className="lbl">住民税</span><span className="amt">{money(row.residentTax)}</span></div>
                                {(row.yearAdjustment || 0) !== 0 && <div className="payslip-row"><span className="lbl">年末調整過不足</span><span className="amt">{money(row.yearAdjustment)}</span></div>}
                                <div className="payslip-total red"><span>控除合計</span><span>{money(row.totalDeduct)}</span></div>
                            </div>
                        </div>
                        <div className="payslip-net"><span>差引支給額</span><span className="val">{money(row.net)}</span></div>
                        <div className="payslip-footer">{companyName} — {monthText} 給与明細 — 発行日: {new Date().toLocaleDateString("ja-JP")}</div>
                    </div>
                </div>
            </div>
        );
    };
    const COL_COUNT = 12;

    // ---- Excel 給与台帳エクスポート (exceljs) ----
    const exportExcel = async () => {
        if (detailRows.length === 0) return;
        const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
        const monthText = monthFullLabel(targetMonth);
        const payDateText = selectedHistory?.payDate || "";
        const wb = new ExcelJS.Workbook();
        wb.creator = companyName || "きょうしん輸送";
        wb.created = new Date();
        const ws = wb.addWorksheet("給与台帳");
        const titleRow = ws.addRow([`${companyName || "きょうしん輸送"} 給与台帳`]);
        titleRow.getCell(1).font = { bold: true, size: 14 };
        const metaRow = ws.addRow([`対象月: ${monthText}`, "", `支給日: ${payDateText ? formatDateJP(payDateText) : "-"}`, "", `出力日: ${new Date().toLocaleDateString("ja-JP")}`]);
        metaRow.eachCell((cell) => { cell.font = { size: 10, color: { argb: "FF64748B" } }; });
        ws.addRow([]);
        const headers = ["従業員名", "部署", "雇用区分", "職種", "出勤日数", "所定労働日数", "出勤時間", "所定労働時間", "法定外残業(h)", "所定外残業(h)", "深夜残業(h)", "休日労働(h)", "基本給", "基本給調整", "職務手当", "通勤手当", "固定残業代", "超過残業手当", "時間外手当", "法定内残業手当", "深夜残業手当", "休日手当", "残業手当調整", "その他手当", "総支給額", "健康保険料", "介護保険料", "厚生年金", "雇用保険料", "社会保険料計", "所得税", "住民税", "年末調整", "控除合計", "差引支給額"];
        const headerRow = ws.addRow(headers);
        headerRow.eachCell((cell) => { cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = { bottom: { style: "thin" } }; });
        detailRows.forEach((row) => {
            ws.addRow([row.name, row.dept || "", row.employmentType || "", row.jobType || "", row.workDays || 0, row.scheduledDays || 0, row.workHours || 0, row.scheduledHours || 0, row.legalOT || 0, row.prescribedOT || 0, row.nightOT || 0, row.holidayOT || 0, row.basicPay || 0, row.basicPayAdjust || 0, row.dutyAllowance || 0, row.commuteAllow || 0, row.fixedOvertimePay || 0, row.excessOvertimePay || 0, row.overtimePay || 0, row.prescribedOvertimePay || 0, row.nightOvertimePay || 0, row.holidayPay || 0, row.otAdjust || 0, row.otherAllowance || 0, row.gross || 0, row.health || 0, row.kaigo || 0, row.pension || 0, row.employment || 0, (row.health || 0) + (row.kaigo || 0) + (row.pension || 0) + (row.employment || 0), row.incomeTax || 0, row.residentTax || 0, row.yearAdjustment || 0, row.totalDeduct || 0, row.net || 0]);
        });
        ws.addRow([]);
        const totRow = ws.addRow(["合計", "", "", "", detailRows.reduce((s, r) => s + (r.workDays || 0), 0), "", "", "", detailRows.reduce((s, r) => s + (r.legalOT || 0), 0), detailRows.reduce((s, r) => s + (r.prescribedOT || 0), 0), detailRows.reduce((s, r) => s + (r.nightOT || 0), 0), detailRows.reduce((s, r) => s + (r.holidayOT || 0), 0), detailTotals.basicPay, 0, detailTotals.dutyAllowance, 0, detailRows.reduce((s, r) => s + (r.fixedOvertimePay || 0), 0), detailRows.reduce((s, r) => s + (r.excessOvertimePay || 0), 0), detailTotals.overtimePay, detailTotals.prescribedOvertimePay, detailTotals.nightOvertimePay, detailTotals.holidayPay, 0, 0, detailTotals.gross, detailTotals.health, detailTotals.kaigo, detailTotals.pension, detailTotals.employment, detailTotals.health + detailTotals.kaigo + detailTotals.pension + detailTotals.employment, detailTotals.incomeTax, detailTotals.residentTax, detailTotals.yearAdjustment, detailTotals.totalDeduct, detailTotals.net]);
        totRow.eachCell((cell) => { cell.font = { bold: true }; cell.border = { top: { style: "double" } }; });
        const colWidths = [14, 10, 10, 10, 8, 10, 8, 10, 10, 10, 10, 10, 12, 10, 10, 10, 12, 12, 12, 12, 12, 10, 12, 10, 14, 10, 10, 10, 10, 12, 10, 10, 10, 12, 14];
        colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
        ws.eachRow((row, rowNumber) => { if (rowNumber <= 4) return; for (let ci = 13; ci <= headers.length; ci++) { const cell = row.getCell(ci); if (typeof cell.value === "number") cell.numFmt = "#,##0"; } });
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `給与台帳_${targetMonth}.xlsx`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    // ---- PDF 給与台帳（一覧表）出力 ----
    const exportAllPayslipsPdf = () => {
        if (detailRows.length === 0) return;
        const monthText = monthFullLabel(targetMonth);
        const payDateText = selectedHistory?.payDate ? formatDateJP(selectedHistory.payDate) : "-";
        const exportDate = new Date().toLocaleDateString("ja-JP");
        const cn = companyName || "きょうしん輸送";
        const fmtCell = (v) => (v == null || v === 0) ? "" : Number(v).toLocaleString("ja-JP");
        const fmtH = (v) => (v == null || v === 0) ? "" : String(v);
        const groups = [
            { label: "従業員情報", cols: ["氏名", "部署", "区分", "職種"] },
            { label: "勤 怠", cols: ["出勤\n日数", "所定\n日数", "出勤\n時間", "所定\n時間", "法定外\n残業", "所定外\n残業", "深夜\n残業", "休日\n労働"] },
            { label: "支 給", cols: ["基本給", "基本給\n調整", "職務手当", "通勤手当", "固定\n残業代", "超過\n残業手当", "時間外\n手当", "法定内\n残業手当", "深夜\n残業手当", "休日手当", "残業\n調整", "その他\n手当", "総支給額"] },
            { label: "控 除", cols: ["健康\n保険", "介護\n保険", "厚生\n年金", "雇用\n保険", "社保計", "所得税", "住民税", "年末\n調整", "控除計"] },
            { label: "", cols: ["差引支給額"] },
        ];
        const buildDataCells = (r) => {
            const si = (r.health || 0) + (r.kaigo || 0) + (r.pension || 0) + (r.employment || 0);
            return [r.name, r.dept || "", r.employmentType || "", r.jobType || "", fmtH(r.workDays), fmtH(r.scheduledDays), fmtH(r.workHours), fmtH(r.scheduledHours), fmtH(r.legalOT), fmtH(r.prescribedOT), fmtH(r.nightOT), fmtH(r.holidayOT), fmtCell(r.basicPay), fmtCell(r.basicPayAdjust), fmtCell(r.dutyAllowance), fmtCell(r.commuteAllow), fmtCell(r.fixedOvertimePay), fmtCell(r.excessOvertimePay), fmtCell(r.overtimePay), fmtCell(r.prescribedOvertimePay), fmtCell(r.nightOvertimePay), fmtCell(r.holidayPay), fmtCell(r.otAdjust), fmtCell(r.otherAllowance), fmtCell(r.gross), fmtCell(r.health), fmtCell(r.kaigo), fmtCell(r.pension), fmtCell(r.employment), fmtCell(si), fmtCell(r.incomeTax), fmtCell(r.residentTax), fmtCell(r.yearAdjustment), fmtCell(r.totalDeduct), fmtCell(r.net)];
        };
        const siTotal = (detailTotals.health || 0) + (detailTotals.kaigo || 0) + (detailTotals.pension || 0) + (detailTotals.employment || 0);
        const totals = ["合 計", "", "", "", fmtH(detailRows.reduce((s, r) => s + (r.workDays || 0), 0)), "", "", "", fmtH(detailRows.reduce((s, r) => s + (r.legalOT || 0), 0)), fmtH(detailRows.reduce((s, r) => s + (r.prescribedOT || 0), 0)), fmtH(detailRows.reduce((s, r) => s + (r.nightOT || 0), 0)), fmtH(detailRows.reduce((s, r) => s + (r.holidayOT || 0), 0)), fmtCell(detailTotals.basicPay), "", fmtCell(detailTotals.dutyAllowance), "", fmtCell(detailRows.reduce((s, r) => s + (r.fixedOvertimePay || 0), 0)), fmtCell(detailRows.reduce((s, r) => s + (r.excessOvertimePay || 0), 0)), fmtCell(detailTotals.overtimePay), fmtCell(detailTotals.prescribedOvertimePay), fmtCell(detailTotals.nightOvertimePay), fmtCell(detailTotals.holidayPay), "", "", fmtCell(detailTotals.gross), fmtCell(detailTotals.health), fmtCell(detailTotals.kaigo), fmtCell(detailTotals.pension), fmtCell(detailTotals.employment), fmtCell(siTotal), fmtCell(detailTotals.incomeTax), fmtCell(detailTotals.residentTax), fmtCell(detailTotals.yearAdjustment), fmtCell(detailTotals.totalDeduct), fmtCell(detailTotals.net)];
        let groupHeaderHtml = "<tr>";
        groups.forEach((g) => { const cls = g.label === "支 給" ? " pay" : g.label === "控 除" ? " ded" : g.label === "" ? " net" : ""; groupHeaderHtml += `<th class="group${cls}" colspan="${g.cols.length}">${g.label}</th>`; });
        groupHeaderHtml += "</tr>";
        let colHeaderHtml = "<tr>"; let colIdx = 0;
        groups.forEach((g) => { g.cols.forEach((c) => { const rightAlign = colIdx >= 4 ? " r" : ""; colHeaderHtml += `<th class="col${rightAlign}">${c.replace(/\n/g, "<br>")}</th>`; colIdx++; }); });
        colHeaderHtml += "</tr>";
        const bodyRows = detailRows.map((r, i) => {
            const cells = buildDataCells(r); let html = `<tr class="${i % 2 === 1 ? "stripe" : ""}">`; cells.forEach((v, ci) => { const rightAlign = ci >= 4 ? ` class="r"` : ""; const isNet = ci === 34; const style = isNet ? ` style="color:#1d4ed8;font-weight:700"` : ci === 24 ? ` style="font-weight:700"` : ci === 33 ? ` style="color:#dc2626;font-weight:700"` : ""; html += `<td${rightAlign}${style}>${v}</td>`; }); html += "</tr>"; return html;
        }).join("");
        let totalsHtml = `<tr class="totals">`; totals.forEach((v, ci) => { const rightAlign = ci >= 4 ? ` class="r"` : ""; let style = ci === 32 ? ` style="color:#1d4ed8"` : ci === 31 ? ` style="color:#dc2626"` : ""; totalsHtml += `<td${rightAlign}${style}>${v}</td>`; }); totalsHtml += "</tr>";
        const win = window.open("", "_blank", "width=1400,height=900"); if (!win) return; win.document.open();
        win.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${cn} 給与台帳 ${monthText}</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}@page{size:landscape;margin:10mm 8mm}body{font-family:'Noto Sans JP',sans-serif;color:#1e293b;font-size:9px;padding:16px}.header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #1e293b}.header h1{font-size:16px;font-weight:700;letter-spacing:1px}.header-meta{text-align:right;font-size:10px;color:#475569;line-height:1.6}table{width:100%;border-collapse:collapse;table-layout:auto}th.group{background:#1e293b;color:#fff;font-size:9px;font-weight:700;padding:4px 6px;text-align:center;border:1px solid #334155;letter-spacing:1px}th.group.pay{background:#166534}th.group.ded{background:#991b1b}th.group.net{background:#1e40af}th.col{background:#f1f5f9;font-size:8px;font-weight:600;padding:4px 5px;text-align:center;border:1px solid #cbd5e1;color:#334155;white-space:nowrap;line-height:1.3}th.col.r{text-align:right;padding-right:6px}td{padding:4px 5px;border:1px solid #e2e8f0;font-size:8.5px;white-space:nowrap;font-family:'JetBrains Mono','Noto Sans JP',monospace}td:first-child{font-family:'Noto Sans JP',sans-serif;font-weight:500}td:nth-child(2),td:nth-child(3),td:nth-child(4){font-family:'Noto Sans JP',sans-serif;font-size:8px}td.r{text-align:right;padding-right:6px}tr.stripe{background:#f8fafc}tr.totals{background:#eef2ff;font-weight:700;border-top:2px solid #1e293b}tr.totals td{border-top:2px solid #1e293b;font-size:9px}.footer{margin-top:10px;font-size:8px;color:#94a3b8;text-align:right}@media print{body{padding:0;font-size:8px}td{font-size:8px}th.col{font-size:7.5px}.header h1{font-size:14px}}</style></head><body><div class="header"><h1>${cn}　給 与 台 帳</h1><div class="header-meta">対象月: ${monthText}<br>支給日: ${payDateText}<br>出力日: ${exportDate}</div></div><table><thead>${groupHeaderHtml}${colHeaderHtml}</thead><tbody>${bodyRows}${totalsHtml}</tbody></table><div class="footer">${cn} — ${monthText} 給与台帳 — ${exportDate} 出力</div></body></html>`);
        win.document.close(); setTimeout(() => win.print(), 500);
    };

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">給与明細一覧</h1>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {detailRows.length > 0 && (
                        <>
                            <Badge variant="info">{detailRows.length}名</Badge>
                            <Badge variant="default">総支給 {money(detailTotals.gross)}</Badge>
                            <Badge variant="success">差引計 {money(detailTotals.net)}</Badge>
                            <button className="btn btn-secondary btn-sm" onClick={exportExcel}>Excel出力</button>
                            <button className="btn btn-secondary btn-sm" onClick={exportAllPayslipsPdf}>台帳PDF出力</button>
                        </>
                    )}
                </div>
            </div>

            <Card title={`対象月（${selectedFiscalYear}年度）`}>
                <div style={{ marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 600, color: "#1a2332" }}>{payrollCycleLabel(targetMonth, selectedHistory?.payDate)}</span></div>
                {fiscalYears.length > 1 && (
                    <div className="month-pills" style={{ marginBottom: 10 }}>
                        {fiscalYears.map((fy) => (
                            <button key={fy} className={`month-pill${selectedFiscalYear === fy ? " active" : ""}`}
                                onClick={() => { const fyMonths = buildFiscalMonths(fy); setSelectedFiscalYear(fy); setTargetMonth(fyMonths.find((m) => monthSet.has(m)) || fyMonths[0]); }}>
                                {fy}年度
                            </button>
                        ))}
                    </div>
                )}
                <div className="month-pills">
                    {months.map((month) => {
                        const hasData = monthSet.has(month);
                        return (
                            <button key={month} onClick={() => setTargetMonth(month)}
                                className={`month-pill${targetMonth === month ? " active" : ""}${hasData ? " has-data" : " no-data"}`}>
                                {monthLabel(month)}
                            </button>
                        );
                    })}
                </div>
            </Card>

            <Card title={`${monthFullLabel(targetMonth)} 従業員別明細`}>
                {detailRows.length === 0 ? (
                    <div className="empty-state"><div className="empty-state-icon">📄</div>この月の明細データはありません<br /><span style={{ fontSize: 11 }}>給与計算を実行して確定すると、ここに明細が表示されます</span></div>
                ) : (
                    <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 12, color: "#64748b" }}>{targetMonth === payrollTargetMonth ? "現在対象月 — 再計算でスナップショットを更新できます" : "過去月のスナップショットを表示中"}</div>
                            <button className="btn btn-primary btn-sm" onClick={onRefreshTargetSnapshot} disabled={targetMonth !== payrollTargetMonth} title={targetMonth !== payrollTargetMonth ? "現在対象月を選択したときのみ実行できます" : ""}>再計算</button>
                        </div>
                        <div style={{ overflowX: "auto" }}>
                            <table className="data-table" style={{ minWidth: 1100 }}>
                                <thead>
                                    <tr>
                                        <th rowSpan={2} style={{ verticalAlign: "bottom" }}>従業員</th>
                                        <th colSpan={4} style={{ textAlign: "center", borderBottom: "1px solid #e2e8f0", background: "#f0fdf4", color: "#15803d", fontSize: 11, letterSpacing: 1 }}>支 給</th>
                                        <th colSpan={4} style={{ textAlign: "center", borderBottom: "1px solid #e2e8f0", background: "#fef2f2", color: "#dc2626", fontSize: 11, letterSpacing: 1 }}>控 除</th>
                                        <th rowSpan={2} className="right" style={{ verticalAlign: "bottom" }}>差引支給</th>
                                        <th rowSpan={2} style={{ verticalAlign: "bottom", width: 60 }}></th>
                                    </tr>
                                    <tr>
                                        <th className="right" style={{ fontSize: 11 }}>基本給</th>
                                        <th className="right" style={{ fontSize: 11 }}>残業計</th>
                                        <th className="right" style={{ fontSize: 11 }}>その他</th>
                                        <th className="right" style={{ fontSize: 11, fontWeight: 700 }}>総支給</th>
                                        <th className="right" style={{ fontSize: 11 }}>社保計</th>
                                        <th className="right" style={{ fontSize: 11 }}>税計</th>
                                        <th className="right" style={{ fontSize: 11 }}>年調</th>
                                        <th className="right" style={{ fontSize: 11, fontWeight: 700 }}>控除計</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detailRows.map((row) => {
                                        const otTotal = (row.fixedOvertimePay || 0) + (row.excessOvertimePay || 0) + (row.overtimePay || 0) + (row.prescribedOvertimePay || 0) + (row.nightOvertimePay || 0) + (row.holidayPay || 0) + (row.otAdjust || 0);
                                        const otherPay = (row.dutyAllowance || 0) + (row.commuteAllow || 0) + (row.otherAllowance || 0) + (row.basicPayAdjust || 0);
                                        const socialIns = (row.health || 0) + (row.kaigo || 0) + (row.pension || 0) + (row.employment || 0);
                                        const taxTotal = (row.incomeTax || 0) + (row.residentTax || 0);
                                        const isOpen = payslipEmpId === row.empId;
                                        return (
                                            <React.Fragment key={`${targetMonth}-${row.empId}-${row.name}`}>
                                                <tr style={{ cursor: "pointer" }} onClick={() => setPayslipEmpId(isOpen ? null : row.empId)}>
                                                    <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{row.name}<span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>{row.jobType}</span></td>
                                                    <td className="right mono">¥{fmt(row.basicPay || 0)}</td>
                                                    <td className="right mono">¥{fmt(otTotal)}</td>
                                                    <td className="right mono">¥{fmt(otherPay)}</td>
                                                    <td className="right mono" style={{ fontWeight: 700, color: "#15803d" }}>¥{fmt(row.gross || 0)}</td>
                                                    <td className="right mono deduction">¥{fmt(socialIns)}</td>
                                                    <td className="right mono deduction">¥{fmt(taxTotal)}</td>
                                                    <td className="right mono deduction">¥{fmt(row.yearAdjustment || 0)}</td>
                                                    <td className="right mono deduction" style={{ fontWeight: 700, color: "#dc2626" }}>¥{fmt(row.totalDeduct || 0)}</td>
                                                    <td className="right mono net-pay" style={{ fontWeight: 700 }}>¥{fmt(row.net || 0)}</td>
                                                    <td><button className={`btn ${isOpen ? "btn-outline" : "btn-primary"} btn-sm`} onClick={(e) => { e.stopPropagation(); setPayslipEmpId(isOpen ? null : row.empId); }}>{isOpen ? "閉じる" : "明細"}</button></td>
                                                </tr>
                                                {isOpen && (<tr className="edit-row-expand"><td colSpan={COL_COUNT + 1} style={{ padding: 0 }}>{renderPayslip(row)}</td></tr>)}
                                            </React.Fragment>
                                        );
                                    })}
                                    <tr className="totals-row">
                                        <td style={{ fontWeight: 700 }}>合計</td>
                                        <td className="right mono">¥{fmt(detailTotals.basicPay)}</td>
                                        <td className="right mono">¥{fmt(detailRows.reduce((s, r) => s + (r.fixedOvertimePay || 0) + (r.excessOvertimePay || 0), 0) + detailTotals.overtimePay + detailTotals.prescribedOvertimePay + detailTotals.nightOvertimePay + detailTotals.holidayPay)}</td>
                                        <td className="right mono">¥{fmt(detailTotals.dutyAllowance)}</td>
                                        <td className="right mono" style={{ fontWeight: 700, color: "#15803d" }}>¥{fmt(detailTotals.gross)}</td>
                                        <td className="right mono deduction">¥{fmt(detailTotals.health + detailTotals.kaigo + detailTotals.pension + detailTotals.employment)}</td>
                                        <td className="right mono deduction">¥{fmt(detailTotals.incomeTax + detailTotals.residentTax)}</td>
                                        <td className="right mono deduction">¥{fmt(detailTotals.yearAdjustment)}</td>
                                        <td className="right mono deduction" style={{ fontWeight: 700, color: "#dc2626" }}>¥{fmt(detailTotals.totalDeduct)}</td>
                                        <td className="right mono net-pay" style={{ fontWeight: 700 }}>¥{fmt(detailTotals.net)}</td>
                                        <td></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Card>

            {/* MF照合チェック & CSV取込 */}
            <Collapsible title={`MF照合チェック（${monthFullLabel(targetMonth)}）`}>
                <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    {mfChecks.map((check) => (
                        <div key={check.label} className={`alert-box ${check.ok ? "success" : "warning"}`} style={{ marginBottom: 0 }}>
                            <div style={{ fontWeight: 700 }}>{check.ok ? "✓" : "!"} {check.label}</div>
                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{check.detail}</div>
                        </div>
                    ))}
                </div>
            </Collapsible>

            {mfCompareReport && (
                <Card title={`MF元CSV突合レポート（${monthFullLabel(mfCompareReport.month)}）`}>
                    <div className={`alert-box ${mfCompareReport.perEmployee.length === 0 && mfCompareReport.diffTotals.gross === 0 && mfCompareReport.diffTotals.totalDeduct === 0 && mfCompareReport.diffTotals.net === 0 ? "success" : "warning"}`} style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 700 }}>{mfCompareReport.perEmployee.length === 0 && mfCompareReport.diffTotals.gross === 0 && mfCompareReport.diffTotals.totalDeduct === 0 && mfCompareReport.diffTotals.net === 0 ? "✓ 総額・従業員別の差分はありません" : "! MF元CSVとの間に差分があります"}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>総支給差分: {money(mfCompareReport.diffTotals.gross)} / 控除差分: {money(mfCompareReport.diffTotals.totalDeduct)} / 差引差分: {money(mfCompareReport.diffTotals.net)}</div>
                    </div>
                    {mfCompareReport.perEmployee.length > 0 ? (
                        <div style={{ overflowX: "auto" }}>
                            <table className="data-table" style={{ minWidth: 720 }}>
                                <thead><tr><th>従業員</th><th className="right">総支給差分</th><th className="right">控除差分</th><th className="right">差引差分</th><th>備考</th></tr></thead>
                                <tbody>
                                    {mfCompareReport.perEmployee.map((row) => (
                                        <tr key={`${row.name}-${row.missingInCsv ? "missing-csv" : row.missingInSystem ? "missing-system" : "diff"}`}>
                                            <td>{row.name}</td>
                                            <td className="right mono">{money(row.grossDiff)}</td>
                                            <td className="right mono">{money(row.totalDeductDiff)}</td>
                                            <td className="right mono">{money(row.netDiff)}</td>
                                            <td style={{ fontSize: 12, color: "#64748b" }}>{row.missingInCsv ? "CSV側に該当従業員なし" : row.missingInSystem ? "システム側に該当従業員なし" : "差分あり"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ fontSize: 12, color: "#64748b" }}>従業員別の差分はありません。</div>
                    )}
                </Card>
            )}

            <div style={{ marginTop: 12 }}>
                <Collapsible title="MF CSV取込">
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="file" id="mf-csv-input" multiple accept=".csv,text/csv" style={{ fontSize: 12 }} onChange={handleCsvImport} />
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>例: 確定結果_2025年09月20日支給.csv</span>
                    </div>
                    {importMessage && <div style={{ marginTop: 8, fontSize: 12, color: "#16a34a" }}>{importMessage}</div>}
                </Collapsible>
            </div>
        </div>
    );
};
