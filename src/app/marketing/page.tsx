import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Solutions — Full Chaos Dev Health",
    description:
        "Pick the buyer narrative that maps to your role. Each page links to the product surfaces that answer your operating questions.",
};

type Buyer = {
    slug: string;
    eyebrow: string;
    title: string;
    description: string;
    surfaces: string;
};

const BUYERS: ReadonlyArray<Buyer> = [
    {
        slug: "vp-engineering",
        eyebrow: "For VP Engineering",
        title: "Know where delivery is constrained",
        description:
            "Engineering Operating Review, Completion Forecast, Bottleneck, Investment, Reliability.",
        surfaces: "Operating cadence + capacity + reliability",
    },
    {
        slug: "platform-devex",
        eyebrow: "For Platform / DevEx",
        title: "Find systemic friction across the pipeline",
        description: "CI/CD + TestOps, Review Load, Work Graph, Hotspots, Data Health.",
        surfaces: "Pipeline + review + data health",
    },
    {
        slug: "engineering-manager",
        eyebrow: "For Engineering Managers",
        title: "Coach teams with evidence, not rankings",
        description:
            "Team Flow, WIP & Review bottlenecks, Single-person reflection, Sustainability, Evidence-backed recommendations.",
        surfaces: "Flow + reflection + sustainability",
    },
    {
        slug: "cto-architecture",
        eyebrow: "For CTO / Architecture",
        title: "See where change pressure is compounding risk",
        description:
            "Compounding Risk, Complexity trends, Ownership concentration, Hotspots, Incident correlation.",
        surfaces: "Architectural risk + ownership",
    },
];

export default function MarketingHubPage() {
    return (
        <>
            {/* Hero */}
            <section className="mx-auto max-w-7xl px-6 pb-16 pt-16 sm:pt-24">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                        Solutions
                    </p>
                    <h1 className="mt-6 font-(--font-display) text-4xl leading-tight sm:text-5xl">
                        Engineering intelligence,{" "}
                        <span className="text-(--accent)">framed by your role</span>
                    </h1>
                    <p className="mx-auto mt-6 max-w-2xl text-lg text-(--ink-muted)">
                        Same platform, four buyer narratives. Each page maps the operating questions
                        you actually ask to the product surfaces that answer them.
                    </p>
                </div>
            </section>

            {/* Buyer cards */}
            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="grid gap-5 sm:grid-cols-2">
                    {BUYERS.map((buyer) => (
                        <Link
                            key={buyer.slug}
                            href={`/marketing/${buyer.slug}`}
                            className="group block rounded-3xl border border-(--border) bg-(--card-80) p-8 transition hover:-translate-y-1 hover:border-(--accent)/50"
                        >
                            <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                                {buyer.eyebrow}
                            </p>
                            <h2 className="mt-4 font-(--font-display) text-2xl group-hover:text-(--accent) transition-colors">
                                {buyer.title}
                            </h2>
                            <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                                {buyer.description}
                            </p>
                            <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                                {buyer.surfaces}
                            </p>
                            <p className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-(--accent)">
                                Read the narrative
                                <span aria-hidden="true">→</span>
                            </p>
                        </Link>
                    ))}
                </div>
            </section>

            {/* No surveillance pillar (compact form, links to full buyer pages) */}
            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="rounded-3xl border border-(--border) bg-(--card-80) p-8 text-center sm:p-12">
                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                        Our posture
                    </p>
                    <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                        No surveillance, just signal
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-sm text-(--ink-muted)">
                        No per-person scoring. No leaderboards. Individual views are for
                        self-reflection only. Every metric traces to evidence you can inspect.
                    </p>
                    <p className="mx-auto mt-8 max-w-2xl text-center text-xs uppercase tracking-[0.2em] text-(--accent)">
                        Learning, not judgment.
                    </p>
                </div>
            </section>

            {/* CTA */}
            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="rounded-3xl border border-(--border) bg-(--card-80) p-8 text-center sm:p-12">
                    <h2 className="font-(--font-display) text-3xl sm:text-4xl">
                        Ready to see where your effort is going?
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-sm text-(--ink-muted)">
                        Start with the Community plan — free forever. Pick the buyer page that fits
                        your role above to see exactly which surfaces map to your operating
                        questions.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                        <Link
                            href="/auth/signup"
                            className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            Get started free
                        </Link>
                        <Link
                            href="/marketing/pricing"
                            className="rounded-full border border-(--border) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            See pricing
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
