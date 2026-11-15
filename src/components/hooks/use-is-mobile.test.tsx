// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-is-mobile";

afterEach(() => vi.unstubAllGlobals());

describe("useIsMobile", () => {
  it.each([false, true])(
    "AC-2 reflects the browser media query when it matches %s",
    (matches) => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({
          matches,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(matches);
      expect(window.matchMedia).toHaveBeenCalledWith(
        "not all and (min-width: 768px)",
      );
    },
  );

  it("AC-2 updates on viewport changes and removes its listener on unmount", () => {
    let matches = false;
    let notify = () => {};
    const removeEventListener = vi.fn();
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_event: string, listener: () => void) => {
        notify = listener;
      },
      removeEventListener,
    }));
    const { result, unmount } = renderHook(() => useIsMobile());
    act(() => {
      matches = true;
      notify();
    });
    expect(result.current).toBe(true);
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", notify);
  });
});
