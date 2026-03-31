import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
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
  metadataBase: new URL("https://www.fullchaos.dev"),
  title: {
    default: "Dev Health — Engineering Effort Analytics",
    template: "%s | Dev Health",
  },
  description:
    "Open-source analytics platform for team operating modes and developer health. See where effort is invested and what it costs your people.",
  openGraph: {
    title: "Dev Health — Engineering Effort Analytics",
    description:
      "Understand where human effort is actually being invested, and the cost to people when certain work dominates.",
    siteName: "Dev Health",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Dev Health — Engineering Effort Analytics",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dev Health — Engineering Effort Analytics",
    description:
      "Open-source analytics for team operating modes and developer health.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
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
        <Script src={runtimeConfigSrc} strategy="beforeInteractive" />
        <Script src={themeInitSrc} strategy="beforeInteractive" />
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
