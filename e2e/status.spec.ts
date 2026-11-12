import { expect, test } from "@playwright/test";

const VALID_STATES = ["Available", "Configuration needed", "Unavailable"];

const VALID_MESSAGES = [
  "The local database is available.",
  "Local database settings need attention.",
  "Cannot connect to the local database.",
  "Database sign in failed. Check your local credentials.",
  "The database connection check timed out.",
  "The database query check timed out.",
  "The database check could not complete.",
];

test.describe("status page", () => {
  test("renders the scaffold surface with a real status result", async ({
    page,
  }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");

    await expect(
      page.getByRole("heading", { name: "Ledger", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Local scaffold. This page checks the connection to your local database.",
      ),
    ).toBeVisible();

    const statusLine = page.getByText(/^Status: /);
    await expect(statusLine).toBeVisible();
    const statusText = await statusLine.textContent();
    expect(
      VALID_STATES.some((state) => statusText === `Status: ${state}`),
    ).toBe(true);

    const message = page.locator("section p").nth(1);
    await expect(message).toHaveText(
      new RegExp(`^(${VALID_MESSAGES.join("|")})$`),
    );

    await expect(page.getByText(/Last checked \(UTC\):/)).toBeVisible();
    const time = page.locator("time");
    await expect(time).toHaveAttribute(
      "datetime",
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );

    await expect(
      page.getByRole("button", { name: "Check again" }),
    ).toBeVisible();
  });

  test("retry issues a fresh check with a new timestamp", async ({ page }) => {
    await page.goto("/");
    const first = await page.locator("time").getAttribute("datetime");

    await page.getByRole("button", { name: "Check again" }).click();
    await expect(
      page.getByRole("button", { name: "Check again" }),
    ).toBeEnabled();

    const second = await page.locator("time").getAttribute("datetime");
    expect(second).not.toBeNull();
    expect(Date.parse(second!)).toBeGreaterThanOrEqual(Date.parse(first!));
  });

  test("ignores unknown query parameters", async ({ page }) => {
    const response = await page.goto("/?utm_source=evil&debug=1");
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/^Status: /)).toBeVisible();
  });

  test("remains usable at a 320 pixel viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Ledger" })).toBeVisible();
    const button = page.getByRole("button", { name: "Check again" });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  });

  test("does not leak settings or secrets into the rendered HTML", async ({
    page,
  }) => {
    await page.goto("/");
    const html = await page.content();
    for (const secret of [
      process.env.POSTGRES_PASSWORD,
      process.env.LEDGER_DB_PASSWORD,
      process.env.DATABASE_URL,
    ]) {
      if (secret) expect(html).not.toContain(secret);
    }
    expect(html).not.toContain("postgresql://");
  });

  test("rejects a foreign origin with 403", async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3000",
      extraHTTPHeaders: { origin: "https://evil.example" },
    });
    const response = await api.get("/");
    expect(response.status()).toBe(403);
    expect(await response.text()).toBe(
      "Cross-origin requests are not allowed.",
    );
    await api.dispose();
  });

  test("allows requests without an origin header", async ({ playwright }) => {
    const api = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    const response = await api.get("/");
    expect(response.status()).toBe(200);
    await api.dispose();
  });
});
