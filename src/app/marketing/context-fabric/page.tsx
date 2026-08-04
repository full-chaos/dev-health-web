import type { Metadata } from "next";
import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";

export const metadata: Metadata = {
    title: "Context Fabric — Full Chaos Dev Health",
    description:
        "Connect planning, code, delivery, reliability, and source-health evidence so people and agents can understand the real state of engineering work.",
    openGraph: {
        title: "Context Fabric — See the whole engineering picture",
        description:
            "Understand project, team, and organizational health from connected evidence instead of one status field.",
        type: "website",
        siteName: "Full Chaos Dev Health",
        images: [
            {
                url: "/opengraph-image.png",
                width: 1200,
                height: 630,
                alt: "Full Chaos Dev Health Context Fabric",
            },
        ],
    },
};

const CONNECTED_SIGNALS = [
    "Planning and tracking",
    "Code and review",
    "CI and delivery",
    "Incidents and reliability",
] as const;

const ACTUAL_STATE = [
    "Pull request merged",
    "CI passed",
    "Deployment succeeded",
    "Feature flag enabled",
    "Available to users",
] as const;

const ASK_DEV_QUESTIONS = [
    "Is this project actually done?",
    "What is blocking delivery?",
    "Which teams need attention?",
    "What changed in this team’s DORA metrics over the last 90 days?",
] as const;

const AGENT_QUESTIONS = [
    "What decisions already govern this work?",
    "Which related changes or failures matter?",
    "What evidence should be verified before editing?",
    "Which risks and required checks are already known?",
] as const;

function CheckIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="m5 12 4 4L19 6" />
        </svg>
    );
}

export default function ContextFabricMarketingPage() {
    return (
        <>
            <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-16 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] lg:items-center">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                        Context Fabric
                    </p>
                    <h1 className="mt-6 max-w-4xl font-(--font-display) text-4xl leading-tight sm:text-5xl lg:text-6xl">
                        Know what is actually happening—not just what the tracker says.
                    </h1>
                    <p className="mt-6 max-w-2xl text-lg leading-relaxed text-(--ink-muted)">
                        Context Fabric connects the work, code, delivery, reliability, and
                        source-health evidence already flowing through Dev Health. People and agents
                        get a shared, evidence-backed view of the real state of a project, team, or
                        organization.
                    </p>
                    <div className="mt-10 flex flex-wrap gap-4">
                        <Link
                            href="/auth/signup"
                            className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            {CTA_LABELS.getStarted}
                        </Link>
                        <a
                            href="https://github.com/full-chaos/dev-health-ops/blob/main/docs/use/ai-workflows/index.md#use-ask-dev-for-a-human-investigation"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            {CTA_LABELS.viewGuide}
                        </a>
                    </div>
                </div>

                <div
                    className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-5 shadow-2xl shadow-black/10 sm:p-7"
                    aria-label="Context Fabric connects engineering evidence to Ask Dev and compatible agents"
                >
                    <div className="grid grid-cols-2 gap-3">
                        {CONNECTED_SIGNALS.map((signal) => (
                            <div
                                key={signal}
                                className="rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3 text-sm text-(--ink-muted)"
                            >
                                {signal}
                            </div>
                        ))}
                    </div>

                    <div className="mx-auto my-5 h-8 w-px bg-(--card-stroke)" aria-hidden="true" />

                    <div className="rounded-3xl border border-(--accent)/40 bg-(--accent)/10 p-6 text-center">
                        <p className="font-(--font-display) text-2xl">Context Fabric</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-(--ink-muted)">
                            State → Pressure → Cause → Evidence → Action
                        </p>
                    </div>

                    <div className="mx-auto my-5 h-8 w-px bg-(--card-stroke)" aria-hidden="true" />

                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-(--card-stroke) bg-(--card) p-4 text-center">
                            <p className="font-(--font-display) text-lg">Ask Dev</p>
                            <p className="mt-1 text-xs text-(--ink-muted)">For people</p>
                        </div>
                        <div className="rounded-2xl border border-(--card-stroke) bg-(--card) p-4 text-center">
                            <p className="font-(--font-display) text-lg">MCP</p>
                            <p className="mt-1 text-xs text-(--ink-muted)">
                                For developers and agents
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        The problem
                    </p>
                    <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                        Project status is a relationship, not a field
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-(--ink-muted)">
                        A tracking system records what someone declared. The rest of the engineering
                        ecosystem records what actually happened. Context Fabric connects those
                        signals instead of treating one tracker—or one teammate’s memory—as the only
                        source of truth.
                    </p>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-6 sm:p-10">
                    <div className="max-w-3xl">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            Real-world example
                        </p>
                        <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                            The ticket says “In Progress.” What is the actual state?
                        </h2>
                    </div>

                    <div className="mt-10 grid gap-5 lg:grid-cols-[0.8fr_1fr_1.1fr]">
                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-6">
                            <p className="text-xs uppercase tracking-[0.16em] text-(--ink-muted)">
                                Tracking system
                            </p>
                            <p className="mt-5 font-(--font-display) text-3xl">In Progress</p>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Last updated four days ago
                            </p>
                        </div>

                        <div className="space-y-3 rounded-3xl border border-(--card-stroke) bg-(--card) p-6">
                            <p className="text-xs uppercase tracking-[0.16em] text-(--ink-muted)">
                                Observed evidence
                            </p>
                            {ACTUAL_STATE.map((signal) => (
                                <div key={signal} className="flex items-center gap-3 text-sm">
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--accent)/10 text-(--accent)">
                                        <CheckIcon />
                                    </span>
                                    <span>{signal}</span>
                                </div>
                            ))}
                        </div>

                        <div className="rounded-3xl border border-(--accent)/40 bg-(--accent)/10 p-6">
                            <p className="text-xs uppercase tracking-[0.16em] text-(--accent)">
                                Context Fabric
                            </p>
                            <p className="mt-5 font-(--font-display) text-2xl">
                                Implemented, deployed, and available
                            </p>
                            <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                                The delivery evidence shows the feature is live. The tracking record
                                is stale, and any remaining rollout or follow-up work is reported
                                separately.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Better conversations
                    </p>
                    <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                        Come to the discussion prepared
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-(--ink-muted)">
                        Context Fabric is not meant to replace talking with your teammates. It helps
                        teams, leaders, developers, and agents arrive with the relevant evidence
                        already connected—like the A+ student who actually did the reading.
                    </p>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Two experiences
                    </p>
                    <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                        Context for people and agents
                    </h2>
                </div>

                <div className="mt-10 grid gap-5 lg:grid-cols-2">
                    <article className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-7 sm:p-9">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            For teams and leaders
                        </p>
                        <h3 className="mt-4 font-(--font-display) text-3xl">Ask Dev</h3>
                        <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                            Dev is embedded in the Dev Health application and answers questions
                            about project, team, and organizational health across the connected
                            ecosystem.
                        </p>
                        <ul className="mt-7 space-y-3">
                            {ASK_DEV_QUESTIONS.map((question) => (
                                <li key={question} className="flex gap-3 text-sm">
                                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-(--accent)" />
                                    <span>{question}</span>
                                </li>
                            ))}
                        </ul>
                        <Link
                            href="/auth/signup"
                            className="mt-8 inline-flex rounded-full bg-(--accent) px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            {CTA_LABELS.getStarted}
                        </Link>
                    </article>

                    <article className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-7 sm:p-9">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            For developers and agents
                        </p>
                        <h3 className="mt-4 font-(--font-display) text-3xl">MCP for agents</h3>
                        <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                            Compatible coding, review, documentation, and automation agents can
                            receive scoped context and supporting evidence before they begin work
                            instead of starting cold.
                        </p>
                        <ul className="mt-7 space-y-3">
                            {AGENT_QUESTIONS.map((question) => (
                                <li key={question} className="flex gap-3 text-sm">
                                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-(--accent)" />
                                    <span>{question}</span>
                                </li>
                            ))}
                        </ul>
                        <a
                            href="https://github.com/full-chaos/dev-health-acr/blob/main/docs/mcp-sidecar.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-8 inline-flex rounded-full border border-(--card-stroke) bg-(--card-70) px-6 py-2.5 text-sm font-medium transition hover:border-foreground/30"
                        >
                            {CTA_LABELS.viewGuide}
                        </a>
                    </article>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="grid gap-8 rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-7 sm:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            Evidence before confidence
                        </p>
                        <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                            An answer should show its work.
                        </h2>
                        <p className="mt-5 text-sm leading-relaxed text-(--ink-muted)">
                            Context Fabric does not quietly turn incomplete data into certainty.
                            What it can answer depends on the sources, permissions, freshness, and
                            capabilities available to the organization.
                        </p>
                    </div>
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {[
                            "Observed facts stay separate from inferences and recommendations.",
                            "Missing, stale, or unavailable sources are disclosed—not represented as zero.",
                            "Evidence is authorized again when it is opened.",
                            "Conflicting systems remain visible instead of being silently overwritten.",
                        ].map((point) => (
                            <li
                                key={point}
                                className="rounded-2xl border border-(--card-stroke) bg-(--card) p-5 text-sm leading-relaxed text-(--ink-muted)"
                            >
                                {point}
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-8 text-center sm:p-12">
                    <h2 className="font-(--font-display) text-3xl sm:text-4xl">
                        See the whole picture before deciding what happens next.
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-(--ink-muted)">
                        Use Ask Dev when a person needs an evidence-backed answer. Use the ACR MCP
                        path when an agent needs context before it works.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-4">
                        <Link
                            href="/auth/signup"
                            className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            {CTA_LABELS.getStarted}
                        </Link>
                        <Link
                            href="/marketing"
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            {CTA_LABELS.solutions}
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
