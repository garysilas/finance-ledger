// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({
  notFound,
  useRouter: () => ({ refresh: vi.fn() }),
}));

import DesignPage from "./page";

afterEach(() => vi.unstubAllEnvs());

describe("DesignPage", () => {
  it("AC-14 renders every reference section on static sample values", () => {
    render(<DesignPage />);
    expect(
      screen.getByRole("heading", { name: "Design reference", level: 1 }),
    ).toBeInTheDocument();
    for (const name of [
      "Type scale",
      "Tokens",
      "Money",
      "Dates and freshness",
      "Status badges",
      "State patterns",
    ]) {
      expect(
        screen.getByRole("heading", { name, level: 2 }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("status-over")).toBeInTheDocument();
    expect(screen.getByText("net refund")).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("AC-14 is absent from a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => DesignPage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
