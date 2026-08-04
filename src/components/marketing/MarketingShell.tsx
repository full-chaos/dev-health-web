import Image from "next/image";
import Link from "next/link";
import { BetaBadge } from "@/components/BetaBadge";
import fcLogo from "@/assets/fc-logo.png";
import { CTA_LABELS } from "@/lib/design/cta";

/**
 * Shared chrome for every page rendered under the marketing surface.
 *
 * Used by:
 *   - `src/app/(marketing)/layout.tsx`  → wraps `/` (the home page)
 *   - `src/app/marketing/layout.tsx`    → wraps every `/marketing/*` route
 *
 * The two layout files exist because the canonical home (`/`) stays at the root
 * URL while every other marketing surface lives under `/marketing/*`. Both layouts
 * are thin wrappers around this component so the nav + footer are defined exactly
 * once.
 */

const FOOTER_LINKS: Record<
    string,
    ReadonlyArray<{ label: string; href: string; external?: boolean }>
> = {
    Product: [
        { label: "Context Fabric", href: "/marketing/context-fabric" },
        { label: "Features", href: "/#features" },
        { label: "Pricing", href: "/marketing/pricing" },
        { label: "How it works", href: "/#how-it-works" },
        { label: "Who it's for", href: "/#who-its-for" },
    ],
    Solutions: [
        { label: "VP Engineering", href: "/marketing/vp-engineering" },
        { label: "Platform / DevEx", href: "/marketing/platform-devex" },
        { label: "Engineering Managers", href: "/marketing/engineering-manager" },
        { label: "CTO / Architecture", href: "/marketing/cto-architecture" },
    ],
    Resources: [
        { label: "About", href: "/marketing/about" },
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
        { label: "Privacy", href: "/marketing/privacy" },
        { label: "Security", href: "/marketing/security" },
        { label: "Terms", href: "/marketing/terms" },
        {
            label: "Contact",
            href: "mailto:support@fullchaos.studio",
            external: true,
        },
    ],
};

export function MarketingShell({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="min-h-screen bg-(image:--hero-gradient) text-foreground">
            <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
                <div className="flex items-center gap-3">
                    <Link
                        href="/"
                        className="flex items-center"
                        aria-label={CTA_LABELS.devHealthHome}
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
                        <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-0.5 text-label-caps font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                            OSS
                        </span>
                        <BetaBadge />
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Link
                        href="/marketing"
                        className="text-sm text-(--ink-muted) transition hover:text-foreground"
                    >
                        {CTA_LABELS.solutions}
                    </Link>
                    <Link
                        href="/marketing/pricing"
                        className="text-sm text-(--ink-muted) transition hover:text-foreground"
                    >
                        {CTA_LABELS.pricing}
                    </Link>
                    <Link
                        href="/auth/signin"
                        className="text-sm text-(--ink-muted) transition hover:text-foreground"
                    >
                        {CTA_LABELS.signIn}
                    </Link>
                    <Link
                        href="/auth/signup"
                        className="rounded-full bg-(--accent) px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
                    >
                        {CTA_LABELS.getStarted}
                    </Link>
                </div>
            </nav>

            <main>{children}</main>

            <footer className="border-t border-(--card-stroke)">
                <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                        <p className="text-lg font-semibold">Full Chaos Dev Health</p>
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            Open-source analytics for team operating modes and developer health.
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
                                        {link.external ? (
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
                        <p className="text-xs text-(--ink-muted)">Learning, not judgment.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
