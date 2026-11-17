import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { monthCandidate } from "./month-query";

// covers spec 0007 month bounds: posted rows join by posted date, pending
// rows by provider date, inside the owner's calendar month.
describe("monthCandidate", () => {
  it("bounds a regular month by the first of the next month, exclusive", () => {
    const candidate = monthCandidate("2031-01");
    expect(candidate).not.toBeNull();
    expect(candidate!.lower).toBe("2031-01-01");
    expect(candidate!.upper).toBe("2031-02-01");
    expect(candidate!.posted).toContain("t.posted_date >= $2");
    expect(candidate!.posted).toContain("t.posted_date < $3");
    expect(candidate!.pending).toContain("t.provider_date >= $2");
    expect(candidate!.pending).toContain("t.provider_date < $3");
  });

  it("rolls December into January of the next year", () => {
    const candidate = monthCandidate("2031-12");
    expect(candidate!.upper).toBe("2032-01-01");
    expect(candidate!.posted).toContain("< $3");
  });

  it("uses an inclusive final day for 9999-12, never an out of range month", () => {
    const candidate = monthCandidate("9999-12");
    expect(candidate).not.toBeNull();
    expect(candidate!.upper).toBe("9999-12-31");
    expect(candidate!.posted).toContain("t.posted_date <= $3");
    expect(candidate!.pending).toContain("t.provider_date <= $3");
  });

  it("returns null for text that is not a calendar month", () => {
    expect(monthCandidate("2031-13")).toBeNull();
    expect(monthCandidate("not-a-month")).toBeNull();
    expect(monthCandidate("2031-1")).toBeNull();
  });
});
