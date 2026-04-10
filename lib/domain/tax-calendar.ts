export type TaxEvent = {
  month: number;
  day: number;
  label: string;
};

export type UpcomingTaxEvent = TaxEvent & {
  date: Date;
  daysUntil: number;
  isNext: boolean;
};

/**
 * Static list of annual tax filing deadlines in Taiwan.
 * Business tax (營業稅) recurs bimonthly on the 15th of odd months.
 */
export const TAX_EVENTS: TaxEvent[] = [
  { month: 1, day: 15, label: "營業稅" },
  { month: 1, day: 31, label: "各類所得扣繳" },
  { month: 1, day: 31, label: "補充保費" },
  { month: 1, day: 31, label: "股利憑單" },
  { month: 3, day: 15, label: "營業稅" },
  { month: 3, day: 22, label: "執行業務者扣繳憑單" },
  { month: 3, day: 31, label: "公司法22-1" },
  { month: 5, day: 15, label: "營業稅" },
  { month: 5, day: 31, label: "所得稅" },
  { month: 7, day: 15, label: "營業稅" },
  { month: 9, day: 15, label: "營業稅" },
  { month: 9, day: 30, label: "暫繳" },
  { month: 11, day: 15, label: "營業稅" },
];

/**
 * Adjust weekend dates to the next Monday (same logic as RocPeriod).
 */
function adjustWeekendToMonday(date: Date): Date {
  const day = date.getDay();
  if (day === 6) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 2);
  }
  if (day === 0) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  return date;
}

function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffDays(a: Date, b: Date): number {
  return Math.round(
    (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * Get all upcoming tax events sorted by proximity from the reference date.
 * Events whose adjusted deadline has already passed this year are wrapped
 * to next year. The nearest event is marked `isNext: true`.
 */
export function getUpcomingTaxEvents(
  referenceDate: Date = new Date(),
): UpcomingTaxEvent[] {
  const today = toDateOnly(referenceDate);
  const year = today.getFullYear();

  const upcoming: UpcomingTaxEvent[] = TAX_EVENTS.map((event) => {
    let date = adjustWeekendToMonday(
      new Date(year, event.month - 1, event.day),
    );

    // If the deadline has already passed this year, wrap to next year
    if (date < today) {
      date = adjustWeekendToMonday(
        new Date(year + 1, event.month - 1, event.day),
      );
    }

    return {
      ...event,
      date,
      daysUntil: diffDays(date, today),
      isNext: false,
    };
  });

  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (upcoming.length > 0) {
    const nextDate = upcoming[0].date.getTime();
    for (const e of upcoming) {
      if (e.date.getTime() !== nextDate) break;
      e.isNext = true;
    }
  }

  return upcoming;
}
