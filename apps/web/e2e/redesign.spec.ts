import { expect, test, type Page } from "@playwright/test";

const EMAIL = "oliver@example.com";
const PASSWORD = "a long test passphrase";

async function ensureAccount(page: Page) {
  await page.goto("/");
  if (page.url().includes("/setup")) {
    await page.getByLabel("Setup code").fill("E2E-CODE");
    await page.getByLabel("Email (used to sign in)").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create my account" }).click();
    await page.waitForURL(/\/two-factor\?welcome=1/);
    await page.getByRole("link", { name: "Skip for now" }).click();
    await page.waitForURL(/\/settings\?welcome=1/);
    return;
  }
  if (page.url().includes("/login")) {
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
}

async function setAgent(page: Page, agent: Record<string, unknown>) {
  const status = await page.evaluate(async (a) => {
    const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent: a }) });
    return r.status;
  }, agent);
  expect(status).toBe(200);
}

test.describe.serial("Command system", () => {
  test("Prepare me for tomorrow: asks before changing anything (Assisted), then completes with a readiness report", async ({ page }) => {
    await ensureAccount(page);
    await setAgent(page, { mode: 2, halted: false });
    await page.goto("/");
    await expect(page.locator(".cmdbar")).toContainText("2 · Assisted");
    await page.getByRole("button", { name: "Prepare me for tomorrow" }).first().click();
    await page.waitForURL(/\/missions\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Prepare for tomorrow", exact: true })).toBeVisible();
    // Reads ran on their own; the reminder task waits for approval, and the core says so.
    await expect(page.locator(".st", { hasText: "Needs approval" }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".cmdbar .core")).toHaveClass(/alert/);
    await expect(page.getByText("Create task \"Review tomorrow's plan (10 min)\"").first()).toBeVisible();
    await page.getByRole("button", { name: "Approve this step" }).click();
    await expect(page.locator(".card .st", { hasText: "Completed" }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".report")).toContainText("Mission report: Prepare for tomorrow");
    await expect(page.locator(".report")).toContainText("Readiness");
    await expect(page.getByRole("region", { name: "Execution log" })).toContainText("Confirmed: task");
    // The task really exists.
    await page.goto("/planning");
    await expect(page.getByText("Review tomorrow's plan (10 min)").first()).toBeVisible();
  });

  test("Advisory mode recommends changes instead of making them; 'Run it now' executes one", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/permissions");
    await page.getByRole("button", { name: /MODE 1\s*Advisory/ }).click();
    await expect(page.locator(".cmdbar")).toContainText("1 · Advisory");
    await page.goto("/missions?t=prepare_tomorrow");
    await page.getByRole("button", { name: "Launch mission" }).click();
    await page.waitForURL(/\/missions\/[0-9a-f-]+$/);
    await expect(page.locator(".card .st", { hasText: "Completed" }).first()).toBeVisible({ timeout: 15_000 });
    const step = page.locator(".step", { hasText: "Evening review reminder" });
    await expect(step.locator(".st")).toHaveText("Recommended");
    await step.getByRole("button", { name: "Run it now" }).click();
    await expect(step.locator(".st")).toHaveText("Done", { timeout: 15_000 });
    await setAgent(page, { mode: 2 });
  });

  test("emergency stop halts everything until released", async ({ page }) => {
    await ensureAccount(page);
    await setAgent(page, { mode: 3, halted: false });
    await page.goto("/");
    await page.getByRole("button", { name: /E-STOP/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "EMERGENCY STOP" })).toBeVisible();
    await page.getByLabel("Command line").fill("Run a situation report");
    await page.getByRole("button", { name: "Execute" }).click();
    await page.waitForURL(/\/missions\/[0-9a-f-]+$/);
    await expect(page.getByText("Emergency stop on: nothing runs")).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(page.locator(".step.done")).toHaveCount(0);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: /RELEASE/ }).click();
    await expect(page.locator(".card .st", { hasText: "Completed" }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".report")).toContainText("Systems check");
    await setAgent(page, { mode: 2 });
  });

  test("voice command 'Maverick, run a situation report' launches the mission", async ({ page }) => {
    await page.addInitScript(() => {
      class FakeRecognition {
        lang = "";
        interimResults = false;
        continuous = false;
        maxAlternatives = 1;
        onresult: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        start() {
          setTimeout(() => this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "Maverick, run a" } }] }), 100);
          setTimeout(() => {
            this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Maverick, run a situation report" } }] });
            this.onend?.();
          }, 1200);
        }
        stop() {}
        abort() {
          this.onend?.();
        }
      }
      Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
      Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true });
    });
    await ensureAccount(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Voice command" }).click();
    await expect(page.getByText("Listening · microphone on")).toBeVisible();
    await expect(page.locator(".cmdbar .core")).toHaveClass(/listening/);
    await page.waitForURL(/\/missions\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Situation report", exact: true })).toBeVisible();
    await expect(page.locator(".card .st", { hasText: "Completed" }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("finance: import a Norwegian bank CSV, see real totals, recategorise", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/finance");
    const tag = test.info().project.name;
    const month = new Date().toISOString().slice(0, 7).split("-").reverse().join(".");
    const csv = `"Dato";"Forklaring";"Rentedato";"Ut fra konto";"Inn på konto"\n"02.${month}";"REMA 1000 ${tag}";"";"312,40";""\n"01.${month}";"Lønn ${tag}";"";"";"35 000,00"\n"03.${month}";"Kiosk ${tag}";"";"50,00";""\n`;
    await page.locator('input[type="file"]').setInputFiles({ name: "dnb.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.locator(".toast").last()).toContainText(/Imported 3 transactions/);
    await expect(page.getByRole("heading", { name: "Spending by category" })).toBeVisible();
    await expect(page.getByRole("cell", { name: `REMA 1000 ${tag}`, exact: true })).toBeVisible();
    await page.getByLabel(`Category for Kiosk ${tag}`).selectOption("groceries");
    await expect(page.locator(".toast").last()).toContainText("Recategorised");
    // Same file again adds nothing.
    await page.locator('input[type="file"]').setInputFiles({ name: "dnb.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.locator(".toast").last()).toContainText("Imported 0 transactions");
  });

  test("health: log a workout and see the week", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/health");
    await page.getByLabel("Workout (min)").fill("45");
    await page.getByLabel("Note").fill("Push day");
    await page.getByRole("button", { name: "Log workout" }).click();
    await expect(page.locator(".toast").last()).toContainText("Workout logged");
    await expect(page.getByRole("heading", { name: "Last 7 days" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Push day" }).first()).toBeVisible();
  });

  test("communications: Maverick drafts, you send from your own mail app", async ({ page }) => {
    await ensureAccount(page);
    await setAgent(page, { mode: 3 });
    await page.goto("/comms");
    const subject = `Follow-up ${test.info().project.name}`;
    await page.getByLabel("Subject for the new draft").fill(subject);
    await page.getByLabel("What it should say").fill("thank them for the call");
    await page.getByRole("button", { name: "Draft it" }).click();
    await expect(page.locator(".toast").last()).toContainText("Drafting mission launched");
    await expect.poll(async () => {
      await page.goto("/comms");
      return page.getByRole("button", { name: new RegExp(subject) }).count();
    }, { timeout: 20_000 }).toBeGreaterThan(0);
    await page.getByRole("button", { name: new RegExp(subject) }).click();
    await expect(page.getByRole("link", { name: "Open in Mail" })).toHaveAttribute("href", /^mailto:/);
    await setAgent(page, { mode: 2 });
  });

  test("task library: daily picks land in the inbox; 'Never' is remembered and can be undone", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "All 232 tasks" })).toBeVisible();
    await page.getByRole("button", { name: "Suggest today's tasks now" }).click();
    await expect(page.locator(".toast").last()).toContainText(/new suggestion|Nothing new/);
    await page.goto("/planning");
    const item = page.locator(".inbox-item", { has: page.locator(".badge", { hasText: /^Library / }) }).first();
    await expect(item).toBeVisible();
    const id = (await item.locator(".badge", { hasText: /^Library / }).innerText()).replace("Library ", "").trim();
    await item.getByRole("button", { name: "Never" }).click();
    await expect(page.locator(".toast").last()).toContainText("won't suggest that again");
    await page.goto("/library");
    await page.getByLabel("Search tasks").fill(id);
    const row = page.locator("tr", { has: page.locator("td.mono", { hasText: new RegExp(`^${id}$`) }) });
    await expect(row.locator(".st")).toHaveText("Never");
    await row.getByRole("button", { name: "Restore" }).click();
    await expect(page.locator(".toast").last()).toContainText("Restored");
    await expect(row.locator(".st")).not.toHaveText("Never");
  });
});
