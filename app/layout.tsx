import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Provider } from "@/components/ui/provider";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: { default: `${site.name} | Student Planner`, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: site.themeColor,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
