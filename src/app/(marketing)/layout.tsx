import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BetaBadge } from "@/components/BetaBadge";
import fcLogo from "@/assets/fc-logo.png";

export const metadata: Metadata = {
  title:
    "Full Chaos Dev Health (Beta) — Where is your engineering effort going?",
  description:
    "Full Chaos Dev Health is an open-source analytics platform for team operating modes and developer health. See where effort is invested and what it costs your people.",
  openGraph: {
    title: "Full Chaos Dev Health (Beta) — Engineering Effort Analytics",
    description:
      "Understand where human effort is actually being invested, and the cost to people when certain work dominates.",
    url: "/",
    type: "website",
    siteName: "Full Chaos Dev Health",
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
    title: "Full Chaos Dev Health (Beta) — Engineering Effort Analytics",
    description:
      "Open-source analytics for team operating modes and developer health.",
    images: ["/opengraph-image.png"],
  },
};

const FOOTER_LINKS = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "/pricing" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Who it's for", href: "#who-its-for" },
  ],
  Resources: [
    {
      label: "Documentation",
      href: "https://github.com/full-chaos/dev-health-ops",
      external: true,
    },
    {
      label: "GitHub",
      href: "https://github.com/full-chaos/dev-health-ops",
      external: true,
    },
  ],
  Legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-(image:--hero-gradient) text-foreground">
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center"
            aria-label="Full Chaos Dev Health home"
          >
            <Image
              src={fcLogo}
              alt="Full Chaos Dev Health logo"
              className="mr-2 h-10 w-auto"
            />
            <div className="flex flex-col">
              <span className="text-lg font-semibold leading-tight tracking-tight">
                Full Chaos
              </span>
              <span className="text-xs font-semibold tracking-tight text-(--ink-muted)">
                Dev Health
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
              OSS
            </span>
            <BetaBadge />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-sm text-(--ink-muted) transition hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/auth/signin"
            className="text-sm text-(--ink-muted) transition hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-full bg-(--accent) px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="border-t border-(--card-stroke)">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-semibold">Full Chaos Dev Health</p>
            <p className="mt-2 text-sm text-(--ink-muted)">
              Open-source analytics for team operating modes and developer
              health.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                {group}
              </p>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-(--ink-muted) transition hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-(--ink-muted) transition hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-(--card-stroke)">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
            <p className="text-xs text-(--ink-muted)">
              &copy; {new Date().getFullYear()} Full Chaos Studios. All rights
              reserved.
            </p>
            <p className="text-xs text-(--ink-muted)">
              Learning, not judgment.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
