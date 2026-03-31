export type YearKey = "114" | "115";
export type EmpCount = "zero" | "under5" | "over5";
export type EmployeeStatus = "employee" | "employer" | "foreign" | "retired";

interface YearConfig {
  yearName: string;
  minWage: number;
  levelsLabor: number[];
  levelsPension: number[];
  levelsHealth: number[];
}

export interface InsuranceResult {
  healthEmployee: number;
  healthCompany: number;
  laborEmployee: number;
  laborCompany: number;
  pensionCompany: number;
  occupationalCompany: number;
  healthLevel: string;
  laborLevel: string;
  pensionLevel: string;
  grandTotal: number;
  takeHome: number;
}

const DATA: Record<YearKey, YearConfig> = {
  "114": {
    yearName: "114年 (2025)",
    minWage: 28590,
    levelsLabor: [
      28590, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900,
      45800,
    ],
    levelsPension: [
      28590, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900,
      45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800,
      72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100,
      115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000,
    ],
    levelsHealth: [
      28590, 28800, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000,
      43900, 45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800,
      69800, 72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600,
      110100, 115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000,
      156400, 162800, 169200, 175600, 182000, 189500, 197000, 204500, 212000,
      219500, 228200, 236900, 245600, 254300, 263000, 273000, 283000, 293000,
      303000, 313000,
    ],
  },
  "115": {
    yearName: "115年 (2026)",
    minWage: 29500,
    levelsLabor: [
      29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900,
      45800,
    ],
    levelsPension: [
      29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900,
      45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800,
      72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100,
      115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000,
    ],
    levelsHealth: [
      29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900,
      45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800,
      72800, 76500, 80200, 83900, 87600, 92100, 96600, 101100, 105600, 110100,
      115500, 120900, 126300, 131700, 137100, 142500, 147900, 150000, 156400,
      162800, 169200, 175600, 182000, 189500, 197000, 204500, 212000, 219500,
      228200, 236900, 245600, 254300, 263000, 273000, 283000, 293000, 303000,
      313000,
    ],
  },
};

export function getEffectiveWage(salary: number, table: number[]): number {
  if (!salary || salary < table[0]) return table[0];
  for (const level of table) {
    if (salary <= level) return level;
  }
  return table[table.length - 1];
}

function getEmployerHealthFloor(year: YearKey, empCount: EmpCount): number {
  if (year === "114") {
    if (empCount === "zero") return 36300;
    if (empCount === "under5") return 40100;
    return 45800;
  }
  // 115
  if (empCount === "zero") return 36300;
  if (empCount === "under5") return 42000;
  return 45800;
}

export function fmt(num: number): string {
  return Math.round(num).toLocaleString();
}

export function calculate(params: {
  year: YearKey;
  salary: number;
  status: EmployeeStatus;
  empCount: EmpCount;
  laborOn: boolean;
}): InsuranceResult {
  const { year, salary, status, empCount, laborOn } = params;
  const config = DATA[year];

  let healthEmployee = 0;
  let healthCompany = 0;
  let laborEmployee = 0;
  let laborCompany = 0;
  let pensionCompany = 0;
  let occupationalCompany = 0;

  // Health insurance (5.17%)
  let healthSalary = salary;
  if (status === "employer") {
    const floor = getEmployerHealthFloor(year, empCount);
    healthSalary = Math.max(salary, floor);
  }

  const hWage = getEffectiveWage(healthSalary, config.levelsHealth);
  const healthLevel = fmt(hWage);

  if (status === "employer") {
    healthCompany = hWage * 0.0517;
    healthEmployee = 0;
  } else {
    healthEmployee = hWage * 0.0517 * 0.3;
    healthCompany = hWage * 0.0517 * 0.6 * 1.56;
  }

  // Labor & Pension & Occupational accident
  const lWage = getEffectiveWage(salary, config.levelsLabor);
  const pWage = getEffectiveWage(salary, config.levelsPension);
  const laborLevel = laborOn ? fmt(lWage) : "不投保";
  const pensionLevel = fmt(pWage);

  if (empCount !== "zero") {
    pensionCompany = pWage * 0.06;
    occupationalCompany = lWage * 0.0011;
  }
  if (status === "foreign") pensionCompany = 0;

  if (laborOn) {
    const laborRate =
      status === "employer" || status === "foreign" ? 0.115 : 0.125;
    if (status === "retired") {
      laborEmployee = 0;
      laborCompany = 0;
    } else if (status === "employer") {
      laborCompany = lWage * laborRate * 0.9;
      laborEmployee = 0;
    } else {
      laborEmployee = lWage * laborRate * 0.2;
      laborCompany = lWage * laborRate * 0.7;
    }
  }

  const grandTotal =
    salary +
    healthCompany +
    laborCompany +
    pensionCompany +
    occupationalCompany;
  const takeHome = salary - healthEmployee - laborEmployee;

  return {
    healthEmployee,
    healthCompany,
    laborEmployee,
    laborCompany,
    pensionCompany,
    occupationalCompany,
    healthLevel,
    laborLevel,
    pensionLevel,
    grandTotal,
    takeHome,
  };
}

export function getConclusion(
  empCount: EmpCount,
  healthLevel: string,
  year: YearKey,
): string {
  if (empCount === "zero") {
    return `雇主必須於本公司成立健保單位，且負責人最低投保薪資為 ${healthLevel} 元 (${year}級距)，負擔全額自付。`;
  }
  if (empCount === "under5") {
    return `公司非勞保強制單位，但負責人健保底薪為 ${healthLevel} 元。員工勞保可投於工會，但 6% 勞退與職災仍需由雇主負擔。`;
  }
  return `僱用 5 人以上強制投保，負責人健保底薪為 ${healthLevel} 元。勞健保負擔依法計算。`;
}
