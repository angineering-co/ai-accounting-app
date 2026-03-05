import { describe, it, expect } from 'vitest';
import { RocPeriod } from './roc-period';

describe('RocPeriod', () => {
  it('should roundtrip fromYYYMM and toString for current period', () => {
    const now = RocPeriod.now();
    const roundtripped = RocPeriod.fromYYYMM(now.toString());
    expect(roundtripped.equals(now)).toBe(true);
    expect(roundtripped.toString()).toBe(now.toString());
  });

  it('should roundtrip for all periods in a year', () => {
    const year = 113;
    const periods = RocPeriod.getPeriodsForYear(year);
    for (const period of periods) {
      const s = period.toString();
      const roundtripped = RocPeriod.fromYYYMM(s);
      expect(roundtripped.equals(period)).toBe(true);
      expect(roundtripped.toString()).toBe(s);
    }
  });

  it('should normalize even months to the start of the period', () => {
    const p1 = RocPeriod.fromYYYMM("11301");
    const p2 = RocPeriod.fromYYYMM("11302");
    expect(p1.equals(p2)).toBe(true);
    expect(p2.startMonth).toBe(1);
    expect(p2.endMonth).toBe(2);
  });

  it('should handle padding for 2-digit years correctly', () => {
    // Note: RocPeriod.fromYYYMM uses slice(0, -2) for year, 
    // so it handles any number of digits as long as there are at least 5 characters total (3 year + 2 month).
    // Actually the current implementation of fromYYYMM:
    // const rocYear = parseInt(yyymm.slice(0, -2), 10);
    // const month = parseInt(yyymm.slice(-2), 10);
    // If yyymm is "9901", yyymm.length is 4.
    // The check "if (!yyymm || yyymm.length < 5)" would throw.
    // Let's verify if we need to support older years or if 3-digit year is mandatory.
    // ROC 99 is year 2010.
    
    const p = new RocPeriod(99, 1);
    const s = p.toString(); // "09901" due to padStart(3, "0")
    expect(s).toBe("09901");
    const roundtripped = RocPeriod.fromYYYMM(s);
    expect(roundtripped.equals(p)).toBe(true);
  });

  it("should return previous period during odd-month cutoff window", () => {
    // 2025-03-15 is Saturday, so cutoff moves to Monday 2025-03-17 (inclusive).
    const withinCutoff = new Date(2025, 2, 17);
    expect(RocPeriod.getCurrentUnclosedPeriod(withinCutoff).toString()).toBe("11401");
  });

  it("should roll to current period after odd-month cutoff day", () => {
    // The day after shifted cutoff (2025-03-18), Mar-Apr becomes current.
    const afterCutoff = new Date(2025, 2, 18);
    expect(RocPeriod.getCurrentUnclosedPeriod(afterCutoff).toString()).toBe("11403");
  });

  it("should handle Jan cutoff with previous year Nov-Dec period", () => {
    const janBeforeCutoff = new Date(2025, 0, 10); // 2025-01-10
    const janOnCutoff = new Date(2025, 0, 15); // 2025-01-15 (Wednesday)
    const janAfterCutoff = new Date(2025, 0, 16); // 2025-01-16 (Thursday)

    expect(RocPeriod.getCurrentUnclosedPeriod(janBeforeCutoff).toString()).toBe("11311");
    expect(RocPeriod.getCurrentUnclosedPeriod(janOnCutoff).toString()).toBe("11311");
    expect(RocPeriod.getCurrentUnclosedPeriod(janAfterCutoff).toString()).toBe("11401");
  });

  it("should compute cutoff date as next odd month day 15", () => {
    const janFeb = new RocPeriod(114, 1);
    const novDec = new RocPeriod(114, 11);

    // 2025-03-15 is Saturday, shifted to Monday 2025-03-17.
    expect(janFeb.cutoffDate).toEqual(new Date(2025, 2, 17));
    expect(novDec.cutoffDate).toEqual(new Date(2026, 0, 15));
  });

  it("should shift weekend cutoff to next Monday", () => {
    const sepOct = new RocPeriod(114, 9);
    // 2025-11-15 is Saturday, shifted to Monday 2025-11-17.
    expect(sepOct.cutoffDate).toEqual(new Date(2025, 10, 17));
    expect(RocPeriod.getCurrentUnclosedPeriod(new Date(2025, 10, 17)).toString()).toBe("11409");
    expect(RocPeriod.getCurrentUnclosedPeriod(new Date(2025, 10, 18)).toString()).toBe("11411");
  });
});
