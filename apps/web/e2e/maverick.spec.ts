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
    await page.waitForURL(/\/settings\?welcome=1/);
    await expect(page.getByText("Account created")).toBeVisible();
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

  test("quick ask from the Command Center opens a chat", async ({ page }) => {
    await ensureAccount(page);
    await page.goto("/");
    await page.getByLabel("Ask Maverick").fill("How should I think about Zorza revenue?");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.locator(".msg-assistant").last()).toContainText("actual baselines", { timeout: 20_000 });
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
    for (const p of ["/", "/chat", "/usage", "/security", "/settings"]) {
      await page.goto(p);
      await noHorizontalScroll(page);
    }
  });

  test("security headers are present", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["permissions-policy"]).toContain("microphone=()");
  });
});
