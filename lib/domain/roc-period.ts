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
    if (!yyymm || yyymm.length < 5) {
      throw new Error("Invalid YYYMM format");
    }
    const rocYear = parseInt(yyymm.slice(0, -2), 10);
    const month = parseInt(yyymm.slice(-2), 10);
    
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
