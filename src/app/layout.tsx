import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";

const bodyFont = Inter({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const displayFont = Inter({
  variable: "--font-display",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dev Health Ops",
  description: "Developer Health Ops cockpit.",
};

const themeScript = `
(() => {
  try {
    const storedTheme = localStorage.getItem("theme");
    const storedPalette = localStorage.getItem("palette");
    const normalizedPalette = storedPalette === "tailwind" ? "echarts" : storedPalette;
    if (
      normalizedPalette === "material" ||
      normalizedPalette === "echarts" ||
      normalizedPalette === "fullchaos" ||
      normalizedPalette === "fullchaos-cosmic-train" ||
      normalizedPalette === "flat"
    ) {
      document.documentElement.dataset.palette = normalizedPalette;
    }
    if (storedTheme === "light" || storedTheme === "dark") {
      document.documentElement.dataset.theme = storedTheme;
      document.documentElement.style.colorScheme = storedTheme;
    }
  } catch {}
})();
`;

const runtimeConfigSrc = `${process.env.BASE_PATH ?? ""}/runtime-config.js`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the per-request nonce injected by the middleware CSP implementation.
  // Falls back to undefined in static export mode (no middleware, no nonce).
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  return (
    <html lang="en" data-theme="dark" data-palette="fullchaos" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}
      >
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- must run before paint to prevent FOUC */}
        <script src={runtimeConfigSrc} nonce={nonce} suppressHydrationWarning />
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
