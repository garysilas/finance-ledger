"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type React from "react";

export function ThemeProvider(
  props: React.ComponentProps<typeof NextThemesProvider>,
) {
  return <NextThemesProvider {...props} />;
}
