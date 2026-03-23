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
