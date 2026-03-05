export class RocPeriod {
  public constructor(
    public readonly rocYear: number,
    public readonly startMonth: number // 1, 3, 5, 7, 9, 11
  ) {
    if (startMonth < 1 || startMonth > 11 || startMonth % 2 === 0) {
      throw new Error("RocPeriod start month must be an odd number between 1 and 11");
    }
  }

  /**
   * The second month of the bi-monthly period.
   */
  get endMonth(): number {
    return this.startMonth + 1;
  }

  /**
   * Gregorian year equivalent (ROC year + 1911).
   */
  get gregorianYear(): number {
    return this.rocYear + 1911;
  }

  /**
   * Returns the "YYYMM" string format (e.g., "11301").
   * Year is padded to 3 digits, month to 2 digits.
   */
  toString(): string {
    return `${this.rocYear.toString().padStart(3, "0")}${this.startMonth
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * Returns the "YYYMM" string format using the end month (e.g., "11302").
   */
  toEndYYYMM(): string {
    return `${this.rocYear.toString().padStart(3, "0")}${this.endMonth
      .toString()
      .padStart(2, "0")}`;
  }

  /**
   * Human readable format, e.g., "民國 113 年 01-02 月".
   */
  format(): string {
    return `民國 ${this.rocYear} 年 ${this.startMonth
      .toString()
      .padStart(2, "0")}-${this.endMonth.toString().padStart(2, "0")} 月`;
  }

  /**
   * Create a RocPeriod from a "YYYMM" string.
   */
  static fromYYYMM(yyymm: string): RocPeriod {
    if (!yyymm || !/^\d{5}$/.test(yyymm)) {
      throw new Error("Invalid YYYMM format: must be a 5-digit string (YYYMM).");
    }
    const rocYear = parseInt(yyymm.substring(0, 3), 10);
    const month = parseInt(yyymm.substring(3, 5), 10);
    // Normalize to bi-monthly starting month (1, 3, 5, 7, 9, 11)
    const startMonth = Math.floor((month - 1) / 2) * 2 + 1;
    
    return new RocPeriod(rocYear, startMonth);
  }

  /**
   * Create a RocPeriod from a Date.
   */
  static fromDate(date: Date): RocPeriod {
    const rocYear = date.getFullYear() - 1911;
    const month = date.getMonth() + 1;
    const startMonth = Math.floor((month - 1) / 2) * 2 + 1;
    return new RocPeriod(rocYear, startMonth);
  }

  /**
   * Current RocPeriod.
   */
  static now(): RocPeriod {
    return RocPeriod.fromDate(new Date());
  }

  /**
   * Current unclosed period based on filing cutoff:
   * every period closes on the 15th of the next odd month.
   *
   * Examples:
   * - Jan-Feb period closes on Mar 15
   * - Nov-Dec period closes on Jan 15 (next year)
   */
  static getCurrentUnclosedPeriod(referenceDate: Date = new Date()): RocPeriod {
    const currentPeriod = RocPeriod.fromDate(referenceDate);
    const previousPeriod = currentPeriod.previousPeriod();
    const referenceDateOnly = RocPeriod.toDateOnly(referenceDate);
    const previousCutoffDateOnly = RocPeriod.toDateOnly(previousPeriod.cutoffDate);

    if (referenceDateOnly.getTime() <= previousCutoffDateOnly.getTime()) {
      return previousPeriod;
    }

    return currentPeriod;
  }

  /**
   * Cutoff date (inclusive) for this period:
   * the 15th of the next odd month.
   */
  get cutoffDate(): Date {
    const cutoffMonth = this.startMonth === 11 ? 1 : this.startMonth + 2;
    const cutoffYear =
      this.startMonth === 11 ? this.gregorianYear + 1 : this.gregorianYear;
    const cutoffDate = new Date(cutoffYear, cutoffMonth - 1, 15);
    return RocPeriod.adjustWeekendCutoffToMonday(cutoffDate);
  }

  /**
   * Previous bi-monthly period.
   */
  previousPeriod(): RocPeriod {
    if (this.startMonth === 1) {
      return new RocPeriod(this.rocYear - 1, 11);
    }
    return new RocPeriod(this.rocYear, this.startMonth - 2);
  }

  private static adjustWeekendCutoffToMonday(cutoffDate: Date): Date {
    const dayOfWeek = cutoffDate.getDay();
    if (dayOfWeek === 6) {
      return new Date(
        cutoffDate.getFullYear(),
        cutoffDate.getMonth(),
        cutoffDate.getDate() + 2
      );
    }
    if (dayOfWeek === 0) {
      return new Date(
        cutoffDate.getFullYear(),
        cutoffDate.getMonth(),
        cutoffDate.getDate() + 1
      );
    }
    return cutoffDate;
  }

  private static toDateOnly(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  /**
   * Get all 6 periods for a given ROC year.
   */
  static getPeriodsForYear(rocYear: number): RocPeriod[] {
    return [1, 3, 5, 7, 9, 11].map((m) => new RocPeriod(rocYear, m));
  }

  /**
   * Equality check.
   */
  equals(other: RocPeriod): boolean {
    return this.rocYear === other.rocYear && this.startMonth === other.startMonth;
  }
}
