import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "For Platform / DevEx — Full Chaos Dev Health",
    description: "Find systemic friction across repos, CI, reviews, and deployments.",
};

const SURFACES: Array<{
    label: string;
    title: string;
    description: string;
    href: string;
    icon: React.ReactElement;
    comingSoon?: boolean;
}> = [
    {
        label: "CI/CD + TestOps",
        title: "CI/CD + TestOps",
        description: "Find systemic friction across repos, CI, reviews, and deployments.",
        href: "/testops",
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
            </svg>
        ),
    },
    {
        label: "Review Load",
        title: "Review Load",
        description:
            "Identify bottlenecks in PR reviews and systemic latency in the code review process.",
        href: "/ai/review-load",
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
            </svg>
        ),
    },
    {
        label: "Work Graph",
        title: "Work Graph",
        description: "Map the dependencies and connections between teams, repos, and issues.",
        href: "/work",
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
                <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
            </svg>
        ),
    },
    {
        label: "Hotspots",
        title: "Hotspots",
        description: "Discover complex files with high churn that slow down feature delivery.",
        href: "/code",
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M12 2v20" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
        ),
    },
    {
        label: "Data Health",
        title: "Connector / Data Health",
        description: "Monitor the reliability of data from Jira, GitHub, and GitLab connectors.",
        href: "/data-health",
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5V19A9 3 0 0 0 21 19V5" />
                <path d="M3 12A9 3 0 0 0 21 12" />
            </svg>
        ),
    },
];

export default function PlatformDevexPage() {
    return (
        <>
            {/* Hero */}
            <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 sm:pt-24">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                        For Platform / DevEx
                    </p>
                    <h1 className="mt-6 font-(--font-display) text-4xl leading-tight sm:text-5xl lg:text-6xl">
                        Find systemic friction across repos, CI, reviews, and deployments
                    </h1>
                    <p className="mx-auto mt-6 max-w-2xl text-lg text-(--ink-muted)">
                        Identify systemic blockers, reduce coordination debt, and monitor the health
                        of your delivery pipeline. Optimize the developer experience across your
                        entire organization.
                    </p>
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                        <Link
                            href="/auth/signup"
                            className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            Start for free
                        </Link>
                        <Link
                            href="/marketing/pricing"
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            See pricing
                        </Link>
                    </div>
                </div>
            </section>

            {/* Primary Surfaces */}
            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {SURFACES.map((surface) => {
                        const cardInner = (
                            <>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex size-9 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
                                            {surface.icon}
                                        </div>
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                                            {surface.label}
                                        </p>
                                    </div>
                                    {surface.comingSoon && (
                                        <span className="rounded-full border border-(--card-stroke) bg-(--card) px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                                            Coming soon
                                        </span>
                                    )}
                                </div>
                                <h3 className="mt-4 font-(--font-display) text-lg">
                                    {surface.title}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-(--ink-muted)">
                                    {surface.description}
                                </p>
                            </>
                        );
                        if (surface.comingSoon) {
                            return (
                                <div
                                    key={surface.label}
                                    className="block rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 opacity-90"
                                    aria-disabled="true"
                                >
                                    {cardInner}
                                </div>
                            );
                        }
                        return (
                            <Link
                                key={surface.label}
                                href={surface.href}
                                className="group block rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 transition hover:-translate-y-1"
                            >
                                {cardInner}
                            </Link>
                        );
                    })}
                </div>
            </section>

            {/* No surveillance, just signal — canonical section, identical across all buyer pages */}
            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 sm:p-12">
                    <div className="mx-auto max-w-3xl text-center">
                        <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                            Our posture
                        </p>
                        <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                            No surveillance, just signal
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-sm text-(--ink-muted)">
                            Engineering intelligence without per-seat surveillance pricing — or
                            per-person scoring. Every metric is a system signal, not a performance
                            rating. Every insight traces to evidence you can inspect.
                        </p>
                    </div>

                    <ul className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
                        {[
                            {
                                id: "ns-no-leaderboards",
                                title: "No leaderboards",
                                body: "We do not rank people against each other. Ever.",
                            },
                            {
                                id: "ns-team-first",
                                title: "Team and repo first",
                                body: "Aggregation defaults to systems, not individuals.",
                            },
                            {
                                id: "ns-reflection-only",
                                title: "Individual views are reflection-only",
                                body: "Single-person surfaces exist for self-reflection and coaching — never peer comparison.",
                            },
                            {
                                id: "ns-trends-over-absolutes",
                                title: "Trends over absolutes",
                                body: "Direction matters more than point values. We benchmark you against your own baseline.",
                            },
                            {
                                id: "ns-evidence-over-scores",
                                title: "Evidence over scores",
                                body: "Every signal links back to the PRs, reviews, commits, and incidents behind it.",
                            },
                        ].map((pillar) => (
                            <li
                                key={pillar.id}
                                className="rounded-2xl border border-(--card-stroke) bg-(--card) p-5"
                            >
                                <p className="font-(--font-display) text-base">{pillar.title}</p>
                                <p className="mt-2 text-sm leading-relaxed text-(--ink-muted)">
                                    {pillar.body}
                                </p>
                            </li>
                        ))}
                    </ul>

                    <p className="mx-auto mt-10 max-w-2xl text-center text-xs uppercase tracking-[0.2em] text-(--accent)">
                        Learning, not judgment.
                    </p>
                </div>
            </section>

            {/* Final CTA */}
            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 text-center sm:p-12">
                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                        Open source
                    </p>
                    <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                        Built in the open, for everyone
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-sm text-(--ink-muted)">
                        Full Chaos Dev Health is fully open source. Deploy it on your
                        infrastructure, audit every metric computation, and contribute to the
                        roadmap. Accessibility over extraction.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                        <Link
                            href="/auth/signup"
                            className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            Get started free
                        </Link>
                        <a
                            href="https://github.com/full-chaos/dev-health-ops"
                            target="_blank"
                            rel="noopener"
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            Star on GitHub
                        </a>
                    </div>
                </div>
            </section>
        </>
    );
}
