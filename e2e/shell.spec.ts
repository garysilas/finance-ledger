import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("app shell", () => {
  test("AC-1 keeps the collapsed sidebar across reload and supports the shortcut", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/status");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect
      .poll(async () => (await nav.boundingBox())?.width ?? 0)
      .toBeGreaterThan(100);
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect
      .poll(async () => (await nav.boundingBox())?.width ?? 1000)
      .toBeLessThan(80);
    expect(
      (await context.cookies()).find(({ name }) => name === "sidebar_state")
        ?.value,
    ).toBe("false");
    await page.reload();
    await expect
      .poll(async () => (await nav.boundingBox())?.width ?? 1000)
      .toBeLessThan(80);
    await page.keyboard.press("Control+b");
    await expect
      .poll(async () => (await nav.boundingBox())?.width ?? 0)
      .toBeGreaterThan(100);
  });

  test("AC-1 renders the saved collapse state before client scripts run", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1280, height: 800 },
    });
    try {
      await context.addCookies([
        { name: "sidebar_state", value: "false", url: "http://127.0.0.1:3000" },
      ]);
      const page = await context.newPage();
      await page.goto("/status");
      const width = (
        await page.getByRole("navigation", { name: "Main" }).boundingBox()
      )?.width;
      expect(width).toBeDefined();
      expect(width).toBeLessThan(80);
    } finally {
      await context.close();
    }
  });

  test("AC-2 traps sheet focus and closes after selecting a destination", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/status");
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          dialog.evaluate((node) => node.contains(document.activeElement)),
        )
        .toBe(true);
    }
    await dialog.getByRole("link", { name: "System status" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "System status", level: 1 }),
    ).toBeVisible();
  });

  test("AC-2 switches between the sheet and the desktop rail at 768 pixels", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 767, height: 800 });
    await page.goto("/status");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await page.setViewportSize({ width: 768, height: 800 });
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });

  test("AC-2 prevents horizontal scrolling at 320 pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/status");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("AC-5 keeps the health link named and shows its tooltip in icon mode", async ({
    page,
  }) => {
    await page.goto("/status");
    const health = page.getByRole("link", {
      name: /^Database: (Available|Configuration needed|Unavailable)$/,
    });
    await expect(health).toBeVisible();
    await expect(health).toHaveAttribute("href", "/status");
    const name = await health.getAttribute("aria-label");
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await health.hover();
    await expect(page.getByRole("tooltip")).toHaveText(name!);
  });

  test("AC-6 persists Light and can return to the system theme by keyboard", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/status");
    await expect(page.locator("html")).toHaveClass(/dark/);
    const button = page.getByRole("button", { name: "Theme" });
    await button.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/light/);
    await button.click();
    await expect(
      page.getByRole("menuitemradio", { name: "Light" }),
    ).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitemradio", { name: "System" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveClass(/light/);
  });

  test("AC-6 follows the system theme at the first visible frame", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => {
      const capture = () => {
        if (!document.body) {
          requestAnimationFrame(capture);
          return;
        }
        document.documentElement.dataset.firstFrameTheme =
          document.documentElement.classList.contains("dark")
            ? "dark"
            : "light";
      };
      requestAnimationFrame(capture);
    });
    await page.goto("/status");
    await expect(page.locator("html")).toHaveAttribute(
      "data-first-frame-theme",
      "dark",
    );
  });

  test("AC-8 loads fonts locally and uses a sixteen pixel body", async ({
    page,
  }) => {
    const externalFonts: string[] = [];
    page.on("request", (request) => {
      if (
        request.resourceType() === "font" &&
        new URL(request.url()).origin !== "http://127.0.0.1:3000"
      )
        externalFonts.push(request.url());
    });
    await page.goto("/status");
    await page.evaluate(() => document.fonts.ready);
    expect(externalFonts).toEqual([]);
    await expect(page.locator("body")).toHaveCSS("font-size", "16px");
    expect(
      await page
        .locator("body")
        .evaluate((node) => getComputedStyle(node).fontFamily),
    ).toContain("Geist");
  });
  test("AC-7 AC-15 has no WCAG 2.2 AA violations on /status in light theme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/status");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("AC-7 AC-15 has no WCAG 2.2 AA violations on /status in dark theme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/status");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("AC-7 AC-15 has no WCAG 2.2 AA violations on /status at 375 pixels", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/status");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("/design returns 404 in production", async ({ page }) => {
    const response = await page.goto("/design");
    expect(response?.status()).toBe(404);
  });

  test("sidebar navigation, toggle, and theme control work by keyboard", async ({
    page,
  }) => {
    await page.goto("/status");

    const navLink = page.getByRole("link", { name: "System status" });
    await expect(navLink).toHaveAttribute("aria-current", "page");

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();

    const toggle = page.getByRole("button", { name: "Toggle Sidebar" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(navLink).toBeVisible();

    const themeButton = page.getByRole("button", { name: "Theme" });
    await themeButton.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("the menu button opens the sheet and Escape returns focus at 375 pixels", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/status");

    const toggle = page.getByRole("button", { name: "Toggle Sidebar" });
    await toggle.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        dialog.evaluate((node) => node.contains(document.activeElement)),
      )
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("cumulative layout shift on /status stays at or below 0.1", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) {
            (window as unknown as { __cls: number }).__cls += shift.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/status");
    await page.waitForTimeout(1000);
    const cls = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls,
    );
    expect(cls).toBeLessThanOrEqual(0.1);
  });
});
