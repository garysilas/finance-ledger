// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/status" }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));
// HealthIndicator is an async server component probing the database; the
// streaming contract and its labels are covered in health-indicator.test.
vi.mock("@/components/shell/health-indicator", () => ({
  HealthIndicator: () => <a href="/status">probe</a>,
  HealthIndicatorFallback: () => null,
}));

import { AppSidebar } from "./app-sidebar";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("AppSidebar", () => {
  it("AC-1 renders the wordmark, nav, health, and theme control in one frame", () => {
    render(
      <SidebarProvider persist={false}>
        <AppSidebar />
      </SidebarProvider>,
    );
    expect(screen.getByRole("link", { name: "Ledger" })).toHaveAttribute(
      "href",
      "/",
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav).getByRole("link", { name: "System status" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "probe" })).toHaveAttribute(
      "href",
      "/status",
    );
    expect(screen.getByRole("button", { name: "Theme" })).toBeInTheDocument();
  });
});
