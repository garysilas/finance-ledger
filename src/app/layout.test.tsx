import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("geist/font/sans", () => ({
  GeistSans: { variable: "--font-geist-sans" },
}));
vi.mock("geist/font/mono", () => ({
  GeistMono: { variable: "--font-geist-mono" },
}));
vi.mock("@/components/shell/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import RootLayout, { metadata } from "./layout";

describe("RootLayout", () => {
  it("AC-8 applies the Geist font variables and lang to the document", () => {
    const markup = renderToString(
      <RootLayout>
        <p>page body</p>
      </RootLayout>,
    );
    expect(markup).toContain('lang="en"');
    expect(markup).toContain("--font-geist-sans");
    expect(markup).toContain("--font-geist-mono");
    expect(markup).toContain("page body");
  });

  it("names the app for the tab title", () => {
    expect(metadata).toMatchObject({ title: "Ledger" });
  });
});
