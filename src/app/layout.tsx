import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

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

const runtimeConfigSrc = `${process.env.BASE_PATH ?? ""}/runtime-config.js`;
const themeInitSrc = `${process.env.BASE_PATH ?? ""}/theme-init.js`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" data-palette="fullchaos" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}
      >
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- must run before first paint; external src covered by CSP 'self' */}
        <script src={runtimeConfigSrc} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- must run before first paint to prevent FOUC; external src covered by CSP 'self' */}
        <script src={themeInitSrc} />
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
