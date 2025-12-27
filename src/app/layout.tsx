import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "@/components/ThemeToggle";

const bodyFont = IBM_Plex_Sans({
  variable: "--font-body",
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
});

const displayFont = Fraunces({
  variable: "--font-display",
  weight: ["400", "600"],
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dev Health Ops",
  description: "Developer health control room.",
};

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
      document.documentElement.style.colorScheme = stored;
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
    <html lang="en" suppressHydrationWarning>
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
