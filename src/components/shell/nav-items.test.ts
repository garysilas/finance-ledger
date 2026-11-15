import { describe, expect, it } from "vitest";
import { navItems } from "./nav-items";

describe("navigation registry", () => {
  it("AC-3 lists the built system destination without placeholders", () => {
    expect(
      navItems.map(({ href, label, group, match }) => ({
        href,
        label,
        group,
        match,
      })),
    ).toEqual([
      {
        href: "/status",
        label: "System status",
        group: "system",
        match: "prefix",
      },
    ]);
  });
});
