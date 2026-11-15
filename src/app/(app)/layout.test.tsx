// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/ui/sidebar";

const cookieValue = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieValue }),
}));
// The shell chrome is covered by its own tests; keep the real ui Sidebar so
// the cookie driven defaultOpen still lands on data-state.
vi.mock("@/components/shell/app-sidebar", () => ({
  AppSidebar: () => <Sidebar collapsible="icon" variant="inset" />,
}));

import AppLayout from "./layout";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function renderLayout() {
  render(await AppLayout({ children: <p>page body</p> }));
  return document.querySelector('[data-slot="sidebar"]');
}

describe("AppLayout", () => {
  it("AC-1 expands the sidebar when the cookie is absent", async () => {
    cookieValue.mockReturnValue(undefined);
    const sidebar = await renderLayout();
    expect(sidebar).toHaveAttribute("data-state", "expanded");
    expect(sidebar).toHaveAttribute("data-collapsible", "");
  });

  it("AC-1 restores the collapsed icon rail from the cookie", async () => {
    cookieValue.mockReturnValue({ value: "false" });
    const sidebar = await renderLayout();
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-collapsible", "icon");
  });

  it("exposes a skip link to the main content and a labelled toggle", async () => {
    cookieValue.mockReturnValue(undefined);
    await renderLayout();
    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#main");
    expect(document.getElementById("main")).toContainElement(
      screen.getByText("page body"),
    );
    expect(
      screen.getByRole("button", { name: "Toggle Sidebar" }),
    ).toBeInTheDocument();
  });
});
