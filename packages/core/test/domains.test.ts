import { describe, expect, it } from "vitest";
import { freshDb, seedUser, testCipher } from "./helpers";
import { FinanceStore, categorize, merchantKey, parseAmount, parseBankCsv, parseDate, formatNok } from "../src/finance";
import { HealthStore } from "../src/health";
import { DraftStore, mailtoLink } from "../src/drafts";

describe("bank CSV parsing", () => {
  it("parses amounts in Norwegian and English formats", () => {
    expect(parseAmount("1 234,56")).toBe(123456);
    expect(parseAmount("-1.234,56")).toBe(-123456);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("-249,90 kr")).toBe(-24990);
    expect(parseAmount("99,-")).toBe(9900);
    expect(parseAmount("(50.00)")).toBe(-5000);
    expect(parseAmount("abc")).toBeNull();
    expect(parseDate("05.11.2026")).toBe("2026-11-05");
    expect(parseDate("5.11.26")).toBe("2026-11-05");
    expect(parseDate("2026-11-05")).toBe("2026-11-05");
    expect(parseDate("31.02.2026")).toBeNull();
  });

  it("reads a DNB-style export with Ut/Inn columns and a BOM", () => {
    const csv = '﻿"Dato";"Forklaring";"Rentedato";"Ut fra konto";"Inn på konto"\n"03.11.2026";"REMA 1000 STAVANGER";"03.11.2026";"312,40";""\n"01.11.2026";"Lønn Widerøe";"01.11.2026";"";"35 000,00"\n';
    const r = parseBankCsv(csv);
    expect(r.rows).toEqual([
      { date: "2026-11-03", description: "REMA 1000 STAVANGER", amountMinor: -31240 },
      { date: "2026-11-01", description: "Lønn Widerøe", amountMinor: 3500000 },
    ]);
  });

  it("reads a SpareBank 1 / Sbanken-style export with preamble lines and a signed Beløp column", () => {
    const csv = "Kontoutskrift\nKonto: 1234.56.78901\n\nBokføringsdato;Tekst;Beløp\n04.11.2026;Spotify P2E3;-129,00\n04.11.2026;Vipps *Ola;-200,00\nnot a row\n";
    const r = parseBankCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toEqual([{ line: 7, reason: "no valid date" }]);
  });

  it("rejects files without headers", () => {
    expect(() => parseBankCsv("a;b;c\n1;2;3")).toThrow(/column headers/);
  });

  it("categorises merchants and income", () => {
    expect(categorize("REMA 1000 STAVANGER", -31240)).toBe("groceries");
    expect(categorize("Lønn Widerøe", 3500000)).toBe("income");
    expect(categorize("SPOTIFY P2E3", -12900)).toBe("subscriptions");
    expect(categorize("Circle K Forus", -60000)).toBe("transport");
    expect(categorize("Unknown shop", -1000)).toBe("other");
    expect(merchantKey("VISA VARE 1234 REMA 1000 STAVANGER 03.11")).toBe("rema stavanger");
    expect(formatNok(-123456)).toBe("−1 235 kr");
  });
});

describe("finance store and intelligence", () => {
  it("imports idempotently, learns categories, and computes intelligence only from real rows", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const f = new FinanceStore(db, testCipher());
    expect((await f.intelligence(user.id, "2026-11-20")).hasData).toBe(false);

    const lines = ["Dato;Beskrivelse;Beløp"];
    for (const m of ["07", "08", "09", "10", "11"]) {
      lines.push(`02.${m}.2026;Netflix.com;-179,00`);
      lines.push(`05.${m}.2026;Rema 1000;-${m === "11" ? "4000" : "400"},00`);
      lines.push(`06.${m}.2026;Rema 1000;-410,00`);
      lines.push(`01.${m}.2026;Lønn;35000,00`);
    }
    lines.push("10.11.2026;Kiosk Hjørnet;-50,00");
    const csv = lines.join("\n");
    const first = await f.importCsv(user.id, csv);
    expect(first.added).toBe(21);
    const again = await f.importCsv(user.id, csv);
    expect(again).toMatchObject({ added: 0, duplicates: 21 });

    await f.setBudget(user.id, "groceries", 3000);
    const intel = await f.intelligence(user.id, "2026-11-20");
    expect(intel.hasData).toBe(true);
    expect(intel.current!.incomeMinor).toBe(3500000);
    expect(intel.current!.spendMinor).toBe(17900 + 400000 + 41000 + 5000);
    expect(intel.recurring.map((r) => r.key)).toContain("netflix.com");
    expect(intel.anomalies[0]?.description).toBe("Rema 1000");
    expect(intel.budgets[0]).toMatchObject({ category: "groceries", limitMinor: 300000 });
    expect(intel.insights.some((i) => i.text.includes("over budget"))).toBe(true);

    // Learn: "Kiosk Hjørnet" is groceries, applied to matching rows and future imports.
    const kiosk = (await f.list(user.id)).find((t) => t.description === "Kiosk Hjørnet")!;
    expect(kiosk.category).toBe("other");
    await f.recategorize(user.id, kiosk.id, "groceries");
    await f.importCsv(user.id, "Dato;Beskrivelse;Beløp\n12.11.2026;Kiosk Hjørnet;-60,00");
    expect((await f.list(user.id)).filter((t) => t.description === "Kiosk Hjørnet").every((t) => t.category === "groceries")).toBe(true);
  });
});

describe("health logs", () => {
  it("validates entries and computes weekly trends", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const h = new HealthStore(db, testCipher());
    await expect(h.add(user.id, { date: "2026-11-05", kind: "energy", value: 9 })).rejects.toThrow(/between 1 and 5/);
    for (const d of ["2026-11-01", "2026-11-02", "2026-11-04", "2026-11-05"]) await h.add(user.id, { date: d, kind: "workout", value: 45, note: "Gym" });
    await h.add(user.id, { date: "2026-11-05", kind: "sleep", value: "6,5" });
    await h.add(user.id, { date: "2026-10-01", kind: "weight", value: 80 });
    await h.add(user.id, { date: "2026-11-05", kind: "weight", value: 78.4 });
    const t = await h.trends(user.id, "2026-11-05");
    expect(t.week.workouts).toBe(4);
    expect(t.week.workoutMin).toBe(180);
    expect(t.week.avgSleep).toBe(6.5);
    expect(t.weight).toEqual({ latest: 78.4, change30: -1.6 });
    expect(t.workoutStreakWeeks).toBe(1);
    expect(t.insights.some((i) => i.text.includes("Average sleep"))).toBe(true);
  });
});

describe("drafts", () => {
  it("stores encrypted drafts and builds a mailto hand-off", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const d = new DraftStore(db, testCipher());
    await expect(d.create(user.id, { to: "not an email", subject: "x", body: "y" }, { writtenBy: "user" })).rejects.toThrow(/email address/);
    const draft = await d.create(user.id, { to: "a@b.no", subject: "Hei & hello", body: "Line 1\nLine 2" }, { writtenBy: "user" });
    const { rows } = await db.query<{ body_enc: string }>("SELECT body_enc FROM drafts");
    expect(rows[0]!.body_enc).not.toContain("Line 1");
    expect(mailtoLink(draft)).toBe("mailto:a%40b.no?subject=Hei%20%26%20hello&body=Line%201%0ALine%202");
    const handed = await d.update(user.id, draft.id, { status: "handed_off" });
    expect(handed.status).toBe("handed_off");
  });
});
