/**
 * Format code utilities for allowances
 * 
 * Format codes for allowances:
 * - 23: 進項折讓 (三聯式/電子發票)
 * - 24: 進項折讓 (二聯式)
 * - 33: 銷項折讓 (三聯式/電子發票)
 * - 34: 銷項折讓 (二聯式)
 */

export type AllowanceType = '三聯式折讓' | '電子發票折讓' | '二聯式折讓';

/**
 * Derive the format code from in_or_out and allowanceType.
 * The format code is used in TXT report generation.
 */
export function getAllowanceFormatCode(
  inOrOut: 'in' | 'out',
  allowanceType: AllowanceType | string
): string {
  const isTriplicateFamily =
    allowanceType === '三聯式折讓' ||
    allowanceType === '電子發票折讓';

  if (inOrOut === 'out') {
    return isTriplicateFamily ? '33' : '34';
  } else {
    return isTriplicateFamily ? '23' : '24';
  }
}

/**
 * Check if a format code is an allowance format code.
 */
export function isAllowanceFormatCode(formatCode: string): boolean {
  return ['23', '24', '33', '34'].includes(formatCode);
}

/**
 * Reverse mapping for Excel imports.
 * Given a format code, returns the in_or_out and allowanceType.
 */
export const ALLOWANCE_FORMAT_CODE_MAP: Record<string, {
  inOrOut: 'in' | 'out';
  allowanceType: AllowanceType;
}> = {
  '23': { inOrOut: 'in', allowanceType: '電子發票折讓' },
  '24': { inOrOut: 'in', allowanceType: '二聯式折讓' },
  '33': { inOrOut: 'out', allowanceType: '電子發票折讓' },
  '34': { inOrOut: 'out', allowanceType: '二聯式折讓' },
};
