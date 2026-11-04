import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/core/test/fixtures");
import { expect, test, type Page } from "@playwright/test";

/** RFC 6238 code, so tests can act as Oliver's authenticator app. */
function totp(secretB32: string, t = Date.now()): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let v = 0;
  const out: number[] = [];
  for (const ch of secretB32.replace(/\s+/g, "")) {
    v = (v << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac("sha1", Buffer.from(out)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return String((((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1e6).padStart(6, "0");
}

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

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${new URL(page.url()).pathname} should not scroll sideways`).toBeLessThanOrEqual(1);
}

test.describe.serial("Maverick", () => {
  test("first-run setup rejects a wrong code, then creates the account", async ({ page }) => {
    await page.goto("/setup");
    if (!page.url().includes("/setup")) test.skip(true, "account already created by an earlier project");
    await page.getByLabel("Setup code").fill("WRONG");
    await page.getByLabel("Email (used to sign in)").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.locator(".alert-error")).toContainText("setup code is not correct");
    await page.getByLabel("Setup code").fill("E2E-CODE");
    await page.getByRole("button", { name: "Create my account" }).click();
    await page.waitForURL(/\/two-factor\?welcome=1/);
    await expect(page.getByText("Account created")).toBeVisible();
    // Optional on a local install: offered, skippable.
    await page.getByRole("link", { name: "Skip for now" }).click();
    await page.waitForURL(/\/settings\?welcome=1/);
  });

  test("signed-out visitors are sent to login and APIs refuse them", async ({ page, request }) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login/);
    const res = await request.get("/api/conversations");
    expect(res.status()).toBe(401);
  });

  test("wrong password shows an error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill("not the password at all");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator(".alert-error")).toContainText("incorrect");
  });

  test("chat streams a reply, persists it, and shows cost", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/chat");
    await page.getByLabel("Message Maverick").fill("Hello Maverick");
    await page.getByLabel("Message Maverick").press("Enter");
    const reply = page.locator(".msg-assistant").last();
    await expect(reply).toContainText("Good to see you, Oliver", { timeout: 20_000 });
    await expect(reply.locator(".msg-meta")).toContainText("Mock");
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/);
    await page.reload();
    await expect(page.locator(".msg-user")).toContainText("Hello Maverick");
    await expect(page.locator(".msg-assistant").last()).toContainText("Good to see you");
    await noHorizontalScroll(page);
  });

  test("stop button interrupts a reply", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/chat");
    await page.getByLabel("Message Maverick").fill("I keep procrastinating and losing focus");
    await page.getByLabel("Send").click();
    await page.getByLabel("Stop generating").click();
    await expect(page.getByLabel("Send")).toBeVisible();
    await expect(page.locator(".msg-assistant").last().getByText("incomplete")).toBeVisible();
    // The server noticed the disconnect and saved the reply as partial.
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/);
    await expect
      .poll(async () => {
        await page.reload();
        return page.locator(".msg-assistant").last().getByText("incomplete").count();
      }, { timeout: 15_000 })
      .toBe(1);
  });

  test("command palette: ask, add a task with smart parsing, remember, navigate", async ({ page }) => {
    await ensureAccount(page);
    const tag = test.info().project.name;
    await page.goto("/");
    await page.getByRole("button", { name: /Ask or do anything/ }).click();
    const box = page.getByLabel("Command", { exact: true });
    await box.fill("How should I think about Zorza revenue?");
    await box.press("Enter"); // first item: Ask Maverick
    await expect(page.locator(".msg-assistant").last()).toContainText("actual baselines", { timeout: 20_000 });

    await page.keyboard.press("ControlOrMeta+k");
    await page.getByLabel("Command", { exact: true }).fill(`Book flight medical ${tag} friday !1`);
    await page.getByRole("option", { name: /Add task:/ }).click();
    await expect(page.locator(".toast").last()).toContainText(`Task added: Book flight medical ${tag}`);
    await expect(page.locator(".toast").last()).toContainText("High priority");

    await page.keyboard.press("ControlOrMeta+k");
    await page.getByLabel("Command", { exact: true }).fill(`I prefer morning workouts ${tag}`);
    await page.getByRole("option", { name: /Remember:/ }).click();
    await expect(page.locator(".toast").last()).toContainText("Saved to your Memory Vault");

    await page.keyboard.press("ControlOrMeta+k");
    await page.getByLabel("Command", { exact: true }).fill("memory");
    await page.getByRole("option", { name: "Memory Vault" }).click();
    await page.waitForURL(/\/memory/);
    await expect(page.getByText(`I prefer morning workouts ${tag}`)).toBeVisible();
  });

  test("Command Center: stats, insights, focus timer and quick add", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/");
    await expect(page.getByText("Tasks done · 7 days")).toBeVisible();
    await expect(page.getByText("Focus time · 7 days")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Maverick noticed" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tasks completed per day" })).toBeVisible();

    // Quick add shows what it understood before saving.
    const qa = page.getByLabel("Quick add a task");
    await qa.fill(`Revise statistics ${test.info().project.name} tomorrow 08:00 !1`);
    await expect(page.locator(".qa-chip")).toHaveText(["Due tomorrow", "Reminder 08:00", "High priority"]);
    await qa.press("Enter");
    await expect(page.locator(".toast").last()).toContainText("Added");

    // Focus: start, see it running, finish.
    if (await page.getByRole("button", { name: "Done" }).isVisible()) await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "15m" }).click();
    await page.getByRole("button", { name: "Start focus" }).click();
    await expect(page.locator(".focus-time")).toHaveText(/1[45]:\d\d/);
    await expect(page.getByText("LEFT", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator(".toast").last()).toContainText("focused minute");
  });

  test("Goals & tasks are grouped by when they're due", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/planning");
    const tag = test.info().project.name;
    await page.getByLabel("Quick add a task").fill(`Old report ${tag} 01.01.2026`);
    await page.getByLabel("Quick add a task").press("Enter");
    await expect(page.locator(".group-head.overdue")).toBeVisible();
    const row = page.locator(".task-row", { hasText: `Old report ${tag}` });
    await row.getByRole("button", { name: "→ today" }).click();
    await expect(page.locator(".group-head.today")).toBeVisible();
    await expect(page.locator(".task-row", { hasText: `Old report ${tag}` }).locator(".hint")).toContainText("today");
  });

  test("settings save and validate", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/settings");
    await page.getByLabel("Monthly soft limit (USD)").fill("99");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.locator("form [role=status]")).toContainText("soft limit must not exceed");
    await page.getByLabel("Monthly soft limit (USD)").fill("25");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.locator("form [role=status]")).toContainText("Saved");
  });

  test("security page lists sessions and the audit log", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/security");
    await expect(page.getByText("this device")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Settings changed" }).first()).toBeVisible();
  });

  test("cross-site writes are blocked", async ({ page }) => {
    await ensureAccount(page);
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
      return r.status;
    });
    expect(status).toBe(200); // same-origin works
    const res = await page.request.put("/api/settings", { headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, data: {} });
    expect(res.status()).toBe(403);
  });

  test("every page fits the screen without sideways scrolling", async ({ page }) => {
    await ensureAccount(page);
    for (const p of ["/", "/chat", "/planning", "/memory", "/files", "/usage", "/security", "/settings"]) {
      const res = await page.goto(p);
      expect(res?.status(), `${p} should load without a server error`).toBeLessThan(400);
      await expect(page.getByText(/Application error|Internal Server Error/)).toHaveCount(0);
      await noHorizontalScroll(page);
    }
  });

  test("Maverick's 'remember' suggestion needs approval, then shows up in the Memory Vault and in context", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/chat");
    // Unique per project run: an identical pending suggestion is deliberately de-duplicated.
    const fact = `I do my best work before 11:00 (${test.info().project.name})`;
    await page.getByLabel("Message Maverick").fill(`Remember that ${fact}`);
    await page.getByLabel("Message Maverick").press("Enter");
    const chip = page.locator(".sugg-chip").last();
    await expect(chip).toContainText(fact, { timeout: 20_000 });
    // Not saved until accepted.
    const chatUrl = page.url();
    await page.goto("/memory");
    await expect(page.getByText(fact)).toHaveCount(0);
    // The chip survives a reload of the conversation.
    await page.goto(chatUrl);
    await page.locator(".sugg-chip").last().getByRole("button", { name: "Accept" }).click();
    await expect(page.locator(".sugg-chip").last()).toContainText("saved");
    await page.reload();
    await expect(page.locator(".sugg-chip").last()).toContainText("saved");
    await page.goto("/memory");
    await expect(page.getByText(fact)).toBeVisible();
    await expect(page.getByText(/Suggested from a conversation, approved by you/).first()).toBeVisible();
    // Next reply shows it in "Context used" with a reason.
    await page.goto("/chat");
    await page.getByLabel("Message Maverick").fill("hello again");
    await page.getByLabel("Message Maverick").press("Enter");
    await expect(page.locator(".msg-assistant").last()).toContainText("Good to see you", { timeout: 20_000 });
    await page.locator(".ctx-details").last().locator("summary").click();
    await expect(page.locator(".ctx-details").last()).toContainText("Always included: preferences");
  });

  test("Memory Vault: add, edit, delete", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/memory");
    await page.getByLabel("Memory", { exact: true }).fill("Trains at 17:30 on weekdays");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const item = page.locator(".mem-item", { hasText: "Trains at 17:30" });
    await expect(item).toContainText("Added by you");
    await item.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Edit memory").fill("Trains at 18:00 on weekdays");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Trains at 18:00 on weekdays")).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.locator(".mem-item", { hasText: "Trains at 18:00" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Trains at 18:00 on weekdays")).toHaveCount(0);
  });

  test("voice: off by default, then push-to-talk sends a spoken message and the reply is read aloud", async ({ page }) => {
    // Fake speech engines: the test browser has no microphone or speakers.
    const heard = `Remember that I fly on Sundays (${test.info().project.name})`;
    await page.addInitScript((heardText: string) => {
      const w = window as unknown as Record<string, unknown>;
      w.__spoken = [] as string[];
      w.__heard = heardText;
      class FakeUtterance {
        text: string;
        onstart?: () => void;
        onend?: () => void;
        voice: unknown;
        lang = "";
        rate = 1;
        pitch = 1;
        volume = 1;
        constructor(t: string) {
          this.text = t;
        }
      }
      Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          speak(u: FakeUtterance) {
            if (u.text.trim()) (w.__spoken as string[]).push(u.text);
            setTimeout(() => {
              u.onstart?.();
              u.onend?.();
            }, 5);
          },
          cancel() {},
          getVoices: () => [{ name: "Daniel", lang: "en-GB", voiceURI: "daniel" }],
          addEventListener() {},
        },
      });
      class FakeRecognition {
        lang = "";
        interimResults = false;
        continuous = false;
        maxAlternatives = 1;
        onresult: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        onstart: (() => void) | null = null;
        start() {
          (w as Record<string, unknown>).__recLang = this.lang;
          setTimeout(() => this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "Remember that" } }] }), 100);
          setTimeout(() => {
            this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: w.__heard as string } }] });
            this.onend?.();
          }, 1500);
        }
        stop() {}
        abort() {
          this.onend?.();
        }
      }
      Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
      Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true });
    }, heard);
    await ensureAccount(page);
    await page.goto("/chat");
    await expect(page.getByLabel("Talk to Maverick")).toHaveCount(0); // opt-in: no mic until enabled

    await page.goto("/settings");
    await page.getByLabel("Use voice on this device").check();
    await expect(page.getByLabel("Maverick's voice")).toContainText("Daniel (en-GB) – recommended");
    await page.goto("/chat");
    await page.getByLabel("Talk to Maverick").click();
    await expect(page.getByText("Listening… tap the mic")).toBeVisible();
    await expect(page.getByLabel("Message Maverick")).toHaveValue(/Remember that/);
    // Auto-sent when speech ends; Maverick replies and speaks.
    await expect(page.locator(".msg-user").last()).toHaveText(heard, { timeout: 10_000 });
    await expect(page.locator(".sugg-chip").last()).toContainText("I fly on Sundays", { timeout: 20_000 });
    await expect(page.locator(".msg-meta").last()).toContainText("spoke after");
    const spoken = (await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).join(" ");
    expect(spoken).toContain("I've suggested that.");
    expect(spoken).not.toMatch(/[_*#`]/); // markdown stripped before speaking
    expect(await page.evaluate(() => (window as unknown as { __recLang: string }).__recLang)).toBe("en-GB");
  });

  test("files: attach a PDF in chat, Maverick sees it, chips persist and download works", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/chat");
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, "contract.pdf"));
    const chip = page.locator(".file-chip.pending", { hasText: "contract.pdf" });
    await expect(chip).toContainText("2 p · ~4k tokens");
    await page.getByLabel("Message Maverick").fill("What is my notice period?");
    await page.getByLabel("Send").click();
    await expect(page.locator(".msg-assistant").last()).toContainText("I can see 1 file in this conversation: contract.pdf (pdf)", { timeout: 20_000 });
    await expect(page.locator(".msg-meta").last()).toContainText("Files in the conversation");
    // Follow-up: still in view without re-attaching.
    await page.getByLabel("Message Maverick").fill("And the salary?");
    await page.getByLabel("Message Maverick").press("Enter");
    await expect(page.locator(".msg-assistant").last()).toContainText("contract.pdf", { timeout: 20_000 });
    await page.reload();
    const sent = page.locator(".msg-user .file-chip", { hasText: "contract.pdf" });
    await expect(sent).toHaveCount(1);
    const [download] = await Promise.all([page.waitForEvent("download"), sent.click()]);
    expect(download.suggestedFilename()).toBe("contract.pdf");
  });

  test("files: library upload, Ask Maverick, rejection of unsupported files, delete", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/files");
    await page.getByLabel("Upload files").setInputFiles([path.join(FIXTURES, "plan.docx"), path.join(FIXTURES, "pixel.png")]);
    await expect(page.getByRole("cell", { name: /plan\.docx/ }).first()).toBeVisible();
    await expect(page.locator("img.thumb").first()).toBeVisible();
    await page.getByLabel("Upload files").setInputFiles({ name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ\x00\x00binary") });
    await expect(page.locator(".alert-error")).toContainText("Unsupported file type");

    await page.locator("tr", { hasText: "plan.docx" }).first().getByRole("link", { name: "Ask Maverick" }).click();
    await expect(page.locator(".file-chip.pending", { hasText: "plan.docx" })).toBeVisible();
    await page.getByLabel("Send").click(); // allowed with only a file attached
    await expect(page.locator(".msg-assistant").last()).toContainText('plan.docx (text, starts "Zorza Marketing plan', { timeout: 20_000 });

    await page.goto("/files");
    const before = await page.locator("tr", { hasText: "pixel.png" }).count();
    page.once("dialog", (d) => d.accept());
    await page.locator("tr", { hasText: "pixel.png" }).first().getByRole("button", { name: /Delete/ }).click();
    await expect(page.locator("tr", { hasText: "pixel.png" })).toHaveCount(before - 1);
  });

  test("Memory Vault: paste many at once", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/memory");
    await page.getByRole("tab", { name: "Paste many" }).click();
    const tag = test.info().project.name;
    await page.getByLabel("Paste memories, one per line").fill(
      ["```", `- Oliver's sister is Veronika (${tag}).`, `Oliver has two dogs, Luna and Grace (${tag}).`, "", `1. Oliver speaks Polish (${tag}).`, "```"].join("\n"),
    );
    await page.getByLabel("Category for all of these").selectOption("profile");
    await page.getByRole("button", { name: "Add 3 memories" }).click();
    await expect(page.locator(".alert[role=status]")).toContainText("Added 3 memories");
    await expect(page.locator(".mem-item", { hasText: `Oliver speaks Polish (${tag}).` })).toContainText("Added by you");
    // Pasting the same again skips them.
    await page.getByLabel("Paste memories, one per line").fill(`Oliver speaks Polish (${tag}).`);
    await page.getByRole("button", { name: "Add 1 memory" }).click();
    await expect(page.locator(".alert[role=status]")).toContainText("Skipped 1 already in the vault");
  });

  test("goals and tasks: add, link, complete", async ({ page }) => {
    await ensureAccount(page);
    const tag = test.info().project.name;
    const goalName = `Private pilot licence (${tag})`;
    const taskName = `Book the class 2 medical (${tag})`;
    await page.goto("/planning");
    await page.getByLabel("Outcome").fill(goalName);
    await page.getByLabel("How you'll measure it").fill("Checkride passed");
    await page.getByRole("button", { name: "Add goal" }).click();
    await expect(page.locator(".goal-row", { hasText: goalName })).toBeVisible();
    await page.getByText("More options (goal, exact reminder)").click();
    await page.getByLabel("New task").fill(taskName);
    await page.getByLabel("Priority").selectOption("1");
    await page.getByLabel("Goal", { exact: true }).selectOption({ label: goalName });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const row = page.locator(".task-row", { hasText: taskName });
    await expect(row).toContainText(`→ ${goalName}`);
    // The goal now shows progress from its linked task.
    await expect(page.locator(".goal-row", { hasText: goalName })).toContainText("0/1 tasks");
    await row.getByRole("checkbox").click(); // the row leaves the open list once done
    await expect(page.locator(".toast").last()).toContainText(`Done: ${taskName}`);
    await expect(page.locator(".goal-row", { hasText: goalName })).toContainText("1/1 tasks");
    await page.reload();
    await expect(page.locator(".task-row", { hasText: taskName })).toHaveCount(0);
  });

  test("Brief me now: a briefing built from the calendar and tasks", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/");
    await expect(page.getByText("Deep work: client proposal")).toBeVisible(); // agenda card (demo calendar)
    await page.getByRole("button", { name: /Brief me/ }).click();
    await page.waitForURL(/\/chat\/[0-9a-f-]{36}/);
    const brief = page.locator(".msg-assistant").first();
    await expect(brief).toContainText("Good morning, Oliver");
    await expect(brief).toContainText("Deep work: client proposal");
    await expect(brief).toContainText("Which single outcome matters most today?");
    // Replying continues the conversation.
    await page.getByLabel("Message Maverick").fill("The proposal matters most");
    await page.getByLabel("Message Maverick").press("Enter");
    await expect(page.locator(".msg-assistant")).toHaveCount(2, { timeout: 20_000 });
  });

  test("settings: daily rhythm, proactivity and notification panel", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/settings");
    await expect(page.getByLabel("Morning briefing time")).toHaveValue("05:30");
    await expect(page.getByLabel("Quiet hours start")).toHaveValue("22:00");
    await page.getByLabel("Evening check-in time").fill("20:30");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.locator("form [role=status]")).toContainText("Saved");
    await page.reload();
    await expect(page.getByLabel("Evening check-in time")).toHaveValue("20:30");
    // Push keys are generated automatically, so the server side is always ready.
    await expect(page.getByText("Notifications aren't set up on the server yet")).toHaveCount(0);
    await expect(page.getByText("Demo calendar in use")).toBeVisible();
  });

  test("data export includes memories and conversations", async ({ page }) => {
    await ensureAccount(page);
    const res = await page.request.get("/api/export");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.format).toBe("maverick-export-v1");
    expect(data.conversations.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain("v1:");
  });

  test("two-step login: set up with QR/setup key, sign in with a code, then turn off", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "one device is enough; it changes the shared account");
    await ensureAccount(page);
    await page.goto("/security");
    await page.getByRole("link", { name: "Set up two-step login" }).click();
    await page.getByRole("button", { name: "Set up two-step login" }).click();
    await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
    const secret = (await page.locator(".setup-key").innerText()).replace(/\s+/g, "");
    await page.getByLabel("6-digit code").fill(totp(secret, Date.now() - 30_000));
    await page.getByRole("button", { name: "Turn on two-step login" }).click();
    await expect(page.getByLabel("Recovery codes", { exact: true })).toContainText(/[A-Z0-9]{4}-[A-Z0-9]{4}/);
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await page.getByLabel("I've saved my recovery codes").check();
    await page.getByRole("button", { name: "Continue" }).click();

    // Sign out, sign in: password, then code.
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/login/);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByLabel("6-digit code from your authenticator app").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.locator(".alert-error")).toContainText("isn't right");
    await page.getByLabel("6-digit code from your authenticator app").fill(totp(secret));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL((u) => u.pathname === "/");

    // Turn it off again so the other tests can sign in with just a password.
    await page.goto("/security");
    await expect(page.getByText("Every sign-in needs a code from your phone")).toBeVisible();
    await page.getByRole("button", { name: "Turn off" }).click();
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByLabel("Current 6-digit code").fill(totp(secret, Date.now() + 30_000));
    await page.getByRole("button", { name: "Turn off two-step login" }).click();
    await expect(page.getByRole("link", { name: "Set up two-step login" })).toBeVisible();
  });

  test("security headers are present", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    // Microphone allowed only for Maverick itself (push-to-talk); never for embedded third parties.
    expect(h["permissions-policy"]).toContain("microphone=(self)");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["strict-transport-security"]).toBe("max-age=31536000");
  });
});
