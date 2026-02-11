import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * 所得税額を計算（月額表 甲欄）
 * 簡易実装: 扶養人数0の場合
 */
function calculateIncomeTax(taxableAmount, dependents = 0) {
  if (taxableAmount < 88000) return 0;
  if (taxableAmount < 89000) return 130;
  if (taxableAmount < 100000) return Math.floor((taxableAmount - 88000) * 0.05);
  if (taxableAmount < 409000) {
    return Math.floor((taxableAmount - 100000) * 0.1023 + 630);
  }
  // 簡易実装のため、ここでは上限を設定
  return Math.floor((taxableAmount - 409000) * 0.2046 + 31628);
}

/**
 * payroll-state.jsonを読み込み
 */
function loadPayrollState() {
  const filePath = path.join(process.cwd(), "data", "payroll-state.json");
  const fileContent = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(fileContent);
}

/**
 * payroll-state.jsonに書き込み
 */
function savePayrollState(state) {
  const filePath = path.join(process.cwd(), "data", "payroll-state.json");
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function POST(req) {
  const body = await req.json();

  if (!body?.autoCalcEnabled) {
    return NextResponse.json({ ok: false, message: "自動計算が無効です" }, { status: 400 });
  }

  const targetMonth = body?.month || new Date().toISOString().slice(0, 7);

  try {
    // 1. データ読み込み
    const state = loadPayrollState();
    const { employees, attendance } = state.data;

    // 2. 社会保険料率（requirements_v3.mdより）
    const healthInsuranceRate = 51.55 / 1000;
    const nursingInsuranceRate = 7.95 / 1000;
    const pensionRate = 91.5 / 1000;
    const employmentInsuranceRate = 5.5 / 1000;

    // 3. 各従業員の給与計算
    const calculatedPayrolls = employees.map(emp => {
      // 勤怠データを取得（attendanceはオブジェクト形式: { "empId": { workDays, legalOT, ... } }）
      const att = attendance[String(emp.id)] || null;

      const workDays = att?.workDays || 0;
      const overtimeHours = parseFloat(att?.legalOT || att?.overtimeHours || 0);
      const lateNightHours = parseFloat(att?.nightOT || att?.lateNightHours || 0);

      // 時間単価計算（基本給 + 職務手当） / 月平均所定労働時間
      const hourlyRate = (emp.basicPay + emp.dutyAllowance) / emp.avgMonthlyHours;

      // 残業代計算（1円未満切り上げ）
      const overtimePay = Math.ceil(hourlyRate * overtimeHours * 1.25);
      const lateNightPay = Math.ceil(hourlyRate * lateNightHours * 1.25);

      // 総支給額
      const grossPay = emp.basicPay + emp.dutyAllowance + emp.commuteAllow + overtimePay + lateNightPay;

      // 社会保険料計算（標準月額報酬に基づく）
      let healthInsurance = 0;
      let pensionInsurance = 0;
      let employmentInsurance = 0;

      if (emp.hasPension && emp.stdMonthly) {
        const stdMonthly = emp.stdMonthly;
        healthInsurance = Math.floor(stdMonthly * healthInsuranceRate / 2);

        if (emp.hasKaigo) {
          healthInsurance += Math.floor(stdMonthly * nursingInsuranceRate / 2);
        }

        pensionInsurance = Math.floor(stdMonthly * pensionRate / 2);
      }

      if (emp.hasEmployment && !emp.isOfficer) {
        employmentInsurance = Math.floor(grossPay * employmentInsuranceRate);
      }

      // 課税対象額（総支給 - 社会保険料）
      const taxableAmount = grossPay - healthInsurance - pensionInsurance - employmentInsurance;

      // 所得税計算
      const incomeTax = calculateIncomeTax(taxableAmount, emp.dependents || 0);

      // 控除合計
      const totalDeductions = healthInsurance + pensionInsurance + employmentInsurance + incomeTax + (emp.residentTax || 0);

      // 差引支給額
      const netPay = grossPay - totalDeductions;

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        dept: emp.dept,
        workDays,
        basicPay: emp.basicPay,
        dutyAllowance: emp.dutyAllowance,
        commuteAllow: emp.commuteAllow,
        overtimeHours,
        overtimePay,
        lateNightHours,
        lateNightPay,
        grossPay,
        healthInsurance,
        pensionInsurance,
        employmentInsurance,
        incomeTax,
        residentTax: emp.residentTax || 0,
        totalDeductions,
        netPay,
        hasAttendance: !!att
      };
    });

    // 4. 月次スナップショットに保存
    // monthlySnapshotsはオブジェクト形式 { "2026-01": [...], "2026-02": [...] }
    if (!state.data.monthlySnapshots) {
      state.data.monthlySnapshots = {};
    }

    // 新しいスナップショットを保存（上書き）
    state.data.monthlySnapshots[targetMonth] = calculatedPayrolls;

    // 5. 保存
    savePayrollState(state);

    // 6. 集計情報
    const totalGross = calculatedPayrolls.reduce((sum, p) => sum + p.grossPay, 0);
    const totalNet = calculatedPayrolls.reduce((sum, p) => sum + p.netPay, 0);
    const totalOvertimeHours = calculatedPayrolls.reduce((sum, p) => sum + p.overtimeHours, 0);

    return NextResponse.json({
      ok: true,
      message: `${targetMonth} の給与計算が完了しました`,
      calculatedAt: new Date().toISOString(),
      summary: {
        employeeCount: calculatedPayrolls.length,
        totalGross,
        totalNet,
        totalOvertimeHours,
        withAttendanceCount: calculatedPayrolls.filter(p => p.hasAttendance).length
      },
      payrolls: calculatedPayrolls
    });

  } catch (error) {
    console.error("[Monthly Calc] エラー:", error);
    return NextResponse.json({
      ok: false,
      message: `計算エラー: ${error.message}`,
      error: error.message
    }, { status: 500 });
  }
}
