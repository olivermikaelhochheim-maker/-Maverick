import { describe, expect, it } from "vitest";
import { parseQuickTask } from "../src/quickadd";

// Wednesday 4 November 2026, 10:00 in Oslo (09:00 UTC).
const NOW = new Date("2026-11-04T09:00:00Z");
const p = (s: string) => parseQuickTask(s, "Europe/Oslo", NOW);

describe("quick add", () => {
  it("understands dates, times, priority and goals", () => {
    expect(p("Call flight school tomorrow 15:00 !1 #pilot")).toMatchObject({
      title: "Call flight school",
      dueDate: "2026-11-05",
      remindAt: "2026-11-05T14:00:00.000Z",
      priority: 1,
      goalHint: "pilot",
      understood: ["Due tomorrow", "Reminder 15:00", "High priority", "Goal: #pilot"],
    });
  });

  it("handles weekdays, relative days, numeric dates and Norwegian", () => {
    expect(p("Gym friday").dueDate).toBe("2026-11-06");
    expect(p("Review plan wednesday").dueDate).toBe("2026-11-11"); // next Wednesday, not today
    expect(p("Send invoice in 3 days").dueDate).toBe("2026-11-07");
    expect(p("Statistics exam 20.11 !1").dueDate).toBe("2026-11-20");
    expect(p("Dad's birthday 21/01").dueDate).toBe("2027-01-21"); // past date this year -> next year
    expect(p("Ring banken i morgen kl 9")).toMatchObject({ title: "Ring banken", dueDate: "2026-11-05", remindAt: "2026-11-05T08:00:00.000Z" });
    expect(p("Trening på fredag").dueDate).toBe("2026-11-06");
    expect(p("Plan week next week").dueDate).toBe("2026-11-09");
  });

  it("a time alone means today, or tomorrow if it has passed", () => {
    expect(p("Stretch 18:30").dueDate).toBe("2026-11-04");
    expect(p("Stretch 08:00").dueDate).toBe("2026-11-05");
    expect(p("Call mum 3pm").remindAt).toBe("2026-11-04T14:00:00.000Z");
  });

  it("leaves plain text alone", () => {
    expect(p("Read chapter 4 of the PPL book")).toMatchObject({ title: "Read chapter 4 of the PPL book", dueDate: null, priority: 2, understood: [] });
    expect(p("Version 2.5 release notes").dueDate).toBeNull();
  });
});
