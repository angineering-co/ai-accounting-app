export type BillingCycle = "annual" | "monthly";

export const PRICES: Record<BillingCycle, number> = {
  annual: 1200,
  monthly: 1400,
};

export const REGISTRATION_PRICING_NOTE =
  "商行 NT$6,500 / 有限公司 NT$8,500 / 股份有限公司 NT$9,500";
