import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Mono } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "@/components/ThemeToggle";

const bodyFont = Noto_Sans({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const displayFont = Noto_Sans({
  variable: "--font-display",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

const monoFont = Noto_Sans_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" data-palette="material" suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <div className="fixed right-6 top-6 z-50">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
