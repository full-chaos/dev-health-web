import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";
import { getServerEnv } from "@/lib/config";

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
  metadataBase: new URL("https://www.fullchaos.dev"),
  title: {
    default: "Full Chaos Dev Health — Engineering Effort Analytics",
    template: "%s | Full Chaos Dev Health",
  },
  description:
    "Open-source analytics platform for team operating modes and developer health. See where effort is invested and what it costs your people.",
  openGraph: {
    title: "Full Chaos Dev Health — Engineering Effort Analytics",
    description:
      "Understand where human effort is actually being invested, and the cost to people when certain work dominates.",
    siteName: "Full Chaos Dev Health",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Full Chaos Dev Health — Engineering Effort Analytics",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Full Chaos Dev Health — Engineering Effort Analytics",
    description:
      "Open-source analytics for team operating modes and developer health.",
    images: ["/opengraph-image.png"],
  },
};

const basePath = getServerEnv().BASE_PATH ?? "";
const runtimeConfigSrc = `${basePath}/runtime-config.js`;
const themeInitSrc = `${basePath}/theme-init.js`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-palette="fullchaos-infinity-knot-redux"
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}
      >
        {/* Plain <script src> — not next/script <Script>. With Turbopack,
            `<Script strategy="beforeInteractive">` emits an inline bootstrap
            tag that Next auto-decorates with a CSP nonce; browsers strip
            that nonce attribute after validating CSP, which produces a
            server(`nonce=""`) / client(`nonce=undefined`) hydration diff.
            Plain external scripts have no inline content, so no nonce is
            ever written or stripped and hydration is clean. Both must load
            before first paint — runtime-config.js bootstraps window config,
            theme-init.js applies persisted theme to prevent FOUC. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- external src is covered by CSP 'self'; must run pre-hydration */}
        <script src={runtimeConfigSrc} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- external src is covered by CSP 'self'; must run pre-hydration to prevent FOUC */}
        <script src={themeInitSrc} />
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
