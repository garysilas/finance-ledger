import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("design reference", () => {
  test("AC-14 includes every semantic token and its foreground pair", async ({
    page,
  }) => {
    await page.goto("/design");
    const tokens = await page
      .getByRole("region", { name: "Tokens", exact: true })
      .getByRole("listitem")
      .allTextContents();
    expect(tokens.map((token) => token.trim())).toEqual(
      expect.arrayContaining([
        "background",
        "foreground",
        "card",
        "card-foreground",
        "popover",
        "popover-foreground",
        "primary",
        "primary-foreground",
        "secondary",
        "secondary-foreground",
        "muted",
        "muted-foreground",
        "accent",
        "accent-foreground",
        "destructive",
        "destructive-foreground",
        "info",
        "info-foreground",
        "success",
        "success-foreground",
        "warning",
        "warning-foreground",
        "border",
        "input",
        "ring",
        "sidebar",
        "sidebar-foreground",
        "sidebar-primary",
        "sidebar-primary-foreground",
        "sidebar-accent",
        "sidebar-accent-foreground",
        "sidebar-border",
        "sidebar-ring",
        "status-over",
        "status-over-foreground",
        "status-near",
        "status-near-foreground",
        "status-pending",
        "status-pending-foreground",
        "status-stale",
        "status-stale-foreground",
        "chart-1",
        "chart-2",
        "chart-3",
        "chart-4",
        "chart-5",
      ]),
    );
  });

  test("AC-9 AC-14 shows each money context with exact readable values", async ({
    page,
  }) => {
    await page.goto("/design");
    const money = page.getByRole("region", { name: "Money", exact: true });
    await expect(money.getByText("Transaction outflow:")).toContainText(
      "$12.99",
    );
    await expect(money.getByText("Transaction inflow:")).toContainText(
      "+$2,500.00",
    );
    await expect(money.getByText("Large units:")).toContainText(
      "$1,234,567,890,123,456.78",
    );
    await expect(money.getByText("Unknown currency:")).toContainText(
      "Amount unavailable",
    );
    const digits = money.getByText("$12.99", { exact: true });
    expect(
      await digits.evaluate(
        (node) => getComputedStyle(node).fontVariantNumeric,
      ),
    ).toContain("tabular-nums");
  });

  test("AC-11 disables skeleton motion when reduced motion is requested", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/design");
    const loading = page.getByRole("status", { name: "Loading sample rows" });
    await expect(loading).toHaveAttribute("aria-busy", "true");
    const animations = await loading.evaluate((node) =>
      Array.from(
        node.querySelectorAll("*"),
        (child) => getComputedStyle(child).animationName,
      ),
    );
    expect(animations.every((name) => name === "none")).toBe(true);
  });

  test("AC-11 AC-14 supports keyboard actions and announces a completed retry", async ({
    page,
  }) => {
    await page.goto("/design");
    const action = page.getByRole("button", { name: "Take an action" });
    await action.focus();
    await expect(action).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(action).toBeFocused();
    await expect(action).not.toHaveCSS("box-shadow", "none");
    const retry = page.getByRole("button", { name: "Check again" });
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Check complete.")).toBeVisible();
  });
  test("renders the token and primitive reference", async ({ page }) => {
    const response = await page.goto("/design");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Design reference", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("$1,234.56").first()).toBeVisible();
    await expect(page.getByText("Amount unavailable")).toBeVisible();
    await expect(page.getByText("net refund").first()).toBeVisible();
    await expect(page.getByText("November 2026")).toBeVisible();
    await expect(page.getByText("Over budget")).toBeVisible();
  });

  test("AC-7 AC-15 has no WCAG 2.2 AA violations in light theme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/design");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("AC-7 AC-15 has no WCAG 2.2 AA violations in dark theme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/design");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("AC-7 AC-15 has no WCAG 2.2 AA violations at 375 pixels", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/design");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
