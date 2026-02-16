"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

// ===== 検証済み計算ロジック =====
const ceil = (v) => Math.ceil(v);
const insRound = (v) => (v - Math.floor(v) > 0.5 ? Math.ceil(v) : Math.floor(v));

const DEFAULT_RATES = {
  health: 5.155 / 100,
  kaigo: 0.795 / 100,
  pension: 9.15 / 100,
  employment: 0.55 / 100,
};

const buildRates = (settings) => {
  if (!settings) return DEFAULT_RATES;
  return {
    health: (Number(settings.healthRate) || 5.155) / 100,
    kaigo: (Number(settings.kaigoRate) || 0.795) / 100,
    pension: (Number(settings.pensionRate) || 9.15) / 100,
    employment: (Number(settings.employmentRate) || 0.55) / 100,
    healthEr: (Number(settings.healthRateEmployer) || 5.155) / 100,
    kaigoEr: (Number(settings.kaigoRateEmployer) || 0.795) / 100,
    pensionEr: (Number(settings.pensionRateEmployer) || 9.15) / 100,
    childCare: (Number(settings.childCareRate) || 0.36) / 100,
  };
};

const calcOvertime = (hourlyRate, hours, multiplier) =>
  hours > 0 ? ceil(hourlyRate * hours * multiplier) : 0;

const calcPayroll = (emp, att, settings) => {
  const rates = buildRates(settings);
  const hourly = (emp.basicPay + emp.dutyAllowance) / emp.avgMonthlyHours;
  const otLegal = calcOvertime(hourly, att.legalOT, 1.25);
  const otPrescribed = calcOvertime(hourly, att.prescribedOT, 1.0);
  const otNight = calcOvertime(hourly, att.nightOT, 1.25);
  const otHoliday = calcOvertime(hourly, att.holidayOT, 1.35);
  const otAdjust = Number(att.otAdjust) || 0;
  const basicPayAdj = Number(att.basicPayAdjust) || 0;
  const otherAllowance = Number(att.otherAllowance) || 0;
  const gross = (emp.basicPay + basicPayAdj) + emp.dutyAllowance + otLegal + otPrescribed + otNight + otHoliday + otAdjust + otherAllowance + emp.commuteAllow;
  const health = emp.stdMonthly ? insRound(emp.stdMonthly * rates.health) : 0;
  const kaigo = emp.hasKaigo && emp.stdMonthly ? insRound(emp.stdMonthly * rates.kaigo) : 0;
  const pension = emp.hasPension && emp.stdMonthly ? insRound(emp.stdMonthly * rates.pension) : 0;
  const employment = emp.hasEmployment ? insRound(gross * rates.employment) : 0;
  const socialTotal = health + kaigo + pension + employment;
  const taxableIncome = gross - socialTotal - emp.commuteAllow;
  const incomeTax = estimateTax(taxableIncome, emp.dependents);
  const residentTax = emp.residentTax;
  const totalDeduct = socialTotal + incomeTax + residentTax;
  const netPay = gross - totalDeduct;
  // 事業主負担
  const erHealth = emp.stdMonthly ? insRound(emp.stdMonthly * rates.healthEr) : 0;
  const erKaigo = emp.hasKaigo && emp.stdMonthly ? insRound(emp.stdMonthly * rates.kaigoEr) : 0;
  const erPension = emp.hasPension && emp.stdMonthly ? insRound(emp.stdMonthly * rates.pensionEr) : 0;
  const erChildCare = emp.stdMonthly ? insRound(emp.stdMonthly * rates.childCare) : 0;
  const erEmployment = emp.hasEmployment ? insRound(gross * rates.employment) : 0;
  const erTotal = erHealth + erKaigo + erPension + erChildCare + erEmployment;
  const companyCost = gross + erTotal;
  return { hourly: Math.round(hourly * 100) / 100, otLegal, otPrescribed, otNight, otHoliday, otAdjust, basicPayAdj, otherAllowance, gross, health, kaigo, pension, employment, socialTotal, incomeTax, residentTax, totalDeduct, netPay, erHealth, erKaigo, erPension, erChildCare, erEmployment, erTotal, companyCost };
};

// ===== 令和8年分 月額税額表（甲欄・扶養0人） =====
// 国税庁「給与所得の源泉徴収税額表（令和8年分）」月額表より
// [未満, 税額(扶養0人)]  ※105,000円未満は0
const TAX_TABLE_R8 = [
  [105000,0],[107000,170],[109000,280],[111000,380],[113000,480],[115000,580],[117000,680],[119000,790],
  [121000,890],[123000,990],[125000,1090],[127000,1190],[129000,1300],[131000,1400],[133000,1500],[135000,1600],
  [137000,1710],[139000,1810],[141000,1910],[143000,2010],[145000,2110],[147000,2220],[149000,2320],[151000,2420],
  [153000,2520],[155000,2620],[157000,2730],[159000,2830],[161000,2910],[163000,2980],[165000,3050],[167000,3120],
  [169000,3200],[171000,3270],[173000,3340],[175000,3410],[177000,3480],[179000,3550],[181000,3620],[183000,3700],
  [185000,3770],[187000,3840],[189000,3910],[191000,3980],[193000,4050],[195000,4120],[197000,4200],[199000,4270],
  [201000,4340],[203000,4410],[205000,4480],[207000,4550],[209000,4630],[211000,4700],[213000,4770],[215000,4840],
  [217000,4910],[219000,4980],[221000,5050],[224000,5150],[227000,5250],[230000,5360],[233000,5460],[236000,5570],
  [239000,5680],[242000,5790],[245000,5890],[248000,6000],[251000,6110],[254000,6220],[257000,6320],[260000,6430],
  [263000,6530],[266000,6650],[269000,6750],[272000,6860],[275000,6960],[278000,7080],[281000,7180],[284000,7290],
  [287000,7390],[290000,7500],[293000,7610],[296000,7720],[299000,7820],[302000,7930],[305000,8060],[308000,8180],
  [311000,8300],[314000,8550],[317000,8790],[320000,9040],[323000,9280],[326000,9530],[329000,9770],[332000,10020],
  [335000,10260],[338000,10510],[341000,10750],[344000,11000],[347000,11240],[350000,11490],[353000,11730],
  [356000,11980],[359000,12220],[362000,12470],[365000,12710],[368000,12960],[371000,13200],[374000,13450],
  [377000,13690],[380000,13940],[383000,14180],[386000,14430],[389000,14670],[392000,14920],[395000,15160],
  [398000,15410],[401000,15650],[404000,15900],[407000,16140],[410000,16390],[413000,16630],[416000,16880],
  [419000,17120],[422000,17370],[425000,17610],[428000,17860],[431000,18100],[434000,18350],[437000,18590],
  [440000,18840],[443000,19080],[446000,19330],[449000,19570],[452000,19860],[455000,20350],[458000,20840],
  [461000,21330],[464000,21820],[467000,22310],[470000,22800],[473000,23290],[476000,23780],[479000,24270],
  [482000,24760],[485000,25250],[488000,25740],[491000,26230],[494000,26720],[497000,27210],[500000,27700],
  [503000,28190],[506000,28680],[509000,29170],[512000,29660],[515000,30150],[518000,30640],[521000,31130],
  [524000,31620],[527000,32110],[530000,32600],[533000,33090],[536000,33580],[539000,34070],[542000,34560],
  [545000,35050],[548000,35540],[551000,36030],[554000,36570],[557000,37120],[560000,37670],[563000,38230],
  [566000,38780],[569000,39330],[572000,39880],[575000,40430],[578000,40980],[581000,41530],[584000,42090],
  [587000,42640],[590000,43190],[593000,43740],[596000,44290],[599000,44840],[602000,45390],[605000,45950],
  [608000,46500],[611000,47050],[614000,47600],[617000,48150],[620000,48700],[623000,49250],[626000,49800],
  [629000,50360],[632000,50910],[635000,51460],[638000,52010],[641000,52560],[644000,53110],[647000,53660],
  [650000,54220],[653000,54770],[656000,55320],[659000,55870],[662000,56420],[665000,56970],[668000,57520],
  [671000,58070],[674000,58630],[677000,59180],[680000,59730],[683000,60280],[686000,60830],[689000,61380],
  [692000,61930],[695000,62490],[698000,63040],[701000,63590],[704000,64140],[707000,64690],[710000,65250],
  [713000,65860],[716000,66480],[719000,67090],[722000,67700],[725000,68320],[728000,68930],[731000,69540],
  [734000,70150],[737000,70770],[740000,71380],
];
const estimateTax = (taxable, deps) => {
  if (taxable <= 0) return 0;
  // 月額税額表によるテーブルルックアップ（扶養0人の税額を基準に扶養控除を適用）
  let baseTax = 0;
  if (taxable < 105000) {
    baseTax = 0;
  } else if (taxable < 740000) {
    for (const [threshold, amount] of TAX_TABLE_R8) {
      if (taxable < threshold) { baseTax = amount; break; }
    }
  } else {
    // 740,000円以上: 電算機計算の特例（令和8年分）にフォールバック
    // 第1表: 給与所得控除
    let incDed;
    if (taxable <= 158333) incDed = 54167;
    else if (taxable <= 299999) incDed = taxable * 0.30 + 6667;
    else if (taxable <= 549999) incDed = taxable * 0.20 + 36667;
    else if (taxable <= 708330) incDed = taxable * 0.10 + 91667;
    else incDed = 162500;
    incDed = Math.ceil(incDed);
    // 第3表: 基礎控除
    const basicDed = taxable <= 2120833 ? 48334 : taxable <= 2162499 ? 40000 : taxable <= 2204166 ? 26667 : taxable <= 2245833 ? 13334 : 0;
    const depDed = deps * 31667;
    const B = Math.max(0, Math.floor(taxable - incDed - basicDed - depDed));
    // 第4表: 税率
    let tax;
    if (B <= 0) tax = 0;
    else if (B <= 162500) tax = B * 0.05105;
    else if (B <= 275000) tax = B * 0.10210 - 8296;
    else if (B <= 579166) tax = B * 0.20420 - 36374;
    else if (B <= 750000) tax = B * 0.23483 - 54113;
    else if (B <= 1500000) tax = B * 0.33693 - 130688;
    else if (B <= 3333333) tax = B * 0.40840 - 237893;
    else tax = B * 0.45945 - 408061;
    return Math.round(tax / 10) * 10;
  }
  // 扶養親族等1人あたり1,610円を控除
  const depReduction = deps * 1610;
  return Math.max(0, baseTax - depReduction);
};

// ===== 標準報酬月額 等級表（令和2年9月〜） =====
// 厚生年金: 1〜32等級、健康保険: 1〜50等級
// grade: 等級, stdMonthly: 標準報酬月額, lowerBound: 報酬月額の下限, upperBound: 報酬月額の上限
const STD_MONTHLY_GRADES = [
  { grade: 1, stdMonthly: 58000, lowerBound: 0, upperBound: 63000 },
  { grade: 2, stdMonthly: 68000, lowerBound: 63000, upperBound: 73000 },
  { grade: 3, stdMonthly: 78000, lowerBound: 73000, upperBound: 83000 },
  { grade: 4, stdMonthly: 88000, lowerBound: 83000, upperBound: 93000 },
  { grade: 5, stdMonthly: 98000, lowerBound: 93000, upperBound: 101000 },
  { grade: 6, stdMonthly: 104000, lowerBound: 101000, upperBound: 107000 },
  { grade: 7, stdMonthly: 110000, lowerBound: 107000, upperBound: 114000 },
  { grade: 8, stdMonthly: 118000, lowerBound: 114000, upperBound: 122000 },
  { grade: 9, stdMonthly: 126000, lowerBound: 122000, upperBound: 130000 },
  { grade: 10, stdMonthly: 134000, lowerBound: 130000, upperBound: 138000 },
  { grade: 11, stdMonthly: 142000, lowerBound: 138000, upperBound: 146000 },
  { grade: 12, stdMonthly: 150000, lowerBound: 146000, upperBound: 155000 },
  { grade: 13, stdMonthly: 160000, lowerBound: 155000, upperBound: 165000 },
  { grade: 14, stdMonthly: 170000, lowerBound: 165000, upperBound: 175000 },
  { grade: 15, stdMonthly: 180000, lowerBound: 175000, upperBound: 185000 },
  { grade: 16, stdMonthly: 190000, lowerBound: 185000, upperBound: 195000 },
  { grade: 17, stdMonthly: 200000, lowerBound: 195000, upperBound: 210000 },
  { grade: 18, stdMonthly: 220000, lowerBound: 210000, upperBound: 230000 },
  { grade: 19, stdMonthly: 240000, lowerBound: 230000, upperBound: 250000 },
  { grade: 20, stdMonthly: 260000, lowerBound: 250000, upperBound: 270000 },
  { grade: 21, stdMonthly: 280000, lowerBound: 270000, upperBound: 290000 },
  { grade: 22, stdMonthly: 300000, lowerBound: 290000, upperBound: 310000 },
  { grade: 23, stdMonthly: 320000, lowerBound: 310000, upperBound: 330000 },
  { grade: 24, stdMonthly: 340000, lowerBound: 330000, upperBound: 350000 },
  { grade: 25, stdMonthly: 360000, lowerBound: 350000, upperBound: 370000 },
  { grade: 26, stdMonthly: 380000, lowerBound: 370000, upperBound: 395000 },
  { grade: 27, stdMonthly: 410000, lowerBound: 395000, upperBound: 425000 },
  { grade: 28, stdMonthly: 440000, lowerBound: 425000, upperBound: 455000 },
  { grade: 29, stdMonthly: 470000, lowerBound: 455000, upperBound: 485000 },
  { grade: 30, stdMonthly: 500000, lowerBound: 485000, upperBound: 515000 },
  { grade: 31, stdMonthly: 530000, lowerBound: 515000, upperBound: 545000 },
  { grade: 32, stdMonthly: 560000, lowerBound: 545000, upperBound: 575000 },
  { grade: 33, stdMonthly: 590000, lowerBound: 575000, upperBound: 605000 },
  { grade: 34, stdMonthly: 620000, lowerBound: 605000, upperBound: 635000 },
  { grade: 35, stdMonthly: 650000, lowerBound: 635000, upperBound: 665000 },
  { grade: 36, stdMonthly: 680000, lowerBound: 665000, upperBound: 695000 },
  { grade: 37, stdMonthly: 710000, lowerBound: 695000, upperBound: 730000 },
  { grade: 38, stdMonthly: 750000, lowerBound: 730000, upperBound: 770000 },
  { grade: 39, stdMonthly: 790000, lowerBound: 770000, upperBound: 810000 },
  { grade: 40, stdMonthly: 830000, lowerBound: 810000, upperBound: 855000 },
  { grade: 41, stdMonthly: 880000, lowerBound: 855000, upperBound: 905000 },
  { grade: 42, stdMonthly: 930000, lowerBound: 905000, upperBound: 955000 },
  { grade: 43, stdMonthly: 980000, lowerBound: 955000, upperBound: 1005000 },
  { grade: 44, stdMonthly: 1030000, lowerBound: 1005000, upperBound: 1055000 },
  { grade: 45, stdMonthly: 1090000, lowerBound: 1055000, upperBound: 1115000 },
  { grade: 46, stdMonthly: 1150000, lowerBound: 1115000, upperBound: 1175000 },
  { grade: 47, stdMonthly: 1210000, lowerBound: 1175000, upperBound: 1235000 },
  { grade: 48, stdMonthly: 1270000, lowerBound: 1235000, upperBound: 1295000 },
  { grade: 49, stdMonthly: 1330000, lowerBound: 1295000, upperBound: 1355000 },
  { grade: 50, stdMonthly: 1390000, lowerBound: 1355000, upperBound: Infinity },
];

const findGradeByStdMonthly = (stdMonthly) => {
  const val = Number(stdMonthly);
  if (!val) return null;
  return STD_MONTHLY_GRADES.find((g) => g.stdMonthly === val) || null;
};

const findGradeByPay = (pay) => {
  const val = Number(pay);
  if (!val) return null;
  return STD_MONTHLY_GRADES.find((g) => val >= g.lowerBound && val < g.upperBound) || null;
};

// ===== 従業員データ =====
const INITIAL_EMPLOYEES = [
  { id: 1, name: "渡会 流雅", dept: "運送事業", jobType: "トラックドライバー", basicPay: 210000, dutyAllowance: 10000, commuteAllow: 0, avgMonthlyHours: 173.0, stdMonthly: 260000, hasKaigo: false, hasPension: true, hasEmployment: true, dependents: 0, residentTax: 13000, isOfficer: false, status: "在籍" },
  { id: 2, name: "渡曾 羊一", dept: "運送事業", jobType: "トラックドライバー", basicPay: 100000, dutyAllowance: 0, commuteAllow: 0, avgMonthlyHours: 89.1, stdMonthly: 104000, hasKaigo: false, hasPension: false, hasEmployment: false, dependents: 0, residentTax: 0, isOfficer: false, status: "在籍", note: "年金受給者・短時間勤務" },
  { id: 3, name: "門馬 将太", dept: "運送事業", jobType: "事務経理・労務管理・運行管理", basicPay: 370000, dutyAllowance: 0, commuteAllow: 0, avgMonthlyHours: 173.0, stdMonthly: 380000, hasKaigo: true, hasPension: true, hasEmployment: false, dependents: 0, residentTax: 0, isOfficer: true, status: "在籍", note: "役員（2025年11月〜）" },
];

const INITIAL_ATTENDANCE = {
  1: { workDays: 25, scheduledDays: 0, workHours: 0, scheduledHours: 0, legalOT: 58.0, prescribedOT: 19.5, nightOT: 1.5, holidayOT: 0, otAdjust: 0, basicPayAdjust: 0, otherAllowance: 0 },
  2: { workDays: 12, scheduledDays: 0, workHours: 0, scheduledHours: 0, legalOT: 7.5, prescribedOT: 4.0, nightOT: 0, holidayOT: 0, otAdjust: 0, basicPayAdjust: 0, otherAllowance: 0 },
  3: { workDays: 25, scheduledDays: 0, workHours: 0, scheduledHours: 0, legalOT: 0, prescribedOT: 0, nightOT: 0, holidayOT: 0, otAdjust: 0, basicPayAdjust: 0, otherAllowance: 0 },
};

const INITIAL_MONTHLY_HISTORY = [
  { month: "2025-09", payDate: "2025-09-20", gross: 714061, net: 588660, confirmedBy: "管理者", status: "確定" },
  { month: "2025-10", payDate: "2025-10-20", gross: 743263, net: 612708, confirmedBy: "管理者", status: "確定" },
  { month: "2025-11", payDate: "2025-11-20", gross: 721724, net: 579330, confirmedBy: "管理者", status: "確定" },
  { month: "2025-12", payDate: "2025-12-20", gross: 734445, net: 588107, confirmedBy: "管理者", status: "確定" },
  { month: "2026-01", payDate: "2026-02-20", gross: 0, net: 0, confirmedBy: "-", status: "未計算" },
];

const INITIAL_PAID_LEAVE_BALANCE = [
  { empId: 1, granted: 10, used: 4.5, carry: 2.0 },
  { empId: 2, granted: 7, used: 1.0, carry: 0.0 },
  { empId: 3, granted: 10, used: 0.0, carry: 0.0 },
];

const INITIAL_MASTER_SETTINGS = {
  // 会社情報
  companyName: "きょうしん輸送株式会社",
  closingDay: "末日",
  paymentDay: "翌月20日",
  socialCollection: "翌月徴収",
  showRetiredNextMonth: false,
  // 管轄・届出先
  jurisdiction: "北海道",
  taxOffice: "岩見沢",
  taxOfficeCode: "000",
  pensionOffice: "岩見沢 年金事務所",
  pensionOfficeNumber: "08714",
  pensionOfficeCode: "51キヨレ",
  insuranceType: "協会管掌事業所",
  socialDocSubmitter: "事業主",
  taxCalcMethod: "税額表（月額表）",
  // 社会保険料率（%）
  healthRate: 5.155,
  healthRateEmployer: 5.155,
  kaigoRate: 0.795,
  kaigoRateEmployer: 0.795,
  pensionRate: 9.15,
  pensionRateEmployer: 9.15,
  childCareRate: 0.36,
  employmentRate: 0.55,
  // 労働条件
  prescribedHoursPerDay: 6.7,
  prescribedDaysPerMonth: 26.0,
  avgMonthlyHoursDefault: 173.0,
  overtimeWarningHours: 45,
  overtimeLimitHours: 80,
  // 休日設定
  holidayMonday: "平日",
  holidayTuesday: "平日",
  holidayWednesday: "平日",
  holidayThursday: "平日",
  holidayFriday: "平日",
  holidaySaturday: "平日",
  holidaySunday: "法定休日",
  holidayNational: "平日",
  // 独自休日
  customHolidays: [
    { date: "01-01", name: "年始休日" },
    { date: "01-02", name: "年始休日" },
    { date: "01-03", name: "年始休日" },
    { date: "01-04", name: "年始休日" },
    { date: "01-05", name: "年始休日" },
    { date: "12-30", name: "年末休日" },
    { date: "12-31", name: "年末休日" },
  ],
  // 月別所定労働日数
  monthlyWorkDays: {
    "01": 23, "02": 24, "03": 26, "04": 26, "05": 26,
    "06": 26, "07": 27, "08": 26, "09": 26, "10": 27,
    "11": 25, "12": 25,
  },
  // 部門・職種
  departments: ["全部門", "運送事業", "作業受託事業(混果・箱詰め)"],
  jobTypes: ["トラックドライバー", "農産物選果管理・作業", "農産物選果作業", "事務経理・労務管理・運行管理", "一般事務"],
  // 明細設定
  slipDisplayMonth: "支給日が属する月",
  slipShowAttendance: true,
  slipShowYtdTotal: false,
  slipShowHourlyRate: true,
  slipShowTaxCategory: false,
  slipShowDependents: true,
  slipShowStdMonthly: false,
  slipShowPeriod: true,
  slipShowDept: false,
};

const INITIAL_HRMOS_SETTINGS = {
  baseUrl: "https://ieyasu.co",
  companyUrl: "",
  apiKey: "",
  clientId: "",
  autoSyncEnabled: true,
  autoCalcEnabled: true,
  autoCalcDay: 1,
};

const INITIAL_MONTHLY_SNAPSHOTS = {};

// ===== Utility =====
const pad2 = (n) => String(n).padStart(2, "0");
const parsePayDay = (paymentDayStr) => {
  const match = String(paymentDayStr || "").match(/(\d+)/);
  return match ? Number(match[1]) : 20;
};
const isNextMonthPay = (paymentDayStr) => String(paymentDayStr || "").includes("翌月");
const toIsoDate = (dateObj) => {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return "";
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
};
const REF_TODAY = new Date();
const CURRENT_MONTH = `${REF_TODAY.getFullYear()}-${pad2(REF_TODAY.getMonth() + 1)}`;
const _INIT_PAY_DAY = parsePayDay(INITIAL_MASTER_SETTINGS.paymentDay);
const NEXT_PAY_DATE_OBJ = isNextMonthPay(INITIAL_MASTER_SETTINGS.paymentDay)
  ? new Date(REF_TODAY.getFullYear(), REF_TODAY.getMonth() + 1, _INIT_PAY_DAY)
  : new Date(REF_TODAY.getFullYear(), REF_TODAY.getMonth(), _INIT_PAY_DAY);
const CURRENT_PAY_DATE = toIsoDate(NEXT_PAY_DATE_OBJ);
const EMPTY_ATTENDANCE = {
  workDays: 0, scheduledDays: 0, workHours: 0, scheduledHours: 0,
  legalOT: 0, prescribedOT: 0, nightOT: 0, holidayOT: 0,
  otAdjust: 0, basicPayAdjust: 0, otherAllowance: 0,
};

const processingMonthOf = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  if (date.getDate() <= _INIT_PAY_DAY) d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
const CURRENT_PROCESSING_MONTH = processingMonthOf(REF_TODAY);

const fiscalYearOf = (month) => {
  const [y, m] = String(month).split("-").map(Number);
  return m >= 2 ? y : y - 1;
};

const buildFiscalMonths = (fy) => [
  ...Array.from({ length: 11 }, (_, i) => `${fy}-${String(i + 2).padStart(2, "0")}`),
  `${fy + 1}-01`,
];

const monthFullLabel = (month) => {
  const [y, m] = String(month || "").split("-");
  if (!y || !m) return "-";
  return `${y}年${String(m).padStart(2, "0")}月`;
};
const monthLabel = (month) => monthFullLabel(month);

const fiscalYearFromDate = (dateStr) => {
  if (!dateStr) return fiscalYearOf(CURRENT_MONTH);
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return fiscalYearOf(CURRENT_MONTH);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 2 ? y : y - 1;
};

const nextActionText = (status, isDirty) => {
  if (isDirty) return "勤怠変更あり → 再計算して確定してください";
  if (status === "未計算" || status === "計算中") return "勤怠を取込/入力 → 計算を実行";
  if (status === "計算済") return "計算結果を確認 → 確定してください";
  return "確定済み";
};

const upsertMonthHistory = (history, month, patch) => {
  const exists = history.some((row) => row.month === month);
  if (!exists) return [...history, { month, payDate: patch?.payDate || CURRENT_PAY_DATE, gross: 0, net: 0, confirmedBy: "-", status: "未計算", ...patch }];
  return history.map((row) => (row.month === month ? { ...row, ...patch } : row));
};

const parseMoney = (value) => {
  if (value == null) return 0;
  const num = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
};

const normalizeName = (value) =>
  String(value || "")
    .replace(/[ 　]/g, "")
    .toLowerCase()
    .trim();

const normalizeHrmosEmployeeNumber = (value) => String(value || "").trim();
const getEmployeeHrmosNumber = (emp) => normalizeHrmosEmployeeNumber(emp?.hrmosEmployeeNumber);

const findEmployeesByHrmosNumber = (employees, hrmosEmployeeNumber) => {
  const normalized = normalizeHrmosEmployeeNumber(hrmosEmployeeNumber);
  if (!normalized) return [];
  return employees.filter((e) => getEmployeeHrmosNumber(e) === normalized);
};

const collectEmployeeSetupIssues = (emp, employees = []) => {
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

const matchEmployeeByHrmosRecord = (hrmosRecord, employees) => {
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

const hrmosMatchTypeLabel = (matchType) => {
  if (matchType === "hrmosId") return "HRMOS連携ID一致";
  if (matchType === "legacyId") return "従業員ID一致（旧方式）";
  if (matchType === "nameOnly") return "氏名一致のみ";
  if (matchType === "conflict") return "要確認（競合）";
  return "未紐付け";
};

const toAttendanceFromHrmosRecord = (hrmosRecord, prevAtt, syncedAt) => ({
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

const parseCsvRows = (text, delimiter = ",") => {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "\"") {
      if (inQuotes && next === "\"") { cell += "\""; i += 1; } else { inQuotes = !inQuotes; }
      continue;
    }
    if (!inQuotes && ch === delimiter) { row.push(cell); cell = ""; continue; }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((v) => v !== "")) rows.push(row);
      row = []; cell = ""; continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); if (row.some((v) => v !== "")) rows.push(row); }
  return rows;
};

const detectDelimiter = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const sample = lines.slice(0, 5).join("\n");
  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
};

const normalizeHeader = (v) => String(v || "").replace(/\s/g, "").replace(/[()（）]/g, "").toLowerCase();
const findIndexBy = (headersNorm, predicate) => headersNorm.findIndex(predicate);

const toSnapshotRowFromCalc = (emp, result, att) => ({
  empId: emp.id, name: emp.name, jobType: emp.jobType, dept: emp.dept || "",
  employmentType: emp.employmentType || (emp.isOfficer ? "役員" : "正社員"),
  basicPay: emp.basicPay || 0, dutyAllowance: emp.dutyAllowance || 0,
  commuteAllow: emp.commuteAllow || 0,
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
});

const parseDateLike = (value) => {
  if (value instanceof Date) return new Date(value.getTime());
  const text = String(value || "").trim();
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  return new Date(text);
};

const formatDateJP = (value) => {
  const d = parseDateLike(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日`;
};

const calcDefaultPayDateByMonth = (month, paymentDayStr) => {
  const [y, m] = String(month || "").split("-").map(Number);
  if (!y || !m) return null;
  const day = parsePayDay(paymentDayStr);
  return isNextMonthPay(paymentDayStr) ? new Date(y, m, day) : new Date(y, m - 1, day);
};

const defaultPayDateStringByMonth = (month, paymentDayStr) => {
  const d = calcDefaultPayDateByMonth(month, paymentDayStr);
  return d ? toIsoDate(d) : CURRENT_PAY_DATE;
};

const payrollCycleLabel = (month, payDateOverride) => {
  const payDate = payDateOverride ? parseDateLike(payDateOverride) : calcDefaultPayDateByMonth(month);
  if (!payDate || Number.isNaN(payDate.getTime())) return "-";
  const [y, m] = String(month || "").split("-").map(Number);
  const closingDate = y && m ? new Date(y, m, 0) : new Date(payDate.getFullYear(), payDate.getMonth(), 0);
  return `${formatDateJP(payDate)}支給（${formatDateJP(closingDate)}〆）`;
};

const fmt = (n) => n != null ? n.toLocaleString() : "-";
const money = (n) => `¥${fmt(n || 0)}`;

const buildMonthlyChecks = (employees, attendance, monthStatus, hrmosSettings, hrmosUnmatchedRecords) => {
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

// ===== SVG Icons =====
const IconCalc = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="16" y2="18"/></svg>;
const IconList = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const IconUsers = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconCalendar = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconSettings = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const IconHome = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IconChevron = ({ open }) => <span className={`arrow${open ? " open" : ""}`}>▾</span>;

// ===== Tooltip =====
const Tip = ({ label, children }) => {
  const [pos, setPos] = useState(null);
  const show = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: Math.max(8, rect.left + rect.width / 2 - 130) });
  };
  return (
    <span className="tip-wrap" onMouseEnter={show} onMouseLeave={() => setPos(null)}>
      {label}<span className="tip-icon">?</span>
      {pos && <span className="tip-body" style={{ display: "block", top: pos.top, left: pos.left }}>{children}</span>}
    </span>
  );
};

// ===== Year Events / Reminders =====
const ANNUAL_EVENTS = [
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

const getUpcomingReminders = () => {
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

// ===== Insights generator =====
const buildInsights = (employees, attendance, prevMonthHistory, settings) => {
  const insights = [];
  const active = employees.filter((e) => e.status === "在籍");
  const warnH = Number(settings.overtimeWarningHours) || 45;
  const limitH = Number(settings.overtimeLimitHours) || 80;

  active.forEach((emp) => {
    const att = attendance[emp.id];
    if (!att) return;
    const totalOT = (att.legalOT || 0) + (att.prescribedOT || 0) + (att.nightOT || 0) + (att.holidayOT || 0);
    if (totalOT >= limitH) {
      insights.push({ type: "warn", text: `${emp.name}: 残業${totalOT}hは上限${limitH}hに到達。36協定違反の可能性があります。` });
    } else if (totalOT >= warnH) {
      insights.push({ type: "warn", text: `${emp.name}: 残業${totalOT}hは警告ライン（${warnH}h）を超えています。` });
    }
  });

  if (prevMonthHistory && prevMonthHistory.gross > 0) {
    const currentResults = active.map((emp) => calcPayroll(emp, attendance[emp.id] || EMPTY_ATTENDANCE, settings));
    const currentGross = currentResults.reduce((s, r) => s + r.gross, 0);
    const diff = currentGross - prevMonthHistory.gross;
    const pct = Math.round((diff / prevMonthHistory.gross) * 100);
    if (Math.abs(pct) >= 10) {
      insights.push({ type: "info", text: `総支給額が前月比 ${pct > 0 ? "+" : ""}${pct}%（${diff > 0 ? "+" : ""}¥${fmt(diff)}）変動しています。残業時間の増減が主な要因です。` });
    }
  }

  active.forEach((emp) => {
    const result = calcPayroll(emp, attendance[emp.id] || EMPTY_ATTENDANCE, settings);
    if (emp.stdMonthly > 0 && Math.abs(result.gross - emp.stdMonthly) / emp.stdMonthly > 0.2) {
      insights.push({ type: "info", text: `${emp.name}: 実際の総支給（¥${fmt(result.gross)}）と標準報酬月額（¥${fmt(emp.stdMonthly)}）の差が20%超。算定基礎届の時期に等級変更を検討してください。` });
    }
    if (emp.stdMonthly > 0 && !findGradeByStdMonthly(emp.stdMonthly)) {
      insights.push({ type: "warn", text: `${emp.name}: 標準報酬月額 ¥${fmt(emp.stdMonthly)} が等級表に該当しません。従業員マスタで正しい等級を選択してください。` });
    }
  });

  // 料率変更チェック: 確定済みスナップショットと現在の計算結果に差がないか
  // 注: gross - net には社保以外（所得税・住民税）も含まれるため概算チェック。
  // 大きな差（10%以上）がある場合のみ警告して誤検知を減らす。
  if (prevMonthHistory && prevMonthHistory.status === "確定" && prevMonthHistory.gross > 0) {
    const currentResults = active.map((emp) => calcPayroll(emp, attendance[emp.id] || EMPTY_ATTENDANCE, settings));
    const currentTotalDeduct = currentResults.reduce((s, r) => s + r.totalDeduct, 0);
    const savedTotalDeduct = prevMonthHistory.gross - prevMonthHistory.net;
    if (savedTotalDeduct > 0 && Math.abs(currentTotalDeduct - savedTotalDeduct) / savedTotalDeduct > 0.1) {
      insights.push({ type: "warn", text: "直近の確定月と現在の設定で控除額の計算結果に差異があります。料率や標報が変更されていないか確認してください。" });
    }
  }

  if (insights.length === 0) {
    insights.push({ type: "ok", text: "特に問題は検出されませんでした。" });
  }
  return insights;
};

// ===== Nav =====
const Nav = ({ page, setPage, userEmail }) => {
  const items = [
    { id: "dashboard", icon: <IconHome />, label: "ダッシュボード" },
    { id: "payroll", icon: <IconCalc />, label: "月次給与計算" },
    { id: "history", icon: <IconList />, label: "給与明細一覧" },
    { id: "employees", icon: <IconUsers />, label: "従業員一覧" },
    { id: "leave", icon: <IconCalendar />, label: "有給管理" },
    { id: "settings", icon: <IconSettings />, label: "マスタ設定" },
  ];
  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/login";
  };
  return (
    <nav className="nav">
      <div className="nav-brand">
        <div className="nav-brand-sub">きょうしん輸送</div>
        <div className="nav-brand-main">給与計算システム</div>
      </div>
      <div className="nav-items">
        {items.map((item) => (
          <button key={item.id} onClick={() => setPage(item.id)} className={`nav-btn${page === item.id ? " active" : ""}`}>
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      {userEmail && (
        <div className="nav-user">
          <div className="nav-user-email" title={userEmail}>{userEmail}</div>
          <button onClick={handleLogout} className="nav-btn" style={{ fontSize: 12, opacity: 0.8 }}>
            <span className="nav-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
            <span>ログアウト</span>
          </button>
        </div>
      )}
      <div className="nav-footer">v3.2</div>
    </nav>
  );
};

// ===== Shared Components =====
const Card = ({ title, children, className }) => (
  <div className={`card${className ? ` ${className}` : ""}`}>
    {title && <div className="card-title">{title}</div>}
    {children}
  </div>
);

const Badge = ({ variant = "default", children }) => (
  <span className={`badge badge-${variant}`}>{children}</span>
);

const statusBadgeVariant = (status) => {
  if (status === "確定") return "success";
  if (status === "計算済") return "info";
  if (status === "計算中") return "warning";
  return "danger";
};

const Collapsible = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible">
      <button className="collapsible-header" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <IconChevron open={open} />
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
};

// ===== DashboardPage =====
const DashboardPage = ({ employees, attendance, payrollMonth, payrollPayDate, payrollStatus, isAttendanceDirty, monthlyHistory, settings, setPage }) => {
  const active = employees.filter((e) => e.status === "在籍");
  const results = active.map((emp) => ({ emp, result: calcPayroll(emp, attendance[emp.id] || EMPTY_ATTENDANCE, settings) }));
  const totalGross = results.reduce((s, r) => s + r.result.gross, 0);
  const totalNet = results.reduce((s, r) => s + r.result.netPay, 0);

  const payDate = parseDateLike(payrollPayDate);
  const daysUntilPay = Math.max(0, Math.ceil((payDate - new Date()) / 86400000));

  const sorted = [...monthlyHistory].sort((a, b) => a.month.localeCompare(b.month));
  const prevConfirmed = sorted.filter((m) => m.status === "確定").at(-1);
  const grossDiff = prevConfirmed ? totalGross - prevConfirmed.gross : 0;
  const netDiff = prevConfirmed ? totalNet - prevConfirmed.net : 0;

  const reminders = getUpcomingReminders();
  const insights = buildInsights(employees, attendance, prevConfirmed, settings);

  const effectiveStatus = isAttendanceDirty ? "計算中" : payrollStatus;
  const steps = [
    { title: "勤怠データを入力", desc: "HRMOSから取込 or 残業時間を手入力", done: effectiveStatus !== "未計算" },
    { title: "計算結果を確認", desc: "総支給額・控除額・差引支給額をチェック", done: effectiveStatus === "確定" || effectiveStatus === "計算済" },
    { title: "給与を確定", desc: "問題なければ「確定する」を押す", done: effectiveStatus === "確定" },
  ];
  const currentStepIdx = steps.findIndex((s) => !s.done);

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>ダッシュボード</h1>

      {/* KPI Row */}
      <div className="kpi-row" style={{ marginBottom: 16 }}>
        <div className="kpi-item">
          <div className="kpi-item-label">次の支給日まで</div>
          <div><span className="countdown">{daysUntilPay}</span><span className="countdown-unit">日</span></div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{formatDateJP(payrollPayDate)}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-item-label">在籍者数</div>
          <div className="kpi-item-value">{active.length}<span style={{ fontSize: 12, fontWeight: 400, color: "#64748b" }}>名</span></div>
        </div>
        <div className="kpi-item">
          <div className="kpi-item-label">今月の総支給額</div>
          <div className="kpi-item-value" style={{ fontSize: 18 }}>¥{fmt(totalGross)}</div>
          {prevConfirmed && <div style={{ fontSize: 11, marginTop: 2 }} className={grossDiff > 0 ? "diff-positive" : grossDiff < 0 ? "diff-negative" : "diff-zero"}>前月比 {grossDiff >= 0 ? "+" : ""}¥{fmt(grossDiff)}</div>}
        </div>
        <div className="kpi-item">
          <div className="kpi-item-label">今月の差引支給額</div>
          <div className="kpi-item-value" style={{ fontSize: 18 }}>¥{fmt(totalNet)}</div>
          {prevConfirmed && <div style={{ fontSize: 11, marginTop: 2 }} className={netDiff > 0 ? "diff-positive" : netDiff < 0 ? "diff-negative" : "diff-zero"}>前月比 {netDiff >= 0 ? "+" : ""}¥{fmt(netDiff)}</div>}
        </div>
        <div className="kpi-item">
          <div className="kpi-item-label">会社総コスト</div>
          <div className="kpi-item-value" style={{ fontSize: 18, color: "#6366f1" }}>¥{fmt(results.reduce((s, r) => s + r.result.companyCost, 0))}</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>総支給+事業主負担</div>
        </div>
      </div>

      {/* Steps */}
      <Card title={`${monthFullLabel(payrollMonth)} の処理ステップ`}>
        <div className="dash-steps">
          {steps.map((s, i) => (
            <div key={i} className={`dash-step${s.done ? " done" : i === currentStepIdx ? " current" : ""}`}>
              <div className="dash-step-title">{s.done ? "✓ " : ""}{s.title}</div>
              <div className="dash-step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setPage("payroll")}>給与計算へ進む</button>
        </div>
      </Card>

      {/* Insights */}
      <Card title="自動チェック・解説">
        {insights.map((ins, i) => (
          <div key={i} className="insight-row">
            <span className={`insight-icon ${ins.type}`}>{ins.type === "warn" ? "!" : ins.type === "info" ? "i" : "✓"}</span>
            <span>{ins.text}</span>
          </div>
        ))}
      </Card>

      {/* Reminders */}
      <Card title={`年次イベント・リマインダー（直近${reminders.length}件）`}>
        {reminders.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">📅</div>直近のイベントはありません</div>
        ) : reminders.map((r, i) => (
          <div key={i} className={`reminder-item${r.urgency === "urgent" ? " reminder-urgent" : r.urgency === "soon" ? " reminder-soon" : ""}`}>
            <span className="reminder-date">あと{r.daysUntil}日</span>
            <div>
              <div style={{ fontWeight: 600 }}>{r.label}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
};

// ===== PayrollPage =====
const PayrollPage = ({
  employees, attendance, setAttendance, onConfirmPayroll, onUndoConfirm, onAttendanceChange,
  payrollMonth, payrollPayDate, payrollStatus, isAttendanceDirty,
  hrmosSettings, setHrmosSettings, onHrmosSync, onRunAutoCalc,
  syncStatus, calcStatus, monthlyChecks, monthlyProgressText, settings,
  hrmosSyncPreview, hrmosUnmatchedRecords, onApplyHrmosPreview, onClearHrmosPreview,
  onSetHrmosUnmatchedAssignment, onApplyHrmosUnmatchedAssignments,
}) => {
  const [selected, setSelected] = useState(null);
  const updateHrmos = (field, value) => setHrmosSettings((prev) => ({ ...prev, [field]: value }));
  const updateAtt = (empId, field, val) => {
    setAttendance((prev) => ({ ...prev, [empId]: { ...prev[empId], [field]: parseFloat(val) || 0 } }));
    onAttendanceChange();
  };
  const rates = buildRates(settings);
  const results = useMemo(
    () => employees.filter((e) => e.status === "在籍").map((emp) => ({
      emp, att: attendance[emp.id] || EMPTY_ATTENDANCE,
      result: calcPayroll(emp, attendance[emp.id] || EMPTY_ATTENDANCE, settings),
    })),
    [attendance, employees, settings]
  );
  const hasCriticalChecks = monthlyChecks.critical.length > 0;
  const titleStatus = isAttendanceDirty ? "計算中" : payrollStatus;
  const activeEmployees = employees.filter((e) => e.status === "在籍");

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className="page-title">月次給与計算</h1>
            <Badge variant={statusBadgeVariant(titleStatus)}>{titleStatus}</Badge>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{payrollCycleLabel(payrollMonth, payrollPayDate)}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(hasCriticalChecks || monthlyChecks.warning.length > 0) && (
            <span style={{ fontSize: 11, color: hasCriticalChecks ? "var(--danger)" : "var(--warning)" }}>
              ⚠ 確認事項があります（重大{monthlyChecks.critical.length} / 注意{monthlyChecks.warning.length}）
            </span>
          )}
          {payrollStatus === "確定" && !isAttendanceDirty && (
            <button className="btn btn-secondary btn-sm" onClick={onUndoConfirm}>確定を取り消す</button>
          )}
          <button
            className={`btn ${isAttendanceDirty ? "btn-warning" : "btn-primary"}`}
            onClick={() => onConfirmPayroll(results)}
            disabled={payrollStatus === "確定" && !isAttendanceDirty}
          >
            {isAttendanceDirty ? "再計算して確定" : payrollStatus === "確定" ? "✓ 確定済み" : "確定する"}
          </button>
        </div>
      </div>

      {/* Main Table */}
      <Card>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>従業員</th>
                <th className="right">基本給</th>
                <th className="right">職務手当</th>
                <th className="right"><Tip label="法定外OT">法定労働時間（1日8h/週40h）を超える残業。1.25倍で計算。</Tip></th>
                <th className="right"><Tip label="所定外OT">会社の所定時間は超えるが法定内の残業。1.0倍で計算。</Tip></th>
                <th className="right"><Tip label="深夜OT">22時〜翌5時の深夜残業。1.25倍で計算。</Tip></th>
                <th className="right">残業手当計</th>
                <th className="right"><Tip label="総支給額">基本給＋手当＋残業代の合計。税金や保険を引く前の金額。</Tip></th>
                <th className="right"><Tip label="社保計">健康保険＋介護保険＋厚生年金＋雇用保険の合計。標準報酬月額をもとに計算。</Tip></th>
                <th className="right"><Tip label="所得税">月額表（甲欄）で計算。扶養人数により金額が変わります。</Tip></th>
                <th className="right"><Tip label="住民税">前年の所得に基づき市区町村が決定。毎年6月に額が変更。</Tip></th>
                <th className="right"><Tip label="差引支給額">総支給額から控除合計を引いた手取り金額。</Tip></th>
                <th className="right"><Tip label="会社負担">事業主負担の社保（健保・介護・厚年・子育て拠出金・雇保）の合計。</Tip></th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ emp, att, result: r }) => (
                <tr key={emp.id} onClick={() => setSelected(selected === emp.id ? null : emp.id)}
                  className={selected === emp.id ? "selected" : ""} style={{ cursor: "pointer" }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{emp.name}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>
                      {emp.employmentType || (emp.isOfficer ? "役員" : "正社員")} / {emp.isOfficer ? "役員" : emp.jobType}
                    </div>
                  </td>
                  <td className="right mono">{fmt(emp.basicPay)}</td>
                  <td className="right mono">{emp.dutyAllowance ? fmt(emp.dutyAllowance) : "-"}</td>
                  <td className="right">
                    <input type="number" step="0.5" value={att.legalOT} className="inline-input"
                      onChange={(e) => updateAtt(emp.id, "legalOT", e.target.value)} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td className="right">
                    <input type="number" step="0.5" value={att.prescribedOT} className="inline-input"
                      onChange={(e) => updateAtt(emp.id, "prescribedOT", e.target.value)} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td className="right">
                    <input type="number" step="0.5" value={att.nightOT} className="inline-input"
                      onChange={(e) => updateAtt(emp.id, "nightOT", e.target.value)} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td className="right mono" style={{ fontWeight: 600, color: (r.otLegal + r.otPrescribed + r.otNight) > 0 ? "#b45309" : "#cbd5e1" }}>
                    {fmt(r.otLegal + r.otPrescribed + r.otNight + r.otHoliday)}
                  </td>
                  <td className="right mono" style={{ fontWeight: 700 }}>{fmt(r.gross)}</td>
                  <td className="right mono deduction">{fmt(r.socialTotal)}</td>
                  <td className="right mono deduction">{fmt(r.incomeTax)}</td>
                  <td className="right mono deduction">{fmt(r.residentTax)}</td>
                  <td className="right mono net-pay">{fmt(r.netPay)}</td>
                  <td className="right mono" style={{ color: "#6366f1" }}>{fmt(r.erTotal)}</td>
                </tr>
              ))}
              <tr className="totals-row">
                <td>合計</td>
                <td colSpan={6}></td>
                <td className="right mono" style={{ fontWeight: 700 }}>{fmt(results.reduce((s, r) => s + r.result.gross, 0))}</td>
                <td className="right mono deduction">{fmt(results.reduce((s, r) => s + r.result.socialTotal, 0))}</td>
                <td className="right mono deduction">{fmt(results.reduce((s, r) => s + r.result.incomeTax, 0))}</td>
                <td className="right mono deduction">{fmt(results.reduce((s, r) => s + r.result.residentTax, 0))}</td>
                <td className="right mono net-pay" style={{ fontSize: 14 }}>{fmt(results.reduce((s, r) => s + r.result.netPay, 0))}</td>
                <td className="right mono" style={{ color: "#6366f1", fontWeight: 700 }}>{fmt(results.reduce((s, r) => s + r.result.erTotal, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Panel */}
      {selected && (() => {
        const selectedRow = results.find((x) => x.emp.id === selected);
        if (!selectedRow) return null;
        const { emp, att, result: r } = selectedRow;
        const otCalcTotal = r.otLegal + r.otPrescribed + r.otNight + r.otHoliday;
        return (
          <div className="detail-panel">
            {/* 勤怠詳細 + 月次調整 */}
            <Card title={`${emp.name} 勤怠・調整`}>
              <div className="section-divider">勤怠情報</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}>
                <div className="detail-row">
                  <span className="label">出勤日数</span>
                  <span className="value">
                    <input type="number" step="1" className="inline-input" style={{ width: 60 }}
                      value={att.workDays} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateAtt(emp.id, "workDays", e.target.value)} />
                    <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>日</span>
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">所定労働日数</span>
                  <span className="value">
                    <input type="number" step="1" className="inline-input" style={{ width: 60 }}
                      value={att.scheduledDays} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateAtt(emp.id, "scheduledDays", e.target.value)} />
                    <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>日</span>
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">出勤時間</span>
                  <span className="value">
                    <input type="number" step="0.5" className="inline-input" style={{ width: 60 }}
                      value={att.workHours} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateAtt(emp.id, "workHours", e.target.value)} />
                    <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>h</span>
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">所定労働時間</span>
                  <span className="value">
                    <input type="number" step="0.5" className="inline-input" style={{ width: 60 }}
                      value={att.scheduledHours} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateAtt(emp.id, "scheduledHours", e.target.value)} />
                    <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>h</span>
                  </span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13, marginTop: 8 }}>
                <div className="detail-row">
                  <span className="label">法定外残業</span>
                  <span className="value mono">{att.legalOT}h</span>
                </div>
                <div className="detail-row">
                  <span className="label">所定外残業</span>
                  <span className="value mono">{att.prescribedOT}h</span>
                </div>
                <div className="detail-row">
                  <span className="label">深夜残業</span>
                  <span className="value mono">{att.nightOT}h</span>
                </div>
                <div className="detail-row">
                  <span className="label">休日労働</span>
                  <span className="value mono">{att.holidayOT}h</span>
                </div>
              </div>

              <div className="section-divider" style={{ marginTop: 16 }}>月次調整（この月のみ）</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, fontSize: 13 }}>
                <div className="detail-row">
                  <span className="label">基本給調整</span>
                  <span className="value">
                    <input type="number" step="1000" className="inline-input" style={{ width: 100 }}
                      value={att.basicPayAdjust || 0} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateAtt(emp.id, "basicPayAdjust", e.target.value)} />
                    <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>円</span>
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">残業手当調整</span>
                  <span className="value">
                    <input type="number" step="1000" className="inline-input" style={{ width: 100 }}
                      value={att.otAdjust || 0} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateAtt(emp.id, "otAdjust", e.target.value)} />
                    <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>円</span>
                  </span>
                </div>
                <div className="detail-row">
                  <span className="label">その他手当</span>
                  <span className="value">
                    <input type="number" step="1000" className="inline-input" style={{ width: 100 }}
                      value={att.otherAllowance || 0} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateAtt(emp.id, "otherAllowance", e.target.value)} />
                    <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>円</span>
                  </span>
                </div>
              </div>
              {(r.basicPayAdj !== 0 || r.otAdjust !== 0 || r.otherAllowance !== 0) && (
                <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 8 }}>
                  * 月次調整が適用されています
                </div>
              )}
            </Card>

            <Card title={`${emp.name} 支給内訳`}>
              {[
                ["基本給", emp.basicPay],
                ...(r.basicPayAdj !== 0 ? [["基本給調整", r.basicPayAdj]] : []),
                ["職務手当", emp.dutyAllowance],
                ["通勤手当", emp.commuteAllow],
                [`残業手当（${att.legalOT}h×1.25）`, r.otLegal],
                [`法定内残業（${att.prescribedOT}h×1.00）`, r.otPrescribed],
                [`深夜残業（${att.nightOT}h×1.25）`, r.otNight],
                [`休日労働（${att.holidayOT}h×1.35）`, r.otHoliday],
                ...(r.otAdjust !== 0 ? [["残業手当調整", r.otAdjust]] : []),
                ...(r.otherAllowance !== 0 ? [["その他手当", r.otherAllowance]] : []),
              ].map(([label, val], i) => (
                <div className="detail-row" key={i}>
                  <span className="label">{label}</span>
                  <span className="value positive">{val > 0 ? `¥${fmt(val)}` : val < 0 ? `-¥${fmt(Math.abs(val))}` : "¥0"}</span>
                </div>
              ))}
              <div className="detail-total success">
                <span>総支給額</span>
                <span className="value">¥{fmt(r.gross)}</span>
              </div>
              <div className="detail-calc">
                時間単価 = {fmt(emp.basicPay + emp.dutyAllowance)} / {emp.avgMonthlyHours} = {r.hourly.toFixed(4)}円
              </div>
            </Card>
            <Card title={`${emp.name} 控除内訳`}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                標準報酬月額: ¥{fmt(emp.stdMonthly)}
                {findGradeByStdMonthly(emp.stdMonthly) ? `（${findGradeByStdMonthly(emp.stdMonthly).grade}等級）` : emp.stdMonthly > 0 ? "（※等級表外）" : ""}
              </div>
              {[
                [`健康保険（${fmt(emp.stdMonthly)}×${rates.health * 100}%）`, r.health],
                [`介護保険（${emp.hasKaigo ? fmt(emp.stdMonthly) + "×" + (rates.kaigo * 100) + "%" : "対象外"})`, r.kaigo],
                [`厚生年金（${emp.hasPension ? fmt(emp.stdMonthly) + "×" + (rates.pension * 100) + "%" : "対象外"})`, r.pension],
                [`雇用保険（${emp.hasEmployment ? fmt(r.gross) + "×" + (rates.employment * 100) + "%" : "対象外"})`, r.employment],
                [`所得税（月額表・甲欄 / 扶養${emp.dependents ?? 0}人）`, r.incomeTax],
                ["住民税（特別徴収）", r.residentTax],
              ].map(([label, val], i) => (
                <div className="detail-row" key={i}>
                  <span className="label">{label}</span>
                  <span className={`value${val > 0 ? " deduction" : ""}`}>{val > 0 ? `-¥${fmt(val)}` : "¥0"}</span>
                </div>
              ))}
              <div className="detail-total danger">
                <span>控除合計</span>
                <span className="value">-¥{fmt(r.totalDeduct)}</span>
              </div>
              <div className="detail-total accent">
                <span>差引支給額</span>
                <span className="value">¥{fmt(r.netPay)}</span>
              </div>
            </Card>
            <Card title={`${emp.name} 事業主負担内訳`}>
              {[
                [`健康保険（${fmt(emp.stdMonthly)}×${rates.healthEr * 100}%）`, r.erHealth],
                [`介護保険（${emp.hasKaigo ? fmt(emp.stdMonthly) + "×" + (rates.kaigoEr * 100) + "%" : "対象外"})`, r.erKaigo],
                [`厚生年金（${emp.hasPension ? fmt(emp.stdMonthly) + "×" + (rates.pensionEr * 100) + "%" : "対象外"})`, r.erPension],
                [`子育て拠出金（${fmt(emp.stdMonthly)}×${rates.childCare * 100}%）`, r.erChildCare],
                [`雇用保険（${emp.hasEmployment ? fmt(r.gross) + "×" + (rates.employment * 100) + "%" : "対象外"})`, r.erEmployment],
              ].map(([label, val], i) => (
                <div className="detail-row" key={i}>
                  <span className="label">{label}</span>
                  <span className="value" style={{ color: "#6366f1" }}>{val > 0 ? `¥${fmt(val)}` : "¥0"}</span>
                </div>
              ))}
              <div className="detail-total" style={{ background: "#eef2ff", color: "#6366f1" }}>
                <span>事業主負担合計</span>
                <span className="value">¥{fmt(r.erTotal)}</span>
              </div>
              <div className="detail-total" style={{ background: "#f0f9ff", color: "#0369a1" }}>
                <span>会社総コスト（総支給+事業主負担）</span>
                <span className="value">¥{fmt(r.companyCost)}</span>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Checks */}
      <div style={{ marginTop: 16 }}>
        <Collapsible title={`確定前チェック（重大 ${monthlyChecks.critical.length} / 注意 ${monthlyChecks.warning.length}）`}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className={`alert-box ${monthlyChecks.critical.length > 0 ? "critical" : "success"}`}>
              <div className="alert-box-title">重大チェック（{monthlyChecks.critical.length}件）</div>
              {monthlyChecks.critical.length === 0
                ? <div>問題ありません</div>
                : <ul>{monthlyChecks.critical.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
              }
            </div>
            <div className={`alert-box ${monthlyChecks.warning.length > 0 ? "warning" : "success"}`}>
              <div className="alert-box-title">注意チェック（{monthlyChecks.warning.length}件）</div>
              {monthlyChecks.warning.length === 0
                ? <div>問題ありません</div>
                : <ul>{monthlyChecks.warning.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
              }
            </div>
          </div>
        </Collapsible>
      </div>

      {/* HRMOS */}
      <div style={{ marginTop: 12 }}>
        <Collapsible title="HRMOS連携・自動計算">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <label className="form-label">
              Base URL
              <input value={hrmosSettings.baseUrl} onChange={(e) => updateHrmos("baseUrl", e.target.value)} placeholder="https://ieyasu.co" disabled style={{ backgroundColor: "#f1f5f9" }} />
            </label>
            <label className="form-label">
              Company URL
              <input value={hrmosSettings.companyUrl} onChange={(e) => updateHrmos("companyUrl", e.target.value)} placeholder="your_company" />
            </label>
            <label className="form-label">
              API Key (Secret Key)
              <input type="password" value={hrmosSettings.apiKey} onChange={(e) => updateHrmos("apiKey", e.target.value)} placeholder="HRMOS管理画面から取得" autoComplete="off" />
            </label>
            <label className="form-label">
              Client ID
              <input value={hrmosSettings.clientId} onChange={(e) => updateHrmos("clientId", e.target.value)} placeholder="client_id (任意)" />
            </label>
            <div style={{ display: "flex", gap: 12, alignItems: "end" }}>
              <label className="checkbox-label">
                <input type="checkbox" checked={hrmosSettings.autoSyncEnabled} onChange={(e) => updateHrmos("autoSyncEnabled", e.target.checked)} />
                自動同期
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={hrmosSettings.autoCalcEnabled} onChange={(e) => updateHrmos("autoCalcEnabled", e.target.checked)} />
                自動計算
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-success btn-sm" onClick={onHrmosSync}>HRMOSから勤怠取込（プレビュー）</button>
            <button className="btn btn-primary btn-sm" onClick={onRunAutoCalc} disabled={(hrmosUnmatchedRecords || []).length > 0}>月次自動計算を実行</button>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>同期: {syncStatus || "-"} / 計算: {calcStatus || "-"}</span>
          </div>

          {hrmosSyncPreview && (
            <div style={{ marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, background: "#f8fafc" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>取込プレビュー（{monthFullLabel(hrmosSyncPreview.month)}）</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                取得 {hrmosSyncPreview.recordCount}件 / 自動反映 {hrmosSyncPreview.autoApplicableCount}件 / 手動確認 {hrmosSyncPreview.manualReviewCount}件
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" onClick={onApplyHrmosPreview}>この内容を反映</button>
                <button className="btn btn-outline btn-sm" onClick={onClearHrmosPreview}>プレビュー破棄</button>
              </div>
              <div style={{ marginTop: 8, maxHeight: 220, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
                <table className="data-table" style={{ minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th>HRMOS連携ID</th>
                      <th>氏名</th>
                      <th>判定</th>
                      <th>紐付け先</th>
                      <th>理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hrmosSyncPreview.rows.map((row) => (
                      <tr key={row.recordKey}>
                        <td className="mono">{row.hrmosEmployeeId || "-"}</td>
                        <td>{row.hrmosEmployeeName || "-"}</td>
                        <td>{hrmosMatchTypeLabel(row.matchType)}</td>
                        <td>{row.matchedEmployeeName || "-"}</td>
                        <td style={{ color: "var(--muted)", fontSize: 11 }}>{row.matchReason || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(hrmosUnmatchedRecords || []).length > 0 && (
            <div style={{ marginTop: 12, border: "1px solid #fecaca", borderRadius: 10, padding: 10, background: "#fff7ed" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>未紐付けキュー（{hrmosUnmatchedRecords.length}件）</div>
              <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
                未紐付けが残っている間は自動計算をブロックします。紐付け先を選んで反映してください。
              </div>
              <div style={{ marginTop: 8, maxHeight: 260, overflow: "auto", border: "1px solid #fdba74", borderRadius: 8, background: "#fff" }}>
                <table className="data-table" style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>HRMOS連携ID</th>
                      <th>氏名</th>
                      <th>理由</th>
                      <th>割当先</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hrmosUnmatchedRecords.map((row) => (
                      <tr key={row.recordKey}>
                        <td className="mono">{row.hrmosEmployeeId || "-"}</td>
                        <td>{row.hrmosEmployeeName || "-"}</td>
                        <td style={{ color: "var(--muted)", fontSize: 11 }}>{row.reason || "-"}</td>
                        <td>
                          <select value={row.assignedEmployeeId || ""} onChange={(e) => onSetHrmosUnmatchedAssignment(row.recordKey, e.target.value)}>
                            <option value="">-- 在籍者を選択 --</option>
                            {activeEmployees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name}（{getEmployeeHrmosNumber(emp) || "連携ID未設定"}）
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-warning btn-sm" onClick={onApplyHrmosUnmatchedAssignments}>選択した割当を反映</button>
              </div>
            </div>
          )}
        </Collapsible>
      </div>

      {/* Guide */}
      <div style={{ marginTop: 12 }}>
        <Collapsible title="操作手順ガイド">
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: "#475569" }}>
            <li>「HRMOSから勤怠取込（プレビュー）」を押し、判定結果を確認して反映</li>
            <li>未紐付けキューが出た場合は従業員を割当して反映</li>
            <li>表の「総支給額」と「差引支給額」を確認</li>
            <li>右上の「確定する」を押す</li>
            <li>「給与明細一覧」で対象月の明細を確認</li>
          </ol>
        </Collapsible>
      </div>

      {/* Payroll Logic Explanation */}
      <div style={{ marginTop: 12 }}>
        <Collapsible title="給与計算ロジックの解説">
          <div style={{ fontSize: 12.5, lineHeight: 2, color: "#334155" }}>
            <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: "#1e293b" }}>1. 支給額の計算</p>
            <p style={{ margin: "0 0 8px" }}>
              当社の給与は<strong>月給制</strong>を採用しています。毎月の総支給額は以下の合計です。
            </p>
            <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
              <li><strong>基本給</strong> — 雇用契約で定めた月額固定給</li>
              <li><strong>職務手当</strong> — 職務内容に応じた月額固定手当</li>
              <li><strong>通勤手当</strong> — 通勤にかかる実費相当額（非課税枠あり）</li>
              <li><strong>残業手当</strong> — 以下の4種類を時間単価×時間数×倍率で算出
                <ul style={{ paddingLeft: 16, marginTop: 2 }}>
                  <li>法定時間外残業（1日8h/週40hを超えた分）… <strong>×1.25</strong></li>
                  <li>所定時間外残業（会社の所定時間超〜法定内）… <strong>×1.00</strong></li>
                  <li>深夜残業（22時〜翌5時）… <strong>×1.25</strong></li>
                  <li>休日残業（法定休日の労働）… <strong>×1.35</strong></li>
                </ul>
              </li>
            </ul>
            <p style={{ margin: "0 0 4px" }}>
              <strong>時間単価</strong>の計算式:（基本給 + 職務手当）÷ 月平均所定労働時間（{settings?.avgMonthlyHoursDefault || 173}h）
            </p>

            <p style={{ fontWeight: 700, fontSize: 13, margin: "16px 0 4px", color: "#1e293b" }}>2. 控除額の計算</p>
            <p style={{ margin: "0 0 8px" }}>
              総支給額から以下を差し引きます。当社は<strong>翌月徴収</strong>（当月分の社会保険料を翌月の給与から控除）方式です。
            </p>
            <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
              <li><strong>健康保険料</strong> — 標準報酬月額 × 健康保険料率（{settings?.healthRate || 5.155}%）<br/>
                <span style={{ color: "#64748b" }}>協会けんぽ（{settings?.jurisdiction || "北海道"}）の折半後の被保険者負担分。50銭超端数切上げ。</span></li>
              <li><strong>介護保険料</strong> — 標準報酬月額 × 介護保険料率（{settings?.kaigoRate || 0.795}%）<br/>
                <span style={{ color: "#64748b" }}>40歳以上65歳未満の被保険者のみ対象。</span></li>
              <li><strong>厚生年金保険料</strong> — 標準報酬月額 × 厚生年金料率（{settings?.pensionRate || 9.15}%）<br/>
                <span style={{ color: "#64748b" }}>全国一律の折半後料率。</span></li>
              <li><strong>雇用保険料</strong> — 総支給額 × 雇用保険料率（{settings?.employmentRate || 0.55}%）<br/>
                <span style={{ color: "#64748b" }}>総支給額に対して計算（標準報酬月額ではない点に注意）。役員は対象外。</span></li>
              <li><strong>所得税</strong> — 課税対象額（総支給 − 社保合計 − 非課税通勤手当）を月額税額表（甲欄）に当てはめて算出<br/>
                <span style={{ color: "#64748b" }}>扶養人数により税額が軽減されます。</span></li>
              <li><strong>住民税</strong> — 前年の所得に基づき市区町村が決定した月額を特別徴収（天引き）<br/>
                <span style={{ color: "#64748b" }}>毎年6月に新年度額に切替。</span></li>
            </ul>

            <p style={{ fontWeight: 700, fontSize: 13, margin: "16px 0 4px", color: "#1e293b" }}>3. 差引支給額（手取り）</p>
            <p style={{ margin: 0 }}>
              <strong>差引支給額 = 総支給額 − 控除合計</strong>（社保 + 所得税 + 住民税）<br/>
              この金額が従業員の銀行口座に振り込まれます。締め日は<strong>{settings?.closingDay || "末日"}</strong>、支給日は<strong>{settings?.paymentDay || "翌月20日"}</strong>です。
            </p>
          </div>
        </Collapsible>
      </div>
    </div>
  );
};

// ===== EmployeesPage =====
const EmployeesPage = ({ employees, setEmployees, setAttendance, setPaidLeaveBalance, onGoPayroll, setChangeLogs, settings }) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const departments = settings?.departments || ["運送事業"];
  const jobTypes = settings?.jobTypes || ["トラックドライバー"];
  const defaultAvgHours = Number(settings?.avgMonthlyHoursDefault) || 173.0;
  // New hire form state
  const [newName, setNewName] = useState("");
  const [newHrmosEmployeeNumber, setNewHrmosEmployeeNumber] = useState("");
  const [newJoinDate, setNewJoinDate] = useState(todayStr);
  const [newEmploymentType, setNewEmploymentType] = useState("正社員");
  const [newDept, setNewDept] = useState(departments[0] || "");
  const [newJobType, setNewJobType] = useState(jobTypes[0] || "");
  const [newDependents, setNewDependents] = useState("0");
  const [newBasePay, setNewBasePay] = useState("210000");
  const [newDutyAllowance, setNewDutyAllowance] = useState("0");
  const [newCommuteAllow, setNewCommuteAllow] = useState("0");
  const [newStdMonthly, setNewStdMonthly] = useState("260000");
  const [newResidentTax, setNewResidentTax] = useState("0");
  const [newHasKaigo, setNewHasKaigo] = useState(false);
  const [newHasEmployment, setNewHasEmployment] = useState(true);
  const [newHasPension, setNewHasPension] = useState(true);
  // UI state
  const [activeTab, setActiveTab] = useState("在籍者");
  const [query, setQuery] = useState("");
  const [onboardingMessage, setOnboardingMessage] = useState("");
  const [onboardingErrors, setOnboardingErrors] = useState({});
  const [showForm, setShowForm] = useState(false);
  // Edit panel: buffer-based editing with explicit save
  const [editingId, setEditingId] = useState(null);
  const [editBuf, setEditBuf] = useState(null);
  const [editDirty, setEditDirty] = useState(false);
  const [editSavedMsg, setEditSavedMsg] = useState("");

  const openEdit = (emp) => {
    if (editDirty && editingId !== null) {
      if (!window.confirm("未保存の変更があります。破棄しますか？")) return;
    }
    setEditingId(emp.id);
    setEditBuf({ ...emp, hrmosEmployeeNumber: getEmployeeHrmosNumber(emp) });
    setEditDirty(false);
    setEditSavedMsg("");
  };
  const closeEdit = () => {
    if (editDirty) {
      if (!window.confirm("未保存の変更があります。破棄しますか？")) return;
    }
    setEditingId(null);
    setEditBuf(null);
    setEditDirty(false);
    setEditSavedMsg("");
  };
  const updateBuf = (field, value) => {
    setEditBuf((prev) => ({ ...prev, [field]: value }));
    setEditDirty(true);
    setEditSavedMsg("");
  };
  const updateBufNum = (field, value) => {
    updateBuf(field, value === "" ? "" : Number(value));
  };
  const saveEdit = () => {
    if (!editBuf) return;
    const normalizedHrmos = normalizeHrmosEmployeeNumber(editBuf.hrmosEmployeeNumber);
    if (editBuf.status === "在籍" && !normalizedHrmos) {
      setEditSavedMsg("HRMOS連携IDを入力してください");
      return;
    }
    if (
      normalizedHrmos &&
      employees.some((e) => String(e.id) !== String(editBuf.id) && getEmployeeHrmosNumber(e) === normalizedHrmos)
    ) {
      setEditSavedMsg("HRMOS連携IDが重複しています");
      return;
    }
    const nextEmp = { ...editBuf, hrmosEmployeeNumber: normalizedHrmos };
    setEmployees((prev) => prev.map((e) => e.id === nextEmp.id ? nextEmp : e));
    setEditDirty(false);
    setEditSavedMsg("保存しました");
    if (setChangeLogs) {
      setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "更新", text: `${nextEmp.name} の情報を更新` }, ...prev].slice(0, 30));
    }
    setTimeout(() => setEditSavedMsg(""), 3000);
  };

  const employmentTemplate = (type) => {
    if (type === "役員") return { basicPay: 370000, dutyAllowance: 0, stdMonthly: 380000, residentTax: 16000, dependents: 0, hasKaigo: true, hasEmployment: false, hasPension: true, isOfficer: true };
    if (type === "嘱託") return { basicPay: 100000, dutyAllowance: 0, stdMonthly: 104000, residentTax: 0, dependents: 0, hasKaigo: false, hasEmployment: false, hasPension: false, isOfficer: false };
    return { basicPay: 210000, dutyAllowance: 10000, stdMonthly: 260000, residentTax: 13000, dependents: 0, hasKaigo: false, hasEmployment: true, hasPension: true, isOfficer: false };
  };

  useEffect(() => {
    if (newEmploymentType === "役員") { setNewHasEmployment(false); setNewHasPension(true); }
  }, [newEmploymentType]);

  const applyTemplate = () => {
    const t = employmentTemplate(newEmploymentType);
    setNewBasePay(String(t.basicPay)); setNewDutyAllowance(String(t.dutyAllowance));
    setNewStdMonthly(String(t.stdMonthly)); setNewResidentTax(String(t.residentTax));
    setNewDependents(String(t.dependents)); setNewHasKaigo(t.hasKaigo);
    setNewHasEmployment(t.hasEmployment); setNewHasPension(t.hasPension);
    setOnboardingErrors({});
  };

  const applyTemplateToEditBuf = () => {
    if (!editBuf) return;
    const type = editBuf.employmentType || (editBuf.isOfficer ? "役員" : "正社員");
    const t = employmentTemplate(type);
    setEditBuf((prev) => ({ ...prev, ...t, employmentType: type }));
    setEditDirty(true);
    setEditSavedMsg("");
  };

  const offboardEmployee = (id) => {
    const target = employees.find((e) => String(e.id) === String(id));
    if (!target || target.status !== "在籍") return;
    if (!window.confirm(`${target.name} を退職処理しますか？`)) return;
    setEmployees((prev) =>
      prev.map((e) =>
        String(e.id) === String(id)
          ? { ...e, status: "退職", leaveDate: e.leaveDate || todayStr, hasEmployment: false, note: `${e.note || ""}${e.note ? " / " : ""}退職処理(${todayStr})` }
          : e
      )
    );
    if (editingId === id) { setEditingId(null); setEditBuf(null); setEditDirty(false); }
    if (setChangeLogs) setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "退職", text: `${target.name} を退職処理` }, ...prev].slice(0, 30));
  };

  const reactivateEmployee = (id) => {
    const target = employees.find((e) => String(e.id) === String(id));
    if (!target || target.status === "在籍") return;
    setEmployees((prev) =>
      prev.map((e) =>
        String(e.id) === String(id)
          ? { ...e, status: "在籍", note: `${e.note || ""}${e.note ? " / " : ""}在籍へ戻す(${todayStr})` }
          : e
      )
    );
    if (setChangeLogs) setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "復帰", text: `${target.name} を在籍に戻す` }, ...prev].slice(0, 30));
  };

  const validateNewHire = () => {
    const errors = {};
    const normalizedHrmosId = normalizeHrmosEmployeeNumber(newHrmosEmployeeNumber);
    if (!newName.trim()) errors.newName = "氏名は必須です";
    if (!normalizedHrmosId) errors.newHrmosEmployeeNumber = "HRMOS連携IDは必須です";
    if (normalizedHrmosId && employees.some((e) => getEmployeeHrmosNumber(e) === normalizedHrmosId)) {
      errors.newHrmosEmployeeNumber = "HRMOS連携IDが重複しています";
    }
    if (!newJoinDate) errors.newJoinDate = "入社日は必須です";
    if (!["正社員", "嘱託", "役員"].includes(newEmploymentType)) errors.newEmploymentType = "雇用区分を選択";
    if ((Number(newDependents) || 0) < 0) errors.newDependents = "0以上";
    if ((Number(newBasePay) || 0) <= 0) errors.newBasePay = "1円以上";
    if ((Number(newStdMonthly) || 0) <= 0) errors.newStdMonthly = "1円以上";
    if ((Number(newDutyAllowance) || 0) < 0) errors.newDutyAllowance = "0以上";
    if ((Number(newResidentTax) || 0) < 0) errors.newResidentTax = "0以上";
    return errors;
  };

  const addDriver = (moveToPayroll = false) => {
    const errors = validateNewHire();
    if (Object.keys(errors).length > 0) { setOnboardingErrors(errors); setOnboardingMessage("入力内容を確認してください"); return; }
    setOnboardingErrors({});
    const nextId = Math.max(0, ...employees.map((e) => typeof e.id === "number" ? e.id : 0)) + 1;
    const isOfficer = newEmploymentType === "役員";
    const newEmployee = {
      id: nextId, name: newName.trim(), joinDate: newJoinDate, joinFiscalYear: fiscalYearFromDate(newJoinDate),
      hrmosEmployeeNumber: normalizeHrmosEmployeeNumber(newHrmosEmployeeNumber),
      employmentType: newEmploymentType, dept: newDept || departments[0] || "運送事業", jobType: newJobType || jobTypes[0] || "トラックドライバー",
      basicPay: Number(newBasePay) || 0, dutyAllowance: Number(newDutyAllowance) || 0, commuteAllow: Number(newCommuteAllow) || 0, avgMonthlyHours: defaultAvgHours,
      stdMonthly: Number(newStdMonthly) || Number(newBasePay) || 0,
      hasKaigo: newHasKaigo, hasPension: isOfficer ? true : newHasPension, hasEmployment: isOfficer ? false : newHasEmployment,
      dependents: Number(newDependents) || 0, residentTax: Number(newResidentTax) || 0, isOfficer, status: "在籍", leaveDate: "",
      note: `新規追加 (${new Date().toLocaleDateString("ja-JP")})`,
    };
    setEmployees((prev) => [...prev, newEmployee]);
    setAttendance((prev) => ({ ...prev, [nextId]: { ...EMPTY_ATTENDANCE } }));
    setPaidLeaveBalance((prev) => [...prev, { empId: nextId, granted: 10, used: 0, carry: 0 }]);
    setNewName(""); setNewHrmosEmployeeNumber(""); setNewJoinDate(todayStr); setNewEmploymentType("正社員"); setNewDependents("0"); setNewDept(departments[0] || ""); setNewJobType(jobTypes[0] || ""); setNewCommuteAllow("0");
    setOnboardingMessage(`${newEmployee.name} を登録しました`);
    setShowForm(false);
    if (setChangeLogs) setChangeLogs((prev) => [{ at: new Date().toISOString(), type: "入社", text: `${newEmployee.name} (${newEmployee.employmentType}) を登録` }, ...prev].slice(0, 30));
    if (moveToPayroll && onGoPayroll) onGoPayroll();
  };

  const removeEmployee = (id) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setAttendance((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setPaidLeaveBalance((prev) => prev.filter((r) => r.empId !== id));
    if (editingId === id) { setEditingId(null); setEditBuf(null); setEditDirty(false); }
  };

  const activeCount = employees.filter((e) => e.status === "在籍").length;
  const retiredCount = employees.filter((e) => e.status !== "在籍").length;
  const setupPendingCount = employees.filter((e) => collectEmployeeSetupIssues(e, employees).length > 0).length;

  const filteredEmployees = employees
    .filter((emp) => activeTab === "在籍者" ? emp.status === "在籍" : emp.status !== "在籍")
    .filter((emp) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return String(emp.name).toLowerCase().includes(q)
        || String(emp.jobType).toLowerCase().includes(q)
        || String(emp.dept).toLowerCase().includes(q)
        || String(getEmployeeHrmosNumber(emp)).toLowerCase().includes(q);
    });

  // Short note: show only last segment
  const shortNote = (note) => {
    if (!note) return null;
    const parts = note.split(" / ");
    return parts[parts.length - 1];
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">従業員一覧</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <Badge variant="success">在籍 {activeCount}名</Badge>
            {retiredCount > 0 && <Badge variant="default">退職 {retiredCount}名</Badge>}
            {setupPendingCount > 0 && <Badge variant="warning">要設定 {setupPendingCount}名</Badge>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "閉じる" : "+ 新規登録"}
        </button>
      </div>

      {/* Onboarding Form */}
      {showForm && (
        <Card title="新規従業員登録">
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label className="form-label">氏名 *<input placeholder="山田 太郎" value={newName} onChange={(e) => setNewName(e.target.value)} className={onboardingErrors.newName ? "error" : ""} />{onboardingErrors.newName && <span className="error-text">{onboardingErrors.newName}</span>}</label>
            <label className="form-label">HRMOS連携ID *<input placeholder="例: 10023" value={newHrmosEmployeeNumber} onChange={(e) => setNewHrmosEmployeeNumber(e.target.value)} className={onboardingErrors.newHrmosEmployeeNumber ? "error" : ""} />{onboardingErrors.newHrmosEmployeeNumber && <span className="error-text">{onboardingErrors.newHrmosEmployeeNumber}</span>}</label>
            <label className="form-label">入社日 *<input type="date" value={newJoinDate} onChange={(e) => setNewJoinDate(e.target.value)} className={onboardingErrors.newJoinDate ? "error" : ""} /></label>
            <label className="form-label">雇用区分 *<select value={newEmploymentType} onChange={(e) => setNewEmploymentType(e.target.value)}><option value="正社員">正社員</option><option value="嘱託">嘱託</option><option value="役員">役員</option></select></label>
            <label className="form-label">部門<select value={newDept} onChange={(e) => setNewDept(e.target.value)}>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
            <label className="form-label">職種<select value={newJobType} onChange={(e) => setNewJobType(e.target.value)}>{jobTypes.map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
            <label className="form-label">扶養人数<input type="number" min="0" step="1" value={newDependents} onChange={(e) => setNewDependents(e.target.value)} className={onboardingErrors.newDependents ? "error" : ""} /></label>
            <label className="form-label">基本給（円）<input value={newBasePay} onChange={(e) => setNewBasePay(e.target.value)} className={onboardingErrors.newBasePay ? "error" : ""} /></label>
            <label className="form-label">職務手当（円）<input value={newDutyAllowance} onChange={(e) => setNewDutyAllowance(e.target.value)} className={onboardingErrors.newDutyAllowance ? "error" : ""} /></label>
            <label className="form-label">通勤手当（円）<input value={newCommuteAllow} onChange={(e) => setNewCommuteAllow(e.target.value)} /></label>
            <label className="form-label">標準報酬月額
              <select value={newStdMonthly} onChange={(e) => setNewStdMonthly(e.target.value)} className={onboardingErrors.newStdMonthly ? "error" : ""}>
                <option value="">-- 等級を選択 --</option>
                {STD_MONTHLY_GRADES.map((g) => (<option key={g.grade} value={String(g.stdMonthly)}>{g.grade}等級 — ¥{g.stdMonthly.toLocaleString()}{g.grade <= 32 ? "" : "（健保のみ）"}</option>))}
              </select>
            </label>
            <label className="form-label">住民税（月額・円）<input value={newResidentTax} onChange={(e) => setNewResidentTax(e.target.value)} className={onboardingErrors.newResidentTax ? "error" : ""} /></label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <label className="checkbox-label"><input type="checkbox" checked={newHasKaigo} onChange={(e) => setNewHasKaigo(e.target.checked)} /> 介護保険</label>
            <label className="checkbox-label" style={newEmploymentType === "役員" ? { opacity: 0.5 } : {}}><input type="checkbox" checked={newHasEmployment} disabled={newEmploymentType === "役員"} onChange={(e) => setNewHasEmployment(e.target.checked)} /> 雇用保険</label>
            <label className="checkbox-label"><input type="checkbox" checked={newHasPension} onChange={(e) => setNewHasPension(e.target.checked)} /> 厚生年金</label>
            <button className="btn btn-secondary btn-sm" onClick={applyTemplate}>{newEmploymentType}テンプレ適用</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => addDriver(false)}>登録</button>
            <button className="btn btn-success" onClick={() => addDriver(true)}>登録して給与計算へ</button>
          </div>
          {onboardingMessage && <div style={{ marginTop: 8, fontSize: 12, color: Object.keys(onboardingErrors).length > 0 ? "#dc2626" : "#16a34a" }}>{onboardingMessage}</div>}
        </Card>
      )}

      {/* Employee List - compact table */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <div className="tabs" style={{ marginBottom: 0 }}>
            {["在籍者", "退職者"].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`tab-btn${activeTab === tab ? " active" : ""}`}>{tab}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input placeholder="検索..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 160 }} />
            <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>{filteredEmployees.length}件</span>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>氏名</th>
                <th>HRMOS連携ID</th>
                <th>区分</th>
                <th>部門 / 職種</th>
                <th className="right">基本給</th>
                <th className="right">標報</th>
                <th>保険</th>
                <th>状態</th>
                <th style={{ width: 140 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => {
                const issues = collectEmployeeSetupIssues(emp, employees);
                const isEditing = editingId === emp.id;
                return (
                  <React.Fragment key={emp.id}>
                    <tr className={isEditing ? "selected" : ""} style={{ cursor: "pointer" }}
                      onClick={() => { if (!isEditing) openEdit(emp); else closeEdit(); }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{emp.name}</div>
                        {shortNote(emp.note) && <div style={{ fontSize: 10, color: "var(--warning)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortNote(emp.note)}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: getEmployeeHrmosNumber(emp) ? "var(--text)" : "var(--warning)" }}>{getEmployeeHrmosNumber(emp) || "未設定"}</td>
                      <td style={{ fontSize: 12 }}>{emp.employmentType || (emp.isOfficer ? "役員" : "正社員")}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{emp.dept} / {emp.jobType}</td>
                      <td className="right mono" style={{ fontSize: 12 }}>¥{fmt(emp.basicPay)}</td>
                      <td className="right mono" style={{ fontSize: 12 }}>¥{fmt(emp.stdMonthly)}</td>
                      <td style={{ fontSize: 10 }}>
                        {emp.hasKaigo && <span style={{ color: "var(--danger)", marginRight: 4 }}>介護</span>}
                        {emp.hasPension && <span style={{ color: "var(--accent)", marginRight: 4 }}>年金</span>}
                        {emp.hasEmployment && <span style={{ color: "var(--success)" }}>雇保</span>}
                      </td>
                      <td>
                        {issues.length > 0
                          ? <Badge variant="warning">{issues[0]}</Badge>
                          : <span className={`status-pill ${emp.status === "在籍" ? "active" : "retired"}`}>{emp.status === "在籍" ? "OK" : "退職"}</span>
                        }
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-sm btn-outline" onClick={() => isEditing ? closeEdit() : openEdit(emp)}>
                            {isEditing ? "閉じる" : "編集"}
                          </button>
                          {emp.status === "在籍"
                            ? <button className="btn btn-sm btn-danger" onClick={() => offboardEmployee(emp.id)}>退社</button>
                            : <button className="btn btn-sm btn-success" onClick={() => reactivateEmployee(emp.id)}>復帰</button>
                          }
                          <button className="btn btn-sm btn-danger" style={{ padding: "5px 6px" }} onClick={() => { if (window.confirm(`${emp.name} を削除しますか？`)) removeEmployee(emp.id); }} title="削除">✕</button>
                        </div>
                      </td>
                    </tr>
                    {isEditing && editBuf && (
                      <tr className="edit-row-expand">
                        <td colSpan={9} style={{ padding: 0, border: "none" }}>
                          <div className="inline-edit-panel">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontWeight: 700, fontSize: 15 }}>{editBuf.name}</span>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>の編集</span>
                                {editDirty && <Badge variant="warning">未保存</Badge>}
                                {editSavedMsg && <Badge variant="success">{editSavedMsg}</Badge>}
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="btn btn-sm btn-secondary" onClick={applyTemplateToEditBuf}>テンプレ適用</button>
                                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={!editDirty}>保存</button>
                                <button className="btn btn-sm btn-outline" onClick={closeEdit}>閉じる</button>
                              </div>
                            </div>
                            <div className="form-grid">
                              <label className="form-label">氏名<input value={editBuf.name} onChange={(e) => updateBuf("name", e.target.value)} /></label>
                              <label className="form-label">HRMOS連携ID<input value={editBuf.hrmosEmployeeNumber || ""} onChange={(e) => updateBuf("hrmosEmployeeNumber", e.target.value)} /></label>
                              <label className="form-label">雇用区分<select value={editBuf.employmentType || (editBuf.isOfficer ? "役員" : "正社員")} onChange={(e) => { updateBuf("employmentType", e.target.value); updateBuf("isOfficer", e.target.value === "役員"); }}><option value="正社員">正社員</option><option value="嘱託">嘱託</option><option value="役員">役員</option></select></label>
                              <label className="form-label">部門<select value={editBuf.dept} onChange={(e) => updateBuf("dept", e.target.value)}>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
                              <label className="form-label">職種<select value={editBuf.jobType} onChange={(e) => updateBuf("jobType", e.target.value)}>{jobTypes.map((j) => <option key={j} value={j}>{j}</option>)}</select></label>
                              <label className="form-label">基本給（円）<input type="number" value={editBuf.basicPay} onChange={(e) => updateBufNum("basicPay", e.target.value)} /></label>
                              <label className="form-label">職務手当（円）<input type="number" value={editBuf.dutyAllowance} onChange={(e) => updateBufNum("dutyAllowance", e.target.value)} /></label>
                              <label className="form-label">通勤手当（円）<input type="number" value={editBuf.commuteAllow} onChange={(e) => updateBufNum("commuteAllow", e.target.value)} /></label>
                              <label className="form-label">標準報酬月額
                                <select value={String(editBuf.stdMonthly || "")} onChange={(e) => updateBufNum("stdMonthly", e.target.value)}>
                                  <option value="">-- 等級を選択 --</option>
                                  {STD_MONTHLY_GRADES.map((g) => (<option key={g.grade} value={String(g.stdMonthly)}>{g.grade}等級 — ¥{g.stdMonthly.toLocaleString()}{g.grade <= 32 ? "" : "（健保のみ）"}</option>))}
                                </select>
                                {editBuf.stdMonthly > 0 && !findGradeByStdMonthly(editBuf.stdMonthly) && <span style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>※ 等級表にない金額です</span>}
                                {editBuf.stdMonthly > 0 && findGradeByStdMonthly(editBuf.stdMonthly) && <span style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{findGradeByStdMonthly(editBuf.stdMonthly).grade}等級</span>}
                              </label>
                              <label className="form-label">住民税（月額・円）<input type="number" value={editBuf.residentTax} onChange={(e) => updateBufNum("residentTax", e.target.value)} /></label>
                              <label className="form-label">扶養人数<input type="number" min="0" step="1" value={editBuf.dependents} onChange={(e) => updateBufNum("dependents", e.target.value)} /></label>
                              <label className="form-label">月平均所定労働時間<input type="number" step="0.1" value={editBuf.avgMonthlyHours} onChange={(e) => updateBufNum("avgMonthlyHours", e.target.value)} /></label>
                              <label className="form-label">入社日<input type="date" value={editBuf.joinDate || ""} onChange={(e) => updateBuf("joinDate", e.target.value)} /></label>
                              <label className="form-label">退職日<input type="date" value={editBuf.leaveDate || ""} onChange={(e) => updateBuf("leaveDate", e.target.value)} /></label>
                            </div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                              <label className="checkbox-label"><input type="checkbox" checked={editBuf.hasKaigo} onChange={(e) => updateBuf("hasKaigo", e.target.checked)} /> 介護保険</label>
                              <label className="checkbox-label"><input type="checkbox" checked={editBuf.hasPension} onChange={(e) => updateBuf("hasPension", e.target.checked)} /> 厚生年金</label>
                              <label className="checkbox-label"><input type="checkbox" checked={editBuf.hasEmployment} disabled={editBuf.isOfficer} onChange={(e) => updateBuf("hasEmployment", e.target.checked)} /> 雇用保険</label>
                            </div>
                            <label className="form-label" style={{ marginTop: 10 }}>備考<input value={editBuf.note || ""} onChange={(e) => updateBuf("note", e.target.value)} /></label>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// 旧APIフォーマット→新フォーマット正規化（後方互換）
const normalizeSnapshotRow = (row) => ({
  empId: row.empId ?? row.employeeId,
  name: row.name ?? row.employeeName,
  jobType: row.jobType ?? row.dept ?? "",
  dept: row.dept || row.jobType || "",
  employmentType: row.employmentType || "",
  basicPay: row.basicPay || 0,
  dutyAllowance: row.dutyAllowance || 0,
  commuteAllow: row.commuteAllow || 0,
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
});

// ===== HistoryPage =====
const HistoryPage = ({ employees, attendance, monthlyHistory, monthlySnapshots, onImportHistoryData, companyName, settings, payrollTargetMonth, onRefreshTargetSnapshot }) => {
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
    if (rawSnapshot.length > 0) {
      return rawSnapshot.map(normalizeSnapshotRow);
    }
    if (month === CURRENT_PROCESSING_MONTH) {
      return employees
        .filter((e) => e.status === "在籍")
        .map((emp) => { const a = attendance[emp.id] || EMPTY_ATTENDANCE; return toSnapshotRowFromCalc(emp, calcPayroll(emp, a, settings), a); });
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
    {
      label: "渡曾羊一: 厚生年金が0円（年金受給者）",
      ok: !!youichiRow && Number(youichiRow.pension || 0) === 0,
      detail: youichiRow ? `実値: ${money(youichiRow.pension || 0)}` : "対象データなし",
    },
    {
      label: "渡曾羊一: 雇用保険が0円",
      ok: !!youichiRow && Number(youichiRow.employment || 0) === 0,
      detail: youichiRow ? `実値: ${money(youichiRow.employment || 0)}` : "対象データなし",
    },
    {
      label: "門馬将太: 役員のため雇用保険が0円",
      ok: !!monmaRow && Number(monmaRow.employment || 0) === 0,
      detail: monmaRow ? `実値: ${money(monmaRow.employment || 0)}` : "対象データなし",
    },
    {
      label: "門馬将太: 健保+介護の合計が22,610円（2026-01基準）",
      ok: targetMonth !== "2026-01" || (!!monmaRow && Number(monmaRow.health || 0) + Number(monmaRow.kaigo || 0) === 22610),
      detail: monmaRow ? `実値: ${money((monmaRow.health || 0) + (monmaRow.kaigo || 0))}` : "対象データなし",
    },
  ];

  const buildMfCompareReport = (currentRows, csvRows, month) => {
    const toTotals = (rows) => rows.reduce((acc, row) => ({
      gross: acc.gross + Number(row.gross || 0),
      totalDeduct: acc.totalDeduct + Number(row.totalDeduct || 0),
      net: acc.net + Number(row.net || 0),
    }), { gross: 0, totalDeduct: 0, net: 0 });
    const toRowsByName = (rows) => {
      const byName = new Map();
      rows.forEach((row) => {
        const key = normalizeName(row.name);
        if (!key) return;
        const prev = byName.get(key) || { name: row.name, gross: 0, totalDeduct: 0, net: 0 };
        byName.set(key, {
          name: prev.name || row.name,
          gross: prev.gross + Number(row.gross || 0),
          totalDeduct: prev.totalDeduct + Number(row.totalDeduct || 0),
          net: prev.net + Number(row.net || 0),
        });
      });
      return byName;
    };

    const currentTotals = toTotals(currentRows);
    const csvTotals = toTotals(csvRows);
    const diffTotals = {
      gross: currentTotals.gross - csvTotals.gross,
      totalDeduct: currentTotals.totalDeduct - csvTotals.totalDeduct,
      net: currentTotals.net - csvTotals.net,
    };

    const currentByName = toRowsByName(currentRows);
    const csvByName = toRowsByName(csvRows);
    const names = new Set([...currentByName.keys(), ...csvByName.keys()]);

    const perEmployee = Array.from(names)
      .map((key) => {
        const cur = currentByName.get(key);
        const csv = csvByName.get(key);
        return {
          name: cur?.name || csv?.name || key,
          grossDiff: Number(cur?.gross || 0) - Number(csv?.gross || 0),
          totalDeductDiff: Number(cur?.totalDeduct || 0) - Number(csv?.totalDeduct || 0),
          netDiff: Number(cur?.net || 0) - Number(csv?.net || 0),
          missingInCsv: !csv,
          missingInSystem: !cur,
        };
      })
      .filter((row) =>
        row.missingInCsv || row.missingInSystem || row.grossDiff !== 0 || row.totalDeductDiff !== 0 || row.netDiff !== 0
      );

    return { month, currentTotals, csvTotals, diffTotals, perEmployee };
  };

  // CSV import handler (same logic as before, extracted for readability)
  const handleCsvImport = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const imported = [];
    let skippedByName = 0;
    let skippedByHeader = 0;
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
      const headerRowIdx = rows.findIndex((r) => {
        const hs = r.map(normalizeHeader);
        return hs.some((h) => h.includes("氏名") || h.includes("従業員名")) && hs.some((h) => h.includes("総支給") || h.includes("支給合計")) && hs.some((h) => h.includes("差引支給") || h.includes("差引支給額") || h.includes("手取り"));
      });
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
    if (imported.length === 0) {
      setMfCompareReport(null);
      setImportMessage(`取り込めるCSVが見つかりませんでした（名前不一致:${skippedByName} / ヘッダ不一致:${skippedByHeader}）`);
      return;
    }

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
            <div className="payslip-header">
              <h2>給 与 明 細 書</h2>
              <div style={{ fontSize: 12, textAlign: "right" }}><div>{companyName}</div></div>
            </div>
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
                <div className="payslip-row"><span className="lbl">時間外手当</span><span className="amt">{money(row.overtimePay)}</span></div>
                {(row.prescribedOvertimePay || 0) > 0 && <div className="payslip-row sub"><span className="lbl">所定外残業手当</span><span className="amt">{money(row.prescribedOvertimePay)}</span></div>}
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

  const COL_COUNT = 12; // テーブルカラム数

  // ---- Excel 給与台帳エクスポート ----
  const exportExcel = async () => {
    if (detailRows.length === 0) return;
    const XLSX = (await import("xlsx")).default || (await import("xlsx"));
    const monthText = monthFullLabel(targetMonth);
    const payDateText = selectedHistory?.payDate || "";

    // ヘッダー行
    const headers = [
      "従業員名", "部署", "雇用区分", "職種",
      "出勤日数", "所定労働日数", "出勤時間", "所定労働時間",
      "法定外残業(h)", "所定外残業(h)", "深夜残業(h)", "休日労働(h)",
      "基本給", "基本給調整", "職務手当", "通勤手当",
      "時間外手当", "法定内残業手当", "深夜残業手当", "休日手当",
      "残業手当調整", "その他手当", "総支給額",
      "健康保険料", "介護保険料", "厚生年金", "雇用保険料",
      "社会保険料計", "所得税", "住民税", "年末調整", "控除合計",
      "差引支給額",
    ];

    const dataRows = detailRows.map((row) => [
      row.name, row.dept || "", row.employmentType || "", row.jobType || "",
      row.workDays || 0, row.scheduledDays || 0, row.workHours || 0, row.scheduledHours || 0,
      row.legalOT || 0, row.prescribedOT || 0, row.nightOT || 0, row.holidayOT || 0,
      row.basicPay || 0, row.basicPayAdjust || 0, row.dutyAllowance || 0, row.commuteAllow || 0,
      row.overtimePay || 0, row.prescribedOvertimePay || 0, row.nightOvertimePay || 0, row.holidayPay || 0,
      row.otAdjust || 0, row.otherAllowance || 0, row.gross || 0,
      row.health || 0, row.kaigo || 0, row.pension || 0, row.employment || 0,
      (row.health || 0) + (row.kaigo || 0) + (row.pension || 0) + (row.employment || 0),
      row.incomeTax || 0, row.residentTax || 0, row.yearAdjustment || 0, row.totalDeduct || 0,
      row.net || 0,
    ]);

    // 合計行
    const totalsRow = ["合計", "", "", "",
      detailRows.reduce((s, r) => s + (r.workDays || 0), 0),
      "", "", "",
      detailRows.reduce((s, r) => s + (r.legalOT || 0), 0),
      detailRows.reduce((s, r) => s + (r.prescribedOT || 0), 0),
      detailRows.reduce((s, r) => s + (r.nightOT || 0), 0),
      detailRows.reduce((s, r) => s + (r.holidayOT || 0), 0),
      detailTotals.basicPay, 0, detailTotals.dutyAllowance, 0,
      detailTotals.overtimePay, detailTotals.prescribedOvertimePay,
      detailTotals.nightOvertimePay, detailTotals.holidayPay,
      0, 0, detailTotals.gross,
      detailTotals.health, detailTotals.kaigo, detailTotals.pension, detailTotals.employment,
      detailTotals.health + detailTotals.kaigo + detailTotals.pension + detailTotals.employment,
      detailTotals.incomeTax, detailTotals.residentTax, detailTotals.yearAdjustment, detailTotals.totalDeduct,
      detailTotals.net,
    ];

    // タイトル行
    const titleRows = [
      [`${companyName || "きょうしん輸送"} 給与台帳`],
      [`対象月: ${monthText}`, "", `支給日: ${payDateText ? formatDateJP(payDateText) : "-"}`, "", `出力日: ${new Date().toLocaleDateString("ja-JP")}`],
      [],
    ];

    const allRows = [...titleRows, headers, ...dataRows, [], totalsRow];

    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // 列幅の設定
    ws["!cols"] = [
      { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 14 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
      { wch: 14 },
    ];

    // 金額列に数値フォーマットを適用（12列目以降）
    const numFmt = "#,##0";
    const rowStart = titleRows.length + 1; // 0-indexed but aoa_to_sheet uses 0-indexed internally
    for (let ri = rowStart; ri < allRows.length; ri++) {
      for (let ci = 12; ci < headers.length; ci++) {
        const cellRef = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (ws[cellRef] && typeof ws[cellRef].v === "number") {
          ws[cellRef].z = numFmt;
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "給与台帳");
    XLSX.writeFile(wb, `給与台帳_${targetMonth}.xlsx`);
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

    // カテゴリ別ヘッダー（2段組み: グループ行 + 項目行）
    const groups = [
      { label: "従業員情報", cols: ["氏名", "部署", "区分", "職種"] },
      { label: "勤 怠", cols: ["出勤\n日数", "所定\n日数", "出勤\n時間", "所定\n時間", "法定外\n残業", "所定外\n残業", "深夜\n残業", "休日\n労働"] },
      { label: "支 給", cols: ["基本給", "基本給\n調整", "職務手当", "通勤手当", "時間外\n手当", "法定内\n残業手当", "深夜\n残業手当", "休日手当", "残業\n調整", "その他\n手当", "総支給額"] },
      { label: "控 除", cols: ["健康\n保険", "介護\n保険", "厚生\n年金", "雇用\n保険", "社保計", "所得税", "住民税", "年末\n調整", "控除計"] },
      { label: "", cols: ["差引支給額"] },
    ];

    const buildDataCells = (r) => {
      const si = (r.health||0)+(r.kaigo||0)+(r.pension||0)+(r.employment||0);
      return [
        r.name, r.dept || "", r.employmentType || "", r.jobType || "",
        fmtH(r.workDays), fmtH(r.scheduledDays), fmtH(r.workHours), fmtH(r.scheduledHours),
        fmtH(r.legalOT), fmtH(r.prescribedOT), fmtH(r.nightOT), fmtH(r.holidayOT),
        fmtCell(r.basicPay), fmtCell(r.basicPayAdjust), fmtCell(r.dutyAllowance), fmtCell(r.commuteAllow),
        fmtCell(r.overtimePay), fmtCell(r.prescribedOvertimePay), fmtCell(r.nightOvertimePay), fmtCell(r.holidayPay),
        fmtCell(r.otAdjust), fmtCell(r.otherAllowance), fmtCell(r.gross),
        fmtCell(r.health), fmtCell(r.kaigo), fmtCell(r.pension), fmtCell(r.employment),
        fmtCell(si), fmtCell(r.incomeTax), fmtCell(r.residentTax), fmtCell(r.yearAdjustment), fmtCell(r.totalDeduct),
        fmtCell(r.net),
      ];
    };

    // 合計行
    const siTotal = (detailTotals.health||0)+(detailTotals.kaigo||0)+(detailTotals.pension||0)+(detailTotals.employment||0);
    const totals = [
      "合 計", "", "", "",
      fmtH(detailRows.reduce((s,r)=>s+(r.workDays||0),0)), "", "", "",
      fmtH(detailRows.reduce((s,r)=>s+(r.legalOT||0),0)),
      fmtH(detailRows.reduce((s,r)=>s+(r.prescribedOT||0),0)),
      fmtH(detailRows.reduce((s,r)=>s+(r.nightOT||0),0)),
      fmtH(detailRows.reduce((s,r)=>s+(r.holidayOT||0),0)),
      fmtCell(detailTotals.basicPay), "", fmtCell(detailTotals.dutyAllowance), "",
      fmtCell(detailTotals.overtimePay), fmtCell(detailTotals.prescribedOvertimePay),
      fmtCell(detailTotals.nightOvertimePay), fmtCell(detailTotals.holidayPay),
      "", "", fmtCell(detailTotals.gross),
      fmtCell(detailTotals.health), fmtCell(detailTotals.kaigo), fmtCell(detailTotals.pension), fmtCell(detailTotals.employment),
      fmtCell(siTotal), fmtCell(detailTotals.incomeTax), fmtCell(detailTotals.residentTax), fmtCell(detailTotals.yearAdjustment), fmtCell(detailTotals.totalDeduct),
      fmtCell(detailTotals.net),
    ];

    // グループヘッダー行 HTML
    let groupHeaderHtml = "<tr>";
    groups.forEach((g) => {
      const cls = g.label === "支 給" ? " pay" : g.label === "控 除" ? " ded" : g.label === "" ? " net" : "";
      groupHeaderHtml += `<th class="group${cls}" colspan="${g.cols.length}">${g.label}</th>`;
    });
    groupHeaderHtml += "</tr>";

    // 項目ヘッダー行 HTML
    let colHeaderHtml = "<tr>";
    let colIdx = 0;
    groups.forEach((g) => {
      g.cols.forEach((c) => {
        const rightAlign = colIdx >= 4 ? " r" : "";
        colHeaderHtml += `<th class="col${rightAlign}">${c.replace(/\n/g, "<br>")}</th>`;
        colIdx++;
      });
    });
    colHeaderHtml += "</tr>";

    // データ行
    const bodyRows = detailRows.map((r, i) => {
      const cells = buildDataCells(r);
      let html = `<tr class="${i % 2 === 1 ? "stripe" : ""}">`;
      cells.forEach((v, ci) => {
        const rightAlign = ci >= 4 ? " class=\"r\"" : "";
        const isBold = ci === 22 || ci === 31 || ci === 32; // 総支給額, 控除計, 差引支給額
        const isNet = ci === 32;
        const isDed = ci >= 23 && ci <= 31;
        let style = "";
        if (isNet) style = " style=\"color:#1d4ed8;font-weight:700\"";
        else if (ci === 22) style = " style=\"font-weight:700\"";
        else if (ci === 31) style = " style=\"color:#dc2626;font-weight:700\"";
        else if (isBold) style = " style=\"font-weight:700\"";
        html += `<td${rightAlign}${style}>${v}</td>`;
      });
      html += "</tr>";
      return html;
    }).join("");

    // 合計行
    let totalsHtml = "<tr class=\"totals\">";
    totals.forEach((v, ci) => {
      const rightAlign = ci >= 4 ? " class=\"r\"" : "";
      let style = "";
      if (ci === 32) style = " style=\"color:#1d4ed8\"";
      else if (ci === 31) style = " style=\"color:#dc2626\"";
      totalsHtml += `<td${rightAlign}${style}>${v}</td>`;
    });
    totalsHtml += "</tr>";

    const win = window.open("", "_blank", "width=1400,height=900");
    if (!win) return;
    win.document.open();
    win.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>${cn} 給与台帳 ${monthText}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:landscape;margin:10mm 8mm}
body{font-family:'Noto Sans JP',sans-serif;color:#1e293b;font-size:9px;padding:16px}
.header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #1e293b}
.header h1{font-size:16px;font-weight:700;letter-spacing:1px}
.header-meta{text-align:right;font-size:10px;color:#475569;line-height:1.6}
table{width:100%;border-collapse:collapse;table-layout:auto}
th.group{background:#1e293b;color:#fff;font-size:9px;font-weight:700;padding:4px 6px;text-align:center;border:1px solid #334155;letter-spacing:1px}
th.group.pay{background:#166534}
th.group.ded{background:#991b1b}
th.group.net{background:#1e40af}
th.col{background:#f1f5f9;font-size:8px;font-weight:600;padding:4px 5px;text-align:center;border:1px solid #cbd5e1;color:#334155;white-space:nowrap;line-height:1.3}
th.col.r{text-align:right;padding-right:6px}
td{padding:4px 5px;border:1px solid #e2e8f0;font-size:8.5px;white-space:nowrap;font-family:'JetBrains Mono','Noto Sans JP',monospace}
td:first-child{font-family:'Noto Sans JP',sans-serif;font-weight:500}
td:nth-child(2),td:nth-child(3),td:nth-child(4){font-family:'Noto Sans JP',sans-serif;font-size:8px}
td.r{text-align:right;padding-right:6px}
tr.stripe{background:#f8fafc}
tr.totals{background:#eef2ff;font-weight:700;border-top:2px solid #1e293b}
tr.totals td{border-top:2px solid #1e293b;font-size:9px}
.footer{margin-top:10px;font-size:8px;color:#94a3b8;text-align:right}
@media print{body{padding:0;font-size:8px}td{font-size:8px}th.col{font-size:7.5px}.header h1{font-size:14px}}
</style></head><body>
<div class="header">
<h1>${cn}　給 与 台 帳</h1>
<div class="header-meta">対象月: ${monthText}<br>支給日: ${payDateText}<br>出力日: ${exportDate}</div>
</div>
<table>
<thead>${groupHeaderHtml}${colHeaderHtml}</thead>
<tbody>${bodyRows}${totalsHtml}</tbody>
</table>
<div class="footer">${cn} — ${monthText} 給与台帳 — ${exportDate} 出力</div>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
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
              <button className="btn btn-secondary btn-sm" onClick={exportExcel} title="給与台帳をExcel形式でダウンロード">Excel出力</button>
              <button className="btn btn-secondary btn-sm" onClick={exportAllPayslipsPdf} title="給与台帳をPDF形式で出力（印刷用）">台帳PDF出力</button>
            </>
          )}
        </div>
      </div>

      {/* Month Selector */}
      <Card title={`対象月（${selectedFiscalYear}年度）`}>
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a2332" }}>{payrollCycleLabel(targetMonth, selectedHistory?.payDate)}</span>
        </div>
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

      {/* Detail Table */}
      <Card title={`${monthFullLabel(targetMonth)} 従業員別明細`}>
        {detailRows.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">📄</div>この月の明細データはありません<br/><span style={{ fontSize: 11 }}>給与計算を実行して確定すると、ここに明細が表示されます</span></div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {targetMonth === payrollTargetMonth
                  ? "現在対象月 — 再計算でスナップショットを更新できます"
                  : "過去月のスナップショットを表示中"}
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={onRefreshTargetSnapshot}
                disabled={targetMonth !== payrollTargetMonth}
                title={targetMonth !== payrollTargetMonth ? "現在対象月を選択したときのみ実行できます" : ""}
              >
                再計算
              </button>
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
                    const otTotal = (row.overtimePay || 0) + (row.prescribedOvertimePay || 0) + (row.nightOvertimePay || 0) + (row.holidayPay || 0) + (row.otAdjust || 0);
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
                          <td>
                            <button className={`btn ${isOpen ? "btn-outline" : "btn-primary"} btn-sm`}
                              onClick={(e) => { e.stopPropagation(); setPayslipEmpId(isOpen ? null : row.empId); }}>
                              {isOpen ? "閉じる" : "明細"}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="edit-row-expand">
                            <td colSpan={COL_COUNT + 1} style={{ padding: 0 }}>{renderPayslip(row)}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <tr className="totals-row">
                    <td style={{ fontWeight: 700 }}>合計</td>
                    <td className="right mono">¥{fmt(detailTotals.basicPay)}</td>
                    <td className="right mono">¥{fmt(detailTotals.overtimePay + detailTotals.prescribedOvertimePay + detailTotals.nightOvertimePay + detailTotals.holidayPay)}</td>
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
            <div style={{ fontWeight: 700 }}>
              {mfCompareReport.perEmployee.length === 0 && mfCompareReport.diffTotals.gross === 0 && mfCompareReport.diffTotals.totalDeduct === 0 && mfCompareReport.diffTotals.net === 0
                ? "✓ 総額・従業員別の差分はありません"
                : "! MF元CSVとの間に差分があります"}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              総支給差分: {money(mfCompareReport.diffTotals.gross)} / 控除差分: {money(mfCompareReport.diffTotals.totalDeduct)} / 差引差分: {money(mfCompareReport.diffTotals.net)}
            </div>
          </div>
          {mfCompareReport.perEmployee.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>従業員</th>
                    <th className="right">総支給差分</th>
                    <th className="right">控除差分</th>
                    <th className="right">差引差分</th>
                    <th>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {mfCompareReport.perEmployee.map((row) => (
                    <tr key={`${row.name}-${row.missingInCsv ? "missing-csv" : row.missingInSystem ? "missing-system" : "diff"}`}>
                      <td>{row.name}</td>
                      <td className="right mono">{money(row.grossDiff)}</td>
                      <td className="right mono">{money(row.totalDeductDiff)}</td>
                      <td className="right mono">{money(row.netDiff)}</td>
                      <td style={{ fontSize: 12, color: "#64748b" }}>
                        {row.missingInCsv ? "CSV側に該当従業員なし" : row.missingInSystem ? "システム側に該当従業員なし" : "差分あり"}
                      </td>
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

      {/* CSV Import */}
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

// ===== LeavePage =====
const LeavePage = ({ employees, paidLeaveBalance, setPaidLeaveBalance }) => {
  const updateLeave = (empId, field, value) => {
    setPaidLeaveBalance((prev) => prev.map((r) => r.empId === empId ? { ...r, [field]: Math.max(0, Number(value) || 0) } : r));
  };
  const activeBalance = paidLeaveBalance.filter((row) => employees.find((e) => e.id === row.empId && e.status === "在籍"));
  const totalRemaining = activeBalance.reduce((s, row) => s + row.granted + row.carry - row.used, 0);
  const lowLeaveCount = activeBalance.filter((row) => (row.granted + row.carry - row.used) <= 2).length;
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">有給休暇管理</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge variant="info">在籍{activeBalance.length}名</Badge>
          <Badge variant="default">残日数合計 {totalRemaining.toFixed(1)}日</Badge>
          {lowLeaveCount > 0 && <Badge variant="warning">残少 {lowLeaveCount}名</Badge>}
        </div>
      </div>
      <Card title="残日数一覧（在籍者）">
        {paidLeaveBalance.map((row) => {
          const emp = employees.find((e) => e.id === row.empId && e.status === "在籍");
          if (!emp) return null;
          const remaining = row.granted + row.carry - row.used;
          const usedRate = Math.min(100, Math.round((row.used / (row.granted + row.carry || 1)) * 100));
          const remainColor = remaining <= 2 ? "var(--danger)" : remaining <= 5 ? "var(--warning)" : "var(--accent)";
          return (
            <div key={row.empId} className="leave-card">
              <div className="leave-header">
                <div>
                  <div style={{ fontWeight: 700 }}>{emp.name}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{emp.dept} / {emp.jobType}</div>
                </div>
                <div style={{ fontFamily: "var(--mono)", fontWeight: 700, color: remainColor, fontSize: 18 }}>{remaining.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>日残</span></div>
              </div>
              <div className="leave-bar">
                <div className="leave-bar-fill" style={{ width: `${usedRate}%`, background: usedRate > 80 ? "var(--success)" : undefined }} />
              </div>
              <div className="leave-edit">
                <label className="form-label">付与<input type="number" step="0.5" min="0" value={row.granted} onChange={(e) => updateLeave(row.empId, "granted", e.target.value)} /></label>
                <label className="form-label">繰越<input type="number" step="0.5" min="0" value={row.carry} onChange={(e) => updateLeave(row.empId, "carry", e.target.value)} /></label>
                <label className="form-label">取得<input type="number" step="0.5" min="0" value={row.used} onChange={(e) => updateLeave(row.empId, "used", e.target.value)} /></label>
                <div className="form-label">消化率<div style={{ fontFamily: "var(--mono)", fontSize: 13, padding: "7px 0" }}>{usedRate}%</div></div>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

// ===== SettingsPage =====
const SETTINGS_TABS = [
  { id: "basic", label: "基本設定" },
  { id: "insurance", label: "保険・税" },
  { id: "labor", label: "労働条件" },
  { id: "org", label: "組織・明細" },
];

const SettingsPage = ({ settings, setSettings }) => {
  const [savedAt, setSavedAt] = useState("");
  const [settingsTab, setSettingsTab] = useState("basic");
  const [newDept, setNewDept] = useState("");
  const [newJobType, setNewJobType] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const update = (field, value) => setSettings((prev) => ({ ...prev, [field]: value }));
  const updateNum = (field, value) => update(field, value === "" ? "" : Number(value));
  const updateMonthDays = (month, value) => setSettings((prev) => ({ ...prev, monthlyWorkDays: { ...prev.monthlyWorkDays, [month]: value === "" ? "" : Number(value) } }));

  const dayNames = [
    { key: "holidayMonday", label: "月曜" }, { key: "holidayTuesday", label: "火曜" },
    { key: "holidayWednesday", label: "水曜" }, { key: "holidayThursday", label: "木曜" },
    { key: "holidayFriday", label: "金曜" }, { key: "holidaySaturday", label: "土曜" },
    { key: "holidaySunday", label: "日曜" }, { key: "holidayNational", label: "祝日" },
  ];
  const monthNames = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
  const monthKeys = ["01","02","03","04","05","06","07","08","09","10","11","12"];
  const totalWorkDays = monthKeys.reduce((s, k) => s + (settings.monthlyWorkDays?.[k] || 0), 0);
  const totalHolidays = 365 - totalWorkDays;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">マスタ設定</h1>
        <Badge variant="info">自動保存</Badge>
      </div>

      {/* タブナビゲーション */}
      <div className="settings-tabs">
        {SETTINGS_TABS.map((tab) => (
          <button key={tab.id} className={`settings-tab${settingsTab === tab.id ? " active" : ""}`} onClick={() => setSettingsTab(tab.id)}>{tab.label}</button>
        ))}
      </div>

      {/* ===== 基本設定タブ ===== */}
      {settingsTab === "basic" && <>
        <Card title="会社情報">
          <div className="settings-grid">
            <label className="form-label">会社名<input value={settings.companyName} onChange={(e) => update("companyName", e.target.value)} /></label>
            <label className="form-label"><Tip label="締め日">給与計算の対象期間の最終日。</Tip><input value={settings.closingDay} onChange={(e) => update("closingDay", e.target.value)} /></label>
            <label className="form-label"><Tip label="支払日">給与の支給日。</Tip><input value={settings.paymentDay} onChange={(e) => update("paymentDay", e.target.value)} /></label>
            <label className="form-label"><Tip label="社保徴収">社会保険料をいつの給与から天引きするか。</Tip>
              <select value={settings.socialCollection} onChange={(e) => update("socialCollection", e.target.value)}>
                <option value="翌月徴収">翌月徴収</option><option value="当月徴収">当月徴収</option>
              </select>
            </label>
            <label className="form-label"><Tip label="税額計算方法">源泉所得税の算出方法。通常は月額表を使用。</Tip>
              <select value={settings.taxCalcMethod} onChange={(e) => update("taxCalcMethod", e.target.value)}>
                <option value="税額表（月額表）">税額表（月額表）</option><option value="税額表（日額表）">税額表（日額表）</option>
              </select>
            </label>
            <label className="form-label"><Tip label="明細表示月">給与明細を支給日の属する月で表示するか。</Tip>
              <select value={settings.slipDisplayMonth} onChange={(e) => update("slipDisplayMonth", e.target.value)}>
                <option value="支給日が属する月">支給日が属する月</option><option value="締め日が属する月">締め日が属する月</option>
              </select>
            </label>
          </div>
          <label className="settings-toggle" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={settings.showRetiredNextMonth || false} onChange={(e) => update("showRetiredNextMonth", e.target.checked)} />
            退職者の翌月給与を表示する
          </label>
        </Card>

        <Card title="管轄・届出先">
          <div className="settings-grid">
            <label className="form-label"><Tip label="管轄都道府県">社会保険料率が適用される都道府県。</Tip><input value={settings.jurisdiction} onChange={(e) => update("jurisdiction", e.target.value)} /></label>
            <label className="form-label"><Tip label="保険種別">健康保険の加入区分。</Tip>
              <select value={settings.insuranceType} onChange={(e) => update("insuranceType", e.target.value)}>
                <option value="協会管掌事業所">協会管掌事業所</option><option value="組合管掌事業所">組合管掌事業所</option>
              </select>
            </label>
            <label className="form-label">管轄税務署<input value={settings.taxOffice} onChange={(e) => update("taxOffice", e.target.value)} /></label>
            <label className="form-label">税務署コード<input value={settings.taxOfficeCode} onChange={(e) => update("taxOfficeCode", e.target.value)} /></label>
            <label className="form-label">管轄年金事務所<input value={settings.pensionOffice} onChange={(e) => update("pensionOffice", e.target.value)} /></label>
            <label className="form-label">事業所番号<input value={settings.pensionOfficeNumber} onChange={(e) => update("pensionOfficeNumber", e.target.value)} /></label>
            <label className="form-label"><Tip label="整理記号">年金事務所から付与される事業所の識別コード。</Tip><input value={settings.pensionOfficeCode} onChange={(e) => update("pensionOfficeCode", e.target.value)} /></label>
            <label className="form-label"><Tip label="届出提出者">社会保険届出の提出者。</Tip>
              <select value={settings.socialDocSubmitter} onChange={(e) => update("socialDocSubmitter", e.target.value)}>
                <option value="事業主">事業主</option><option value="社労士">社労士</option>
              </select>
            </label>
          </div>
        </Card>
      </>}

      {/* ===== 保険・税タブ ===== */}
      {settingsTab === "insurance" && <>
        <Card title="社会保険料率（%） — 被保険者（本人）負担">
          <div className="settings-grid">
            <label className="form-label"><Tip label="健康保険">協会けんぽの都道府県別料率（折半後）。北海道は5.155%。</Tip><input type="number" step="0.001" value={settings.healthRate} onChange={(e) => updateNum("healthRate", e.target.value)} /></label>
            <label className="form-label"><Tip label="介護保険">40歳〜64歳の被保険者に適用。全国一律。</Tip><input type="number" step="0.001" value={settings.kaigoRate} onChange={(e) => updateNum("kaigoRate", e.target.value)} /></label>
            <label className="form-label"><Tip label="厚生年金">全国一律の料率（折半後）。</Tip><input type="number" step="0.01" value={settings.pensionRate} onChange={(e) => updateNum("pensionRate", e.target.value)} /></label>
            <label className="form-label"><Tip label="雇用保険（本人）">従業員負担分の料率。事業の種類で異なる。</Tip><input type="number" step="0.01" value={settings.employmentRate} onChange={(e) => updateNum("employmentRate", e.target.value)} /></label>
          </div>
        </Card>
        <Card title="社会保険料率（%） — 事業主負担">
          <div className="settings-grid">
            <label className="form-label"><Tip label="健康保険（事業主）">事業主が負担する健康保険料率。通常は本人と同額。</Tip><input type="number" step="0.001" value={settings.healthRateEmployer} onChange={(e) => updateNum("healthRateEmployer", e.target.value)} /></label>
            <label className="form-label"><Tip label="介護保険（事業主）">事業主が負担する介護保険料率。</Tip><input type="number" step="0.001" value={settings.kaigoRateEmployer} onChange={(e) => updateNum("kaigoRateEmployer", e.target.value)} /></label>
            <label className="form-label"><Tip label="厚生年金（事業主）">事業主が負担する厚生年金料率。</Tip><input type="number" step="0.01" value={settings.pensionRateEmployer} onChange={(e) => updateNum("pensionRateEmployer", e.target.value)} /></label>
            <label className="form-label"><Tip label="子ども・子育て拠出金">事業主のみ負担。全国一律の料率。</Tip><input type="number" step="0.01" value={settings.childCareRate} onChange={(e) => updateNum("childCareRate", e.target.value)} /></label>
          </div>
        </Card>
      </>}

      {/* ===== 労働条件タブ ===== */}
      {settingsTab === "labor" && <>
        <Card title="所定労働時間・日数">
          <div className="settings-grid">
            <label className="form-label"><Tip label="1日の所定労働時間">1日あたりの基本労働時間（休憩除く）。法定上限は8時間。</Tip><input type="number" step="0.1" value={settings.prescribedHoursPerDay} onChange={(e) => updateNum("prescribedHoursPerDay", e.target.value)} /></label>
            <label className="form-label"><Tip label="月平均所定労働日数">年間所定労働日数÷12。通常22〜26日。</Tip><input type="number" step="0.1" value={settings.prescribedDaysPerMonth} onChange={(e) => updateNum("prescribedDaysPerMonth", e.target.value)} /></label>
            <label className="form-label"><Tip label="月平均所定労働時間">年間所定労働時間÷12。時間単価の計算に使用。</Tip><input type="number" step="0.1" value={settings.avgMonthlyHoursDefault} onChange={(e) => updateNum("avgMonthlyHoursDefault", e.target.value)} /></label>
          </div>
          <div className="settings-grid" style={{ marginTop: 12 }}>
            <label className="form-label"><Tip label="残業警告ライン">この時間を超えると警告を表示。36協定の上限に注意。</Tip><input type="number" value={settings.overtimeWarningHours} onChange={(e) => updateNum("overtimeWarningHours", e.target.value)} /></label>
            <label className="form-label"><Tip label="残業上限（時間）">36協定の上限時間。超過は法律違反の可能性。</Tip><input type="number" value={settings.overtimeLimitHours} onChange={(e) => updateNum("overtimeLimitHours", e.target.value)} /></label>
          </div>
        </Card>

        <Card title="月別所定労働日数">
          <div className="month-days-grid">
            {monthKeys.map((k, i) => (
              <label key={k}>{monthNames[i]}<input type="number" value={settings.monthlyWorkDays?.[k] ?? ""} onChange={(e) => updateMonthDays(k, e.target.value)} /></label>
            ))}
          </div>
          <div className="settings-summary-bar">
            <span>年間労働日数: <strong>{totalWorkDays}日</strong></span>
            <span>年間休日数: <strong>{totalHolidays}日</strong></span>
          </div>
        </Card>

        <Card title="休日設定">
          <div className="settings-grid-4">
            {dayNames.map(({ key, label }) => (
              <label key={key} className="form-label">{label}
                <select value={settings[key]} onChange={(e) => update(key, e.target.value)}>
                  <option value="平日">平日</option>
                  <option value="法定休日">法定休日</option>
                  <option value="所定休日">所定休日</option>
                </select>
              </label>
            ))}
          </div>
        </Card>

        <Card title="独自休日（年末年始等）">
          {(settings.customHolidays || []).length > 0 && (
            <div className="tag-list" style={{ marginBottom: 8 }}>
              {(settings.customHolidays || []).map((h, idx) => (
                <span key={idx} className="tag-item">
                  {h.date} {h.name}
                  <span className="tag-remove" onClick={() => setSettings((prev) => ({ ...prev, customHolidays: prev.customHolidays.filter((_, i) => i !== idx) }))}>×</span>
                </span>
              ))}
            </div>
          )}
          <div className="settings-add-row">
            <input placeholder="MM-DD" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} style={{ maxWidth: 100 }} />
            <input placeholder="名称（例: 年始休日）" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} />
            <button className="btn btn-outline" onClick={() => {
              if (newHolidayDate && newHolidayName) {
                setSettings((prev) => ({ ...prev, customHolidays: [...(prev.customHolidays || []), { date: newHolidayDate, name: newHolidayName }] }));
                setNewHolidayDate(""); setNewHolidayName("");
              }
            }}>追加</button>
          </div>
        </Card>
      </>}

      {/* ===== 組織・明細タブ ===== */}
      {settingsTab === "org" && <>
        <Card title="部門">
          <div className="tag-list">
            {(settings.departments || []).map((d, i) => (
              <span key={i} className="tag-item">{d}
                <span className="tag-remove" onClick={() => setSettings((prev) => ({ ...prev, departments: prev.departments.filter((_, idx) => idx !== i) }))}>×</span>
              </span>
            ))}
          </div>
          <div className="settings-add-row">
            <input placeholder="新しい部門名" value={newDept} onChange={(e) => setNewDept(e.target.value)} />
            <button className="btn btn-outline" onClick={() => {
              if (newDept.trim()) { setSettings((prev) => ({ ...prev, departments: [...(prev.departments || []), newDept.trim()] })); setNewDept(""); }
            }}>追加</button>
          </div>
        </Card>

        <Card title="職種">
          <div className="tag-list">
            {(settings.jobTypes || []).map((j, i) => (
              <span key={i} className="tag-item">{j}
                <span className="tag-remove" onClick={() => setSettings((prev) => ({ ...prev, jobTypes: prev.jobTypes.filter((_, idx) => idx !== i) }))}>×</span>
              </span>
            ))}
          </div>
          <div className="settings-add-row">
            <input placeholder="新しい職種名" value={newJobType} onChange={(e) => setNewJobType(e.target.value)} />
            <button className="btn btn-outline" onClick={() => {
              if (newJobType.trim()) { setSettings((prev) => ({ ...prev, jobTypes: [...(prev.jobTypes || []), newJobType.trim()] })); setNewJobType(""); }
            }}>追加</button>
          </div>
        </Card>

        <Card title="明細設定">
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>給与明細に表示する項目を選択します。</p>
          <div className="settings-grid">
            <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowAttendance} onChange={(e) => update("slipShowAttendance", e.target.checked)} />勤怠情報を表示</label>
            <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowHourlyRate} onChange={(e) => update("slipShowHourlyRate", e.target.checked)} />時間単価を表示</label>
            <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowDependents} onChange={(e) => update("slipShowDependents", e.target.checked)} />扶養人数を表示</label>
            <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowPeriod} onChange={(e) => update("slipShowPeriod", e.target.checked)} />対象期間を表示</label>
            <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowYtdTotal} onChange={(e) => update("slipShowYtdTotal", e.target.checked)} />累計支給額を表示</label>
            <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowTaxCategory} onChange={(e) => update("slipShowTaxCategory", e.target.checked)} />税区分を表示</label>
            <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowStdMonthly} onChange={(e) => update("slipShowStdMonthly", e.target.checked)} />標準報酬月額を表示</label>
            <label className="settings-toggle"><input type="checkbox" checked={settings.slipShowDept} onChange={(e) => update("slipShowDept", e.target.checked)} />部門を表示</label>
          </div>
        </Card>
      </>}

      {savedAt && <div className="settings-saved-msg">保存しました: {savedAt}</div>}
    </div>
  );
};

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
    () => buildMonthlyChecks(employees, attendance, payrollTargetStatus, hrmosSettings, hrmosUnmatchedRecords),
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
          setPage(["dashboard", "payroll", "history", "employees", "leave", "settings"].includes(saved.page) ? saved.page : "dashboard");
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
          const rateKeys = ["healthRate","healthRateEmployer","kaigoRate","kaigoRateEmployer","pensionRate","pensionRateEmployer","childCareRate","employmentRate"];
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
          setHrmosSettings(saved.hrmosSettings || INITIAL_HRMOS_SETTINGS);
          setHrmosSyncPreview(saved.hrmosSyncPreview || null);
          setHrmosUnmatchedRecords(Array.isArray(saved.hrmosUnmatchedRecords) ? saved.hrmosUnmatchedRecords : []);
          setSyncStatus(saved.syncStatus || "");
          setCalcStatus(saved.calcStatus || "");
          setIsAttendanceDirty(Boolean(saved.isAttendanceDirty));
          setChangeLogs(Array.isArray(saved.changeLogs) ? saved.changeLogs : []);
        }
        if (!cancelled) setSaveStatus("保存済み");
      } catch { if (!cancelled) setSaveStatus("ローカル保存未接続"); }
      finally { if (!cancelled) setIsStateHydrated(true); }
    };
    hydrate();
    return () => { cancelled = true; };
  }, []);

  // Auto-save (debounced 800ms to reduce rapid-fire writes)
  useEffect(() => {
    if (!isStateHydrated) return;
    const timer = setTimeout(async () => {
      try {
        setSaveStatus("保存中");
        const res = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page,
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
            _savedAt: new Date().toISOString(),
          }),
        });
        if (!res.ok) throw new Error("failed");
        setSaveStatus("保存済み");
      } catch { setSaveStatus("保存失敗"); }
    }, 800);
    return () => clearTimeout(timer);
  }, [isStateHydrated, page, employees, attendance, monthlyHistory, monthlySnapshots, paidLeaveBalance, settings, hrmosSettings, hrmosSyncPreview, hrmosUnmatchedRecords, syncStatus, calcStatus, isAttendanceDirty, changeLogs]);

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
      const results = active.map((emp) => ({
        emp,
        result: calcPayroll(emp, att[emp.id] || EMPTY_ATTENDANCE, settings),
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
            monthlyHistory={monthlyHistory} settings={settings} setPage={setPage} />
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
      </main>
    </div>
  );
}
