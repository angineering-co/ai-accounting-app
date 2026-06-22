const WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1] as const;

/**
 * Validates a Taiwan Unified Business Number (統一編號) using the
 * Ministry of Finance checksum algorithm.
 *
 * Algorithm: multiply each digit by its weight, sum the tens and ones
 * digits of each product, then check if the total is divisible by 5.
 * Special case: when digit at position 6 is 7 (7×4=28, 2+8=10),
 * also accept (sum + 1) % 5 === 0.
 */
export function isValidUBN(taxId: string): boolean {
  if (!/^\d{8}$/.test(taxId)) return false;

  const digits = taxId.split("").map(Number);

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const product = digits[i] * WEIGHTS[i];
    sum += Math.floor(product / 10) + (product % 10);
  }

  if (sum % 5 === 0) return true;

  // Special case: digit at position 6 is 7 (7*4=28, 2+8=10)
  if (digits[6] === 7 && (sum + 1) % 5 === 0) return true;

  return false;
}

/**
 * Whether an invoice's buyer is a business (B2B) rather than a consumer (B2C).
 *
 * A buyer is B2B iff it carries a valid 統一編號. Everything else is B2C:
 * null/empty, the 10-zero placeholder ("0000000000") that B2C invoices print
 * for the buyer, carrier codes, and OCR noise. B2C invoices are tax-inclusive,
 * so this is the discriminator both report generation and journal-entry
 * generation use to decide whether to back out the embedded 營業稅.
 */
export function isBusinessBuyer(buyerTaxId: string | null | undefined): boolean {
  return buyerTaxId != null && isValidUBN(buyerTaxId);
}
