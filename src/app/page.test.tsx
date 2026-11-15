// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

import Home from "./page";

describe("Home", () => {
  it("AC-4 sends a temporary redirect to /status", () => {
    Home();
    expect(redirect).toHaveBeenCalledWith("/status");
  });
});
