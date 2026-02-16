// ===== 検証済み給与計算ロジック =====
// MF給与と完全一致を確認済み（2025-11/12支給分、渡会・渡曾・門馬の全項目）

const ceil = (v) => Math.ceil(v);
const insRound = (v) => (v - Math.floor(v) > 0.5 ? Math.ceil(v) : Math.floor(v));

export const DEFAULT_RATES = {
  health: 5.155 / 100,
  kaigo: 0.795 / 100,
  pension: 9.15 / 100,
  employment: 0.55 / 100,
};

export const buildRates = (settings) => {
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

export const calcOvertime = (hourlyRate, hours, multiplier) =>
  hours > 0 ? ceil(hourlyRate * hours * multiplier) : 0;

export const calcPayroll = (emp, att, settings) => {
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
export const TAX_TABLE_R8 = [
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

export const estimateTax = (taxable, deps) => {
  if (taxable <= 0) return 0;
  let baseTax = 0;
  if (taxable < 105000) {
    baseTax = 0;
  } else if (taxable < 740000) {
    for (const [threshold, amount] of TAX_TABLE_R8) {
      if (taxable < threshold) { baseTax = amount; break; }
    }
  } else {
    // 740,000円以上: 電算機計算の特例（令和8年分）
    let incDed;
    if (taxable <= 158333) incDed = 54167;
    else if (taxable <= 299999) incDed = taxable * 0.30 + 6667;
    else if (taxable <= 549999) incDed = taxable * 0.20 + 36667;
    else if (taxable <= 708330) incDed = taxable * 0.10 + 91667;
    else incDed = 162500;
    incDed = Math.ceil(incDed);
    const basicDed = taxable <= 2120833 ? 48334 : taxable <= 2162499 ? 40000 : taxable <= 2204166 ? 26667 : taxable <= 2245833 ? 13334 : 0;
    const depDed = deps * 31667;
    const B = Math.max(0, Math.floor(taxable - incDed - basicDed - depDed));
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
  const depReduction = deps * 1610;
  return Math.max(0, baseTax - depReduction);
};

// ===== 標準報酬月額 等級表（令和2年9月〜） =====
export const STD_MONTHLY_GRADES = [
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

export const findGradeByStdMonthly = (stdMonthly) => {
  const val = Number(stdMonthly);
  if (!val) return null;
  return STD_MONTHLY_GRADES.find((g) => g.stdMonthly === val) || null;
};

export const findGradeByPay = (pay) => {
  const val = Number(pay);
  if (!val) return null;
  return STD_MONTHLY_GRADES.find((g) => val >= g.lowerBound && val < g.upperBound) || null;
};
