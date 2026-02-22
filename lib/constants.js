export const INITIAL_EMPLOYEES = [
    { id: 1, name: "渡会 流雅", dept: "運送事業", jobType: "トラックドライバー", basicPay: 210000, dutyAllowance: 10000, commuteAllow: 0, avgMonthlyHours: 173.0, stdMonthly: 260000, hasKaigo: false, hasPension: true, hasEmployment: true, dependents: 0, residentTax: 13000, isOfficer: false, status: "在籍", incomeTaxOverride: null },
    { id: 2, name: "渡曾 羊一", dept: "運送事業", jobType: "トラックドライバー", basicPay: 100000, dutyAllowance: 0, commuteAllow: 0, avgMonthlyHours: 89.1, stdMonthly: 104000, hasKaigo: false, hasPension: false, hasEmployment: false, dependents: 0, residentTax: 0, isOfficer: false, status: "在籍", note: "年金受給者・短時間勤務", incomeTaxOverride: null },
    { id: 3, name: "門馬 将太", dept: "運送事業", jobType: "事務経理・労務管理・運行管理", basicPay: 370000, dutyAllowance: 0, commuteAllow: 0, avgMonthlyHours: 173.0, stdMonthly: 380000, hasKaigo: true, hasPension: true, hasEmployment: false, dependents: 0, residentTax: 0, isOfficer: true, status: "在籍", note: "役員（2025年11月〜）", incomeTaxOverride: null },
];

export const INITIAL_ATTENDANCE = {
    1: { workDays: 0, scheduledDays: 0, workHours: 0, scheduledHours: 0, legalOT: 0, prescribedOT: 0, nightOT: 0, holidayOT: 0, otAdjust: 0, basicPayAdjust: 0, otherAllowance: 0 },
    2: { workDays: 0, scheduledDays: 0, workHours: 0, scheduledHours: 0, legalOT: 0, prescribedOT: 0, nightOT: 0, holidayOT: 0, otAdjust: 0, basicPayAdjust: 0, otherAllowance: 0 },
    3: { workDays: 0, scheduledDays: 0, workHours: 0, scheduledHours: 0, legalOT: 0, prescribedOT: 0, nightOT: 0, holidayOT: 0, otAdjust: 0, basicPayAdjust: 0, otherAllowance: 0 },
};

export const INITIAL_MONTHLY_HISTORY = [];

export const INITIAL_PAID_LEAVE_BALANCE = [
    { empId: 1, granted: 10, used: 4.5, carry: 2.0 },
    { empId: 2, granted: 7, used: 1.0, carry: 0.0 },
    { empId: 3, granted: 10, used: 0.0, carry: 0.0 },
];

export const INITIAL_MASTER_SETTINGS = {
    companyName: "きょうしん輸送株式会社",
    closingDay: "末日",
    paymentDay: "翌月20日",
    socialCollection: "翌月徴収",
    showRetiredNextMonth: false,
    jurisdiction: "北海道",
    taxOffice: "岩見沢",
    taxOfficeCode: "000",
    pensionOffice: "岩見沢 年金事務所",
    pensionOfficeNumber: "08714",
    pensionOfficeCode: "51キヨレ",
    insuranceType: "協会管掌事業所",
    socialDocSubmitter: "事業主",
    taxCalcMethod: "税額表（月額表）",
    healthRate: 5.155,
    healthRateEmployer: 5.155,
    kaigoRate: 0.795,
    kaigoRateEmployer: 0.795,
    pensionRate: 9.15,
    pensionRateEmployer: 9.15,
    childCareRate: 0.36,
    employmentRate: 0.55,
    prescribedHoursPerDay: 6.7,
    prescribedDaysPerMonth: 26.0,
    avgMonthlyHoursDefault: 173.0,
    overtimeWarningHours: 45,
    overtimeLimitHours: 80,
    holidayMonday: "平日",
    holidayTuesday: "平日",
    holidayWednesday: "平日",
    holidayThursday: "平日",
    holidayFriday: "平日",
    holidaySaturday: "平日",
    holidaySunday: "法定休日",
    holidayNational: "平日",
    customHolidays: [
        { date: "01-01", name: "年始休日" },
        { date: "01-02", name: "年始休日" },
        { date: "01-03", name: "年始休日" },
        { date: "01-04", name: "年始休日" },
        { date: "01-05", name: "年始休日" },
        { date: "12-30", name: "年末休日" },
        { date: "12-31", name: "年末休日" },
    ],
    monthlyWorkDays: {
        "01": 23, "02": 24, "03": 26, "04": 26, "05": 26,
        "06": 26, "07": 27, "08": 26, "09": 26, "10": 27,
        "11": 25, "12": 25,
    },
    departments: ["全部門", "運送事業", "作業受託事業(混果・箱詰め)"],
    jobTypes: ["トラックドライバー", "農産物選果管理・作業", "農産物選果作業", "事務経理・労務管理・運行管理", "一般事務"],
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

export const INITIAL_HRMOS_SETTINGS = {
    baseUrl: "https://ieyasu.co",
    companyUrl: "",
    apiKey: "",
    clientId: "",
    autoSyncEnabled: true,
    autoCalcEnabled: true,
    autoCalcDay: 1,
};

export const INITIAL_MONTHLY_SNAPSHOTS = {};
