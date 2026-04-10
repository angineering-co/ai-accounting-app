import { describe, expect, it } from "vitest";
import { getUpcomingTaxEvents, TAX_EVENTS } from "./tax-calendar";

describe("getUpcomingTaxEvents", () => {
  it("returns all events with the nearest one marked isNext", () => {
    // April 10 2026 — next event should be May 15 營業稅
    const ref = new Date(2026, 3, 10); // month is 0-indexed
    const events = getUpcomingTaxEvents(ref);

    expect(events.length).toBe(TAX_EVENTS.length);
    expect(events.filter((e) => e.isNext)).toHaveLength(1);

    const next = events[0];
    expect(next.isNext).toBe(true);
    expect(next.label).toBe("營業稅");
    expect(next.date.getMonth()).toBe(4); // May
    expect(next.date.getDate()).toBe(15);
    expect(next.daysUntil).toBe(35);
  });

  it("sorts events chronologically from the reference date", () => {
    const ref = new Date(2026, 3, 10);
    const events = getUpcomingTaxEvents(ref);

    for (let i = 1; i < events.length; i++) {
      expect(events[i].date.getTime()).toBeGreaterThanOrEqual(
        events[i - 1].date.getTime(),
      );
    }
  });

  it("wraps past events to next year", () => {
    // Dec 1 2026 — Jan 15 營業稅 should wrap to 2027
    const ref = new Date(2026, 11, 1);
    const events = getUpcomingTaxEvents(ref);

    const next = events[0];
    expect(next.isNext).toBe(true);
    expect(next.date.getFullYear()).toBeGreaterThanOrEqual(2026);
    // The nearest should be Nov 15 or later in 2026, or Jan next year
    // Nov 15 2026 is before Dec 1, so it should wrap. Next is Jan 15 2027.
    expect(next.label).toBe("營業稅");
    expect(next.date.getFullYear()).toBe(2027);
    expect(next.date.getMonth()).toBe(0); // January
  });

  it("adjusts weekend deadlines to Monday", () => {
    // Jan 15 2028 is a Saturday — should adjust to Jan 17 (Monday)
    const ref = new Date(2028, 0, 1);
    const events = getUpcomingTaxEvents(ref);

    const janBusinessTax = events.find(
      (e) => e.label === "營業稅" && e.date.getMonth() === 0,
    );
    expect(janBusinessTax).toBeDefined();
    expect(janBusinessTax!.date.getDay()).not.toBe(0); // not Sunday
    expect(janBusinessTax!.date.getDay()).not.toBe(6); // not Saturday
    // Jan 15 2028 is Saturday, so adjusted to Jan 17 Monday
    expect(janBusinessTax!.date.getDate()).toBe(17);
  });

  it("handles reference date on the exact deadline day", () => {
    // May 15 2026 is a Friday — event is today, daysUntil should be 0
    const ref = new Date(2026, 4, 15);
    const events = getUpcomingTaxEvents(ref);

    const todayEvent = events.find(
      (e) => e.daysUntil === 0 && e.label === "營業稅",
    );
    expect(todayEvent).toBeDefined();
  });

  it("marks only one event as isNext", () => {
    const ref = new Date(2026, 0, 15); // Jan 15 — multiple events on this day
    const events = getUpcomingTaxEvents(ref);

    const nextEvents = events.filter((e) => e.isNext);
    expect(nextEvents).toHaveLength(1);
  });
});
