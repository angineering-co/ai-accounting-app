// ---------------------------------------------------------------------------
// Withholding-tax calculation logic for Taiwan 扣繳計算機
// Covers: 執行業務所得 (9A / 9B / 92) and 租金
// ---------------------------------------------------------------------------

// ── Types ──────────────────────────────────────────────────────────────────

export type Nationality = "domestic" | "foreign_resident" | "foreign_non_resident";
export type IncomeCategory = "9A" | "9B" | "92";
export type LandlordType = "individual" | "company";

export interface Profession {
  code: string;
  label: string;
  expenseRate: number; // 0–1
}

export interface LaborInput {
  nationality: Nationality;
  healthInsuranceExempt: boolean;
  incomeCategory: IncomeCategory;
  professionCode: string; // used to look up expense rate for 9A
  amount: number;
  isNetAmount: boolean; // true → reverse-calculate gross from net
}

export interface LaborResult {
  grossAmount: number;
  withholdingRate: number;
  withholdingTax: number;
  healthInsuranceRate: number;
  healthInsurance: number;
  netAmount: number;
  expenseRate: number;
  incomeCategoryLabel: string;
  professionLabel: string;
}

export interface RentInput {
  landlordType: LandlordType;
  amount: number;
  isTaxInclusive: boolean; // true → amount includes tax, reverse-calculate
}

export interface RentResult {
  grossRent: number;
  withholdingRate: number;
  withholdingTax: number;
  healthInsuranceRate: number;
  healthInsurance: number;
  netAmount: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const WITHHOLDING_THRESHOLD = 20_000; // > this → withholding applies (domestic)
export const HEALTH_INSURANCE_THRESHOLD = 20_000; // >= this → health insurance applies
export const DOMESTIC_WITHHOLDING_RATE = 0.1;
export const NON_RESIDENT_WITHHOLDING_RATE = 0.2;
export const HEALTH_INSURANCE_RATE = 0.0211;

// ── 9A Profession list ─────────────────────────────────────────────────────

export const PROFESSIONS_9A: Profession[] = [
  { code: "10", label: "律師", expenseRate: 0.3 },
  { code: "11", label: "會計師", expenseRate: 0.3 },
  { code: "12", label: "精算師", expenseRate: 0.2 },
  { code: "13", label: "地政士", expenseRate: 0.3 },
  { code: "14", label: "記帳士", expenseRate: 0.35 },
  { code: "15", label: "仲裁人", expenseRate: 0.15 },
  { code: "16", label: "民間公證人", expenseRate: 0.3 },
  { code: "17", label: "不動產估價師", expenseRate: 0.35 },
  { code: "18", label: "受委託代辦國有非公用不動產之承租、續租、過戶及繼承等申請者", expenseRate: 0.3 },
  { code: "19", label: "記帳及報稅代理人", expenseRate: 0.35 },
  { code: "20", label: "技師", expenseRate: 0.35 },
  { code: "21", label: "建築師", expenseRate: 0.35 },
  { code: "22", label: "公共安全檢查人員", expenseRate: 0.35 },
  { code: "23", label: "未具會計師、記帳士、記帳及報稅代理人資格，辦理工商登記等業務或代為記帳者", expenseRate: 0.35 },
  { code: "24", label: "工匠(工資收入)", expenseRate: 0.2 },
  { code: "25", label: "工匠(工料收入)", expenseRate: 0.62 },
  { code: "26", label: "引水人", expenseRate: 0.25 },
  { code: "27", label: "配合政府政策辦理法律扶助案件及法院指定義務辯護案件", expenseRate: 0.5 },
  { code: "28", label: "美術工藝家(工資收入)", expenseRate: 0.2 },
  { code: "29", label: "美術工藝家(工料收入)", expenseRate: 0.62 },
  { code: "30", label: "內科醫師", expenseRate: 0.4 },
  { code: "31", label: "外科醫師", expenseRate: 0.45 },
  { code: "32", label: "小兒科醫師", expenseRate: 0.4 },
  { code: "33", label: "婦產科醫師", expenseRate: 0.45 },
  { code: "34", label: "眼科醫師", expenseRate: 0.4 },
  { code: "35", label: "耳鼻喉科醫師", expenseRate: 0.4 },
  { code: "36", label: "牙科醫師", expenseRate: 0.4 },
  { code: "37", label: "精神科醫師", expenseRate: 0.46 },
  { code: "38", label: "骨科醫師", expenseRate: 0.45 },
  { code: "39", label: "其他科別醫師", expenseRate: 0.43 },
  { code: "40", label: "助產師(士)", expenseRate: 0.31 },
  { code: "41", label: "藥師", expenseRate: 0.2 },
  { code: "42", label: "醫事檢驗師(生)", expenseRate: 0.43 },
  { code: "45", label: "營養師", expenseRate: 0.2 },
  { code: "46", label: "醫師經核准至他醫療機構服務(非僱傭)", expenseRate: 0.1 },
  { code: "47", label: "獸醫師", expenseRate: 0.32 },
  { code: "48", label: "皮膚科醫師", expenseRate: 0.4 },
  { code: "49", label: "家庭醫學科醫師", expenseRate: 0.4 },
  { code: "50", label: "中醫師", expenseRate: 0.2 },
  { code: "51", label: "語言治療師", expenseRate: 0.2 },
  { code: "52", label: "人壽保險醫療檢查", expenseRate: 0.35 },
  { code: "53", label: "物理治療師", expenseRate: 0.43 },
  { code: "54", label: "職能治療師", expenseRate: 0.43 },
  { code: "55", label: "心理師", expenseRate: 0.2 },
  { code: "56", label: "牙體技術師(生)", expenseRate: 0.4 },
  { code: "57", label: "政策補助(老人、兒童、身心障礙者等)", expenseRate: 0.78 },
  { code: "58", label: "自費疫苗注射收入", expenseRate: 0.78 },
  { code: "61", label: "書畫家、版畫家", expenseRate: 0.3 },
  { code: "62", label: "命理卜卦", expenseRate: 0.2 },
  { code: "70", label: "表演人", expenseRate: 0.45 },
  { code: "71", label: "保險經紀人", expenseRate: 0.26 },
  { code: "72", label: "節目製作人", expenseRate: 0.45 },
  { code: "73", label: "公益彩券立即型彩券經銷商", expenseRate: 0.6 },
  { code: "76", label: "一般經紀人", expenseRate: 0.2 },
  { code: "80", label: "民營汽車駕駛人訓練機構", expenseRate: 0.65 },
  { code: "81", label: "文理類補習班", expenseRate: 0.5 },
  { code: "82", label: "技藝類補習班", expenseRate: 0.5 },
  { code: "84", label: "私立托嬰中心、幼兒園", expenseRate: 0.8 },
  { code: "86", label: "兒童課後照顧服務中心", expenseRate: 0.6 },
  { code: "87", label: "私立養護、療養院所", expenseRate: 0.78 },
  { code: "90", label: "其他", expenseRate: 0 },
  { code: "91", label: "商標代理人", expenseRate: 0.3 },
  { code: "92", label: "程式設計師", expenseRate: 0.2 },
  { code: "93", label: "專利師及專利代理人", expenseRate: 0.3 },
  { code: "94", label: "未具律師資格，辦理訴訟代理人業務", expenseRate: 0.23 },
  { code: "95", label: "未具建築師資格，辦理建築規劃設計及監造等業務者", expenseRate: 0.35 },
  { code: "96", label: "未具地政士資格，辦理土地登記等業務者", expenseRate: 0.3 },
  { code: "97", label: "受大陸地區人民委託辦理繼承、公法給付或其他事務者", expenseRate: 0.23 },
  { code: "98", label: "著作人：非自行出版", expenseRate: 0.3 },
  { code: "99", label: "著作人：自行出版", expenseRate: 0.75 },
];

// ── Labels & formatting ────────────────────────────────────────────────────

const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  "9A": "9A執行業務所得",
  "9B": "9B稿費",
  "92": "92其他所得",
};

export function getIncomeCategoryLabel(cat: IncomeCategory): string {
  return INCOME_CATEGORY_LABELS[cat];
}

const NATIONALITY_LABELS: Record<Nationality, string> = {
  domestic: "本國人",
  foreign_resident: "居住者(待滿183天)",
  foreign_non_resident: "非居住者(未待滿183天)",
};

export function getNationalityLabel(n: Nationality): string {
  return NATIONALITY_LABELS[n];
}

export function fmtCurrency(n: number): string {
  return n.toLocaleString("zh-TW");
}

export function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function getProfessions(category: IncomeCategory): Profession[] {
  if (category === "9A") return PROFESSIONS_9A;
  if (category === "9B") {
    return [
      { code: "98", label: "非自行出版", expenseRate: 0.3 },
      { code: "99", label: "自行出版", expenseRate: 0.75 },
    ];
  }
  // 92 — no sub-professions
  return [{ code: "00", label: "其他所得", expenseRate: 0 }];
}

// ── Core calculation helpers ───────────────────────────────────────────────

function getWithholdingRate(nationality: Nationality): number {
  return nationality === "foreign_non_resident"
    ? NON_RESIDENT_WITHHOLDING_RATE
    : DOMESTIC_WITHHOLDING_RATE;
}

function hasThreshold(nationality: Nationality): boolean {
  return nationality !== "foreign_non_resident";
}

function computeDeductions(
  gross: number,
  withholdingRate: number,
  applyThreshold: boolean,
  healthExempt: boolean,
): { withholdingTax: number; healthInsurance: number } {
  const withholdingTax =
    applyThreshold && gross <= WITHHOLDING_THRESHOLD
      ? 0
      : Math.floor(gross * withholdingRate);

  const healthInsurance =
    healthExempt || gross < HEALTH_INSURANCE_THRESHOLD
      ? 0
      : Math.floor(gross * HEALTH_INSURANCE_RATE);

  return { withholdingTax, healthInsurance };
}

/**
 * Reverse-calculate gross from net amount.
 * For domestic/resident: need to handle threshold edge cases.
 */
function reverseGross(
  net: number,
  withholdingRate: number,
  applyThreshold: boolean,
  healthExempt: boolean,
): number {
  if (net <= 0) return 0;

  const healthRate = healthExempt ? 0 : HEALTH_INSURANCE_RATE;

  if (!applyThreshold) {
    // Non-resident: always deduct — scan window to handle floor rounding
    const est = Math.ceil(net / (1 - withholdingRate - healthRate));
    for (let g = est - 10; g <= est + 10; g++) {
      if (g <= 0) continue;
      const t = Math.floor(g * withholdingRate);
      const h = healthExempt ? 0 : Math.floor(g * healthRate);
      if (g - t - h === net) return g;
    }
    return est;
  }

  // Domestic: check from simplest case first

  // 1. Below health threshold → no deductions at all
  if (net < HEALTH_INSURANCE_THRESHOLD) {
    return net;
  }

  // 2. Try assuming gross is in the health-only zone (>= health threshold, <= withholding threshold)
  if (!healthExempt) {
    const grossHealthOnly = Math.ceil(net / (1 - healthRate));
    if (
      grossHealthOnly >= HEALTH_INSURANCE_THRESHOLD &&
      grossHealthOnly <= WITHHOLDING_THRESHOLD
    ) {
      return grossHealthOnly;
    }
  }

  // 3. Try assuming gross > withholding threshold (both deductions apply)
  // Math.floor rounding on two terms can shift the result by up to 2,
  // so scan a window around the estimate to find the exact match.
  const estimate = Math.ceil(net / (1 - withholdingRate - healthRate));
  for (let g = estimate - 10; g <= estimate + 10; g++) {
    if (g > WITHHOLDING_THRESHOLD) {
      const t = Math.floor(g * withholdingRate);
      const h = healthExempt ? 0 : Math.floor(g * HEALTH_INSURANCE_RATE);
      if (g - t - h === net) return g;
    }
  }

  // Fallback
  return net;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function calculateLabor(input: LaborInput): LaborResult {
  const professions = getProfessions(input.incomeCategory);
  const profession =
    professions.find((p) => p.code === input.professionCode) ?? professions[0];
  const expenseRate = profession.expenseRate;

  // 92 其他所得: 本國人及居住者免扣繳、免補充保費；非居住者照常扣繳
  const isOtherIncomeExempt =
    input.incomeCategory === "92" && input.nationality !== "foreign_non_resident";

  const wRate = isOtherIncomeExempt ? 0 : getWithholdingRate(input.nationality);
  const applyThreshold = isOtherIncomeExempt ? false : hasThreshold(input.nationality);
  // 非居住者非健保投保對象，不扣補充保費
  const healthExempt =
    isOtherIncomeExempt ||
    input.healthInsuranceExempt ||
    input.nationality === "foreign_non_resident";

  const gross = input.isNetAmount
    ? reverseGross(input.amount, wRate, applyThreshold, healthExempt)
    : input.amount;

  const { withholdingTax, healthInsurance } = computeDeductions(
    gross,
    wRate,
    applyThreshold,
    healthExempt,
  );

  return {
    grossAmount: gross,
    withholdingRate: gross > 0 && withholdingTax > 0 ? wRate : 0,
    withholdingTax,
    healthInsuranceRate: gross > 0 && healthInsurance > 0 ? HEALTH_INSURANCE_RATE : 0,
    healthInsurance,
    netAmount: gross - withholdingTax - healthInsurance,
    expenseRate,
    incomeCategoryLabel: getIncomeCategoryLabel(input.incomeCategory),
    professionLabel: `${profession.code}.${profession.label}`,
  };
}

export function calculateRent(input: RentInput): RentResult {
  if (input.landlordType === "company") {
    const gross = input.amount;
    return {
      grossRent: gross,
      withholdingRate: 0,
      withholdingTax: 0,
      healthInsuranceRate: 0,
      healthInsurance: 0,
      netAmount: gross,
    };
  }

  // 個人: same rules as domestic labor
  const wRate = DOMESTIC_WITHHOLDING_RATE;

  // 含稅: amount is the gross rent (includes tax), forward calc
  // 未含稅: amount is what the landlord wants to receive (net), reverse calc
  const gross = input.isTaxInclusive
    ? input.amount
    : reverseGross(input.amount, wRate, true, false);

  const { withholdingTax, healthInsurance } = computeDeductions(
    gross,
    wRate,
    true,
    false,
  );

  return {
    grossRent: gross,
    withholdingRate: gross > 0 && withholdingTax > 0 ? wRate : 0,
    withholdingTax,
    healthInsuranceRate: gross > 0 && healthInsurance > 0 ? HEALTH_INSURANCE_RATE : 0,
    healthInsurance,
    netAmount: gross - withholdingTax - healthInsurance,
  };
}
