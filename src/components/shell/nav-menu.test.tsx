// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";

const { pathname } = vi.hoisted(() => ({ pathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: pathname }));
import { NavMenu } from "./nav-menu";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("NavMenu", () => {
  it.each([
    ["/status", true],
    ["/status/details", true],
    ["/status-other", false],
    ["/design", false],
  ])("AC-3 marks only matching destinations current at %s", (path, current) => {
    pathname.mockReturnValue(path);
    render(
      <SidebarProvider persist={false}>
        <NavMenu />
      </SidebarProvider>,
    );
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    const link = nav.getByRole("link", { name: "System status" });
    expect(link).toHaveAttribute("href", "/status");
    if (current) expect(link).toHaveAttribute("aria-current", "page");
    else expect(link).not.toHaveAttribute("aria-current");
    expect(nav.getAllByRole("link")).toHaveLength(1);
  });
});
