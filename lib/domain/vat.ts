// VAT (營業稅) constants and the embedded-tax helper shared by report generation
// (lib/services/reports.ts) and journal-entry generation
// (lib/services/journal-entry-generation.ts).
//
// B2C 二聯式 / 電子發票 (買受人為非營業人) and certain 進項憑證 (二聯式收銀機、
// 火車/高鐵票根 等) carry a *tax-inclusive* total — the 5% 營業稅 is embedded in
// the printed amount and OCR extracts `tax = 0`. Both the TET_U filing and the
// journal entry must back it out the same way, so the formula lives in one place.

export const VAT_RATE = 0.05; // 徵收率

// 內含稅額 = 含稅總額 ×（徵收率 ÷（1 + 徵收率））（四捨五入）
export function embeddedTax(grossInclusive: number): number {
  return Math.round(grossInclusive * (VAT_RATE / (1 + VAT_RATE)));
}

// Split a tax-inclusive gross into its net (銷售額/進項金額) and embedded tax.
export function splitEmbeddedTax(grossInclusive: number): { net: number; tax: number } {
  const tax = embeddedTax(grossInclusive);
  return { net: grossInclusive - tax, tax };
}
