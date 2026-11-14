// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const theme = vi.hoisted(() => ({
  current: "system",
  setTheme: vi.fn(),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: theme.current, setTheme: theme.setTheme }),
}));

import { ThemeControl } from "./theme-control";

beforeEach(() => {
  theme.current = "system";
  // jsdom lacks the pointer capture APIs Radix menus use.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => vi.clearAllMocks());

describe("ThemeControl", () => {
  it("AC-6 opens on a labelled button and lists the three choices", async () => {
    const user = userEvent.setup();
    render(<ThemeControl />);
    await user.click(screen.getByRole("button", { name: "Theme" }));
    const menu = await screen.findByRole("menu");
    for (const name of ["Light", "Dark", "System"]) {
      expect(
        within(menu).getByRole("menuitemradio", { name }),
      ).toBeInTheDocument();
    }
  });

  it("AC-6 checks the active theme and applies a new choice", async () => {
    theme.current = "dark";
    const user = userEvent.setup();
    render(<ThemeControl />);
    await user.click(screen.getByRole("button", { name: "Theme" }));
    expect(
      await screen.findByRole("menuitemradio", { name: "Dark" }),
    ).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
    expect(theme.setTheme).toHaveBeenCalledWith("light");
  });
});
