const MONTH_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const STORAGE_KEY = "snapbooks-coupon";

interface StoredCoupon {
  code: string;
  month: string; // e.g. "2026-04"
}

function currentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function generateCode(): string {
  const month = MONTH_ABBR[new Date().getMonth()];
  return `SNAP1000${month}`;
}

function readStored(): StoredCoupon | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(coupon: StoredCoupon) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(coupon));
  } catch {
    /* noop */
  }
}

export function getCouponCode(): string {
  const monthKey = currentMonthKey();
  const stored = readStored();

  if (stored && stored.month === monthKey && stored.code) {
    return stored.code;
  }

  const code = generateCode();
  writeStored({ code, month: monthKey });
  return code;
}
