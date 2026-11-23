"use client";

import {
  ChakraProvider,
  createSystem,
  defaultConfig,
  defineConfig,
} from "@chakra-ui/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/toaster";

// Same theme setup as the portfolio (teal accent, dark by default, system font).
const config = defineConfig({
  globalCss: {
    html: {
      scrollBehavior: "smooth",
      "@media (prefers-reduced-motion: reduce)": {
        scrollBehavior: "auto",
      },
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: {
          value: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        },
        body: {
          value: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        },
      },
    },
  },
});

const system = createSystem(defaultConfig, config);

export function Provider({ children }: { children: ReactNode }) {
  return (
    <ChakraProvider value={system}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
      >
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </ChakraProvider>
  );
}
