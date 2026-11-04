import { describe, expect, it } from "vitest";
import { exportAll } from "../src/export";
import { importAll } from "../src/import";
import { defaultDeps } from "../src/chat/service";
import { getSettings, updateSettings } from "../src/settings";
import { collect, freshDb, seedUser, setup, testCipher } from "./helpers";

describe("moving Maverick: export → import", () => {
  it("restores memories, goals, linked tasks, conversations, settings and spend into a fresh install with a different key", async () => {
    const a = await setup();
    const depsA = defaultDeps(a.db, a.cipher);
    await depsA.memory.create(a.user.id, { category: "profile", content: "Lives in Stavanger", source: "user" });
    await depsA.memory.create(a.user.id, { category: "preference", content: "Trains at 17:30", source: "conversation", confidence: 0.7 });
    const goal = await depsA.planning.createGoal(a.user.id, { title: "Pilot licence", horizon: "personal" });
    await depsA.planning.createTask(a.user.id, { title: "Book medical", goalId: goal.id, dueDate: "2026-12-01", priority: 1 });
    await collect(a.chat.send({ user: a.user, text: "Hello there" }));
    await updateSettings(a.db, a.cipher, a.user.id, { timezone: "Europe/Oslo", personality: { wit: "high" } });
    const exported = JSON.parse(JSON.stringify(await exportAll(a.db, a.cipher, depsA, a.user)));

    // A fresh cloud install: new database, new encryption key.
    const db = await freshDb();
    const user = await seedUser(db);
    const cipher = testCipher();
    const counts = await importAll(db, cipher, user.id, exported);
    expect(counts).toEqual({ memories: 2, goals: 1, tasks: 1, conversations: 1, messages: 2, habits: 0, habitLogs: 0, journal: 0 });

    const deps = defaultDeps(db, cipher);
    const mems = await deps.memory.list(user.id);
    expect(mems.map((m) => m.content).sort()).toEqual(["Lives in Stavanger", "Trains at 17:30"]);
    expect(mems.find((m) => m.content === "Trains at 17:30")).toMatchObject({ source: "conversation", confidence: 0.7 });
    const [task] = await deps.planning.listTasks(user.id);
    const [g] = await deps.planning.listGoals(user.id);
    expect(task).toMatchObject({ title: "Book medical", goalId: g!.id, dueDate: "2026-12-01", priority: 1 });
    expect((await getSettings(db, cipher, user.id)).personality.wit).toBe("high");
    const usage = await db.query("SELECT * FROM usage_events");
    expect(usage.rows).toHaveLength(1);
  });

  it("refuses a non-export file and an account that already has data", async () => {
    const db = await freshDb();
    const user = await seedUser(db);
    const cipher = testCipher();
    await expect(importAll(db, cipher, user.id, { hello: 1 })).rejects.toMatchObject({ code: "bad_import" });
    await defaultDeps(db, cipher).memory.create(user.id, { category: "profile", content: "x", source: "user" });
    await expect(importAll(db, cipher, user.id, { format: "maverick-export-v1" })).rejects.toMatchObject({ code: "not_empty" });
  });
});
