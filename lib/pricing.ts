export type BillingCycle = "annual" | "monthly";

export const PRICES: Record<BillingCycle, number> = {
  annual: 1260,
  monthly: 1470,
};

export const LINE_URL = "https://lin.ee/nPVmG3M";

export const REGISTRATION_PRICING_NOTE =
  "商行 NT$6,500 / 有限公司 NT$8,500 / 股份有限公司 NT$9,500";

// First-year revenue per lead path, used as the conversion value sent to
// Google Ads and Meta for bid optimization. Tune as real LTV data accumulates.
//   registration: 商行 setup (NT$6,500) + first-year annual bookkeeping (12 × NT$1,260)
//   bookkeeping:  first-year annual bookkeeping (12 × NT$1,260)
export const APPLY_CONVERSION_VALUE_TWD = {
  registration: 6500 + PRICES.annual * 12,
  bookkeeping: PRICES.annual * 12,
} as const;
