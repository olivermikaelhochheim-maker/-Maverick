import { describe, expect, it } from "vitest";
import { addDays, inWindow, localParts, zonedToUtc } from "../src/util/time";

describe("time helpers", () => {
  it("reads local wall time in Oslo across DST", () => {
    // 2026-07-01 03:30 UTC = 05:30 CEST (UTC+2)
    expect(localParts("Europe/Oslo", new Date("2026-07-01T03:30:00Z"))).toMatchObject({ date: "2026-07-01", hhmm: "05:30" });
    // 2026-12-01 04:30 UTC = 05:30 CET (UTC+1)
    expect(localParts("Europe/Oslo", new Date("2026-12-01T04:30:00Z"))).toMatchObject({ date: "2026-12-01", hhmm: "05:30", weekday: 2 });
  });

  it("converts Oslo wall time to UTC in summer and winter", () => {
    expect(zonedToUtc("2026-07-01", "05:30", "Europe/Oslo").toISOString()).toBe("2026-07-01T03:30:00.000Z");
    expect(zonedToUtc("2026-12-01", "05:30", "Europe/Oslo").toISOString()).toBe("2026-12-01T04:30:00.000Z");
  });

  it("handles quiet-hour windows that cross midnight", () => {
    expect(inWindow("23:15", "22:00", "05:00")).toBe(true);
    expect(inWindow("04:59", "22:00", "05:00")).toBe(true);
    expect(inWindow("05:00", "22:00", "05:00")).toBe(false);
    expect(inWindow("12:00", "22:00", "05:00")).toBe(false);
    expect(inWindow("13:00", "12:00", "14:00")).toBe(true);
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
