import type { Metadata } from "next";
import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";

export const metadata: Metadata = {
    title: "Solutions — Full Chaos Dev Health",
    description:
        "Explore Context Fabric and buyer-aligned Dev Health solutions for engineering leaders, platform teams, managers, and architecture.",
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
                        Start with Context Fabric, then explore the operating questions and product
                        surfaces that matter most to your role.
                    </p>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-12">
                <Link
                    href="/marketing/context-fabric"
                    className="group grid gap-8 rounded-[2rem] border border-(--accent)/35 bg-(--accent)/10 p-8 transition hover:-translate-y-1 hover:border-(--accent)/60 sm:p-10 lg:grid-cols-[1fr_0.8fr] lg:items-center"
                >
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            Product capability
                        </p>
                        <h2 className="mt-4 font-(--font-display) text-3xl transition-colors group-hover:text-(--accent) sm:text-4xl">
                            Context Fabric
                        </h2>
                        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-(--ink-muted)">
                            Connect planning, code, delivery, reliability, and source-health evidence
                            so people and agents can understand what is actually happening—not just
                            what one tracker says.
                        </p>
                        <p className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-(--accent)">
                            {CTA_LABELS.viewAskDevDocs}
                            <span aria-hidden="true">→</span>
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            "Project status",
                            "Team health",
                            "Delivery blockers",
                            "Evidence and context",
                        ].map((label) => (
                            <span
                                key={label}
                                className="rounded-2xl border border-(--card-stroke) bg-(--card-80) px-4 py-4 text-center text-sm"
                            >
                                {label}
                            </span>
                        ))}
                    </div>
                </Link>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="grid gap-5 sm:grid-cols-2">
                    {BUYERS.map((buyer) => (
                        <Link
                            key={buyer.slug}
                            href={`/marketing/${buyer.slug}`}
                            className="group block rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 transition hover:-translate-y-1 hover:border-(--accent)/50"
                        >
                            <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                                {buyer.eyebrow}
                            </p>
                            <h2 className="mt-4 font-(--font-display) text-2xl transition-colors group-hover:text-(--accent)">
                                {buyer.title}
                            </h2>
                            <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                                {buyer.description}
                            </p>
                            <p className="mt-6 text-label-caps uppercase tracking-[0.2em] text-(--ink-muted)">
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

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 text-center sm:p-12">
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

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 text-center sm:p-12">
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
                            {CTA_LABELS.getStartedFree}
                        </Link>
                        <Link
                            href="/marketing/pricing"
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            {CTA_LABELS.seePricing}
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
