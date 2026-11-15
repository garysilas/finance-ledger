// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { HealthLink } from "./health-link";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("HealthLink", () => {
  it.each([
    ["ok", "Available"],
    ["settings", "Configuration needed"],
    ["failed", "Unavailable"],
    ["checking", "Checking database"],
  ] as const)(
    "AC-5 exposes the %s state with an icon and safe label",
    (kind, label) => {
      render(
        <SidebarProvider persist={false}>
          <HealthLink kind={kind} label={label} />
        </SidebarProvider>,
      );
      const link = screen.getByRole("link", { name: `Database: ${label}` });
      expect(link).toHaveAttribute("href", "/status");
      expect(link).toHaveTextContent(label);
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    },
  );

  it("AC-5 shows the accessible health meaning in a collapsed tooltip", async () => {
    const user = userEvent.setup();
    render(
      <SidebarProvider defaultOpen={false} persist={false}>
        <HealthLink kind="failed" label="Unavailable" />
      </SidebarProvider>,
    );
    await user.hover(
      screen.getByRole("link", { name: "Database: Unavailable" }),
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Database: Unavailable",
    );
  });
});
