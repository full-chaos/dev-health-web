import type { Metadata } from "next";
import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";

export const metadata: Metadata = {
    title: "Context Fabric — Full Chaos Dev Health",
    description:
        "Give people and agents evidence-backed context about the work, systems, relationships, decisions, and conditions across an engineering organization.",
    openGraph: {
        title: "Context Fabric — Give people and agents the context behind the work",
        description:
            "Connect engineering evidence so people and agents can understand who, what, why, and how before they decide or act.",
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
    "Work and priorities",
    "Code and delivery",
    "Teams and ownership",
    "Reliability and operations",
] as const;

const CONTEXT_DIMENSIONS = [
    {
        title: "Who",
        eyebrow: "Connected scope",
        description:
            "The teams, owners, reviewers, repositories, services, projects, and stakeholders that are related, responsible, or affected.",
    },
    {
        title: "What",
        eyebrow: "Observed state",
        description:
            "The work, changes, delivery state, incidents, metrics, investment mix, and source coverage that describe current reality.",
    },
    {
        title: "Why",
        eyebrow: "Relationships and causes",
        description:
            "The decisions, dependencies, prior attempts, failures, constraints, and sustained pressures behind the current state.",
    },
    {
        title: "How",
        eyebrow: "Ways of working",
        description:
            "The architecture, workflows, required checks, evidence paths, operating boundaries, and next actions that shape the work.",
    },
] as const;

const USE_CASE_TEASERS = [
    "Project and portfolio readiness",
    "Project health",
    "Team health and sustained pressure",
    "Workload and review demand",
    "Investment balance",
    "Operational deficiencies",
    "Observed change and source trust",
    "Agent planning and investigation",
] as const;

const ASK_DEV_QUESTIONS = [
    "What needs attention across this portfolio?",
    "Which teams show sustained pressure, and why?",
    "Where is engineering investment going?",
    "What operational deficiencies should we investigate first?",
] as const;

const AGENT_QUESTIONS = [
    "Who owns or is affected by this change?",
    "What decisions and dependencies already govern it?",
    "Which related code, reviews, incidents, or failures matter?",
    "What constraints, evidence, risks, and checks should shape the plan?",
] as const;

const TRUST_POINTS = [
    "Observed facts stay separate from inferences and recommendations.",
    "Missing, stale, or unavailable sources are disclosed—not represented as zero.",
    "Conflicting systems remain visible instead of being silently overwritten.",
    "Every answer stays bounded by authorized scope, relationships, and evidence.",
] as const;

function QuestionList({ questions }: Readonly<{ questions: readonly string[] }>) {
    return (
        <ul className="mt-7 space-y-3">
            {questions.map((question) => (
                <li key={question} className="flex gap-3 text-sm">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-(--accent)" />
                    <span>{question}</span>
                </li>
            ))}
        </ul>
    );
}

export default function ContextFabricMarketingPage() {
    return (
        <>
            <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-16 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(22.5rem,0.8fr)] lg:items-center">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                        Context Fabric
                    </p>
                    <h1 className="mt-6 max-w-4xl font-(--font-display) text-4xl leading-tight sm:text-5xl lg:text-6xl">
                        Give people and agents the context behind the work.
                    </h1>
                    <p className="mt-6 max-w-2xl text-lg leading-relaxed text-(--ink-muted)">
                        Context Fabric turns the engineering evidence already flowing through Dev
                        Health into shared operating context: who owns and is affected by the work,
                        what is actually happening, why it matters, how systems and decisions
                        relate, and what evidence should guide the next action.
                    </p>
                    <div className="mt-10 flex flex-wrap gap-4">
                        <Link
                            href="/marketing/context-fabric/use-cases"
                            className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            {CTA_LABELS.exploreContextFabricUseCases}
                        </Link>
                        <Link
                            href="/auth/signup"
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            {CTA_LABELS.getStarted}
                        </Link>
                    </div>
                </div>

                <div
                    className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-5 shadow-2xl shadow-black/10 sm:p-7"
                    role="img"
                    aria-label="Context Fabric connects the engineering ecosystem to Ask Dev and ACR MCP consumers"
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
                            <p className="font-(--font-display) text-lg">ACR / MCP</p>
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
                        Connected understanding
                    </p>
                    <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                        Understand the engineering ecosystem around the work
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-(--ink-muted)">
                        Planning systems, repositories, reviews, delivery pipelines, incidents,
                        architecture, ownership, investment, dependencies, and source health each
                        describe a different part of engineering reality. Context Fabric connects
                        those authorized signals without flattening them into one status field or
                        opaque score.
                    </p>
                </div>
                <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {CONTEXT_DIMENSIONS.map((dimension) => (
                        <article
                            key={dimension.title}
                            className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6"
                        >
                            <p className="text-xs uppercase tracking-[0.16em] text-(--accent)">
                                {dimension.eyebrow}
                            </p>
                            <h3 className="mt-4 font-(--font-display) text-3xl">
                                {dimension.title}
                            </h3>
                            <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                                {dimension.description}
                            </p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="grid gap-10 rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-7 sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            Beyond one status field
                        </p>
                        <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                            A shared context layer for everyday engineering decisions
                        </h2>
                        <p className="mt-5 text-sm leading-relaxed text-(--ink-muted)">
                            Project status is one familiar example, not the product boundary. The
                            same fabric supports questions about teams, portfolios, investment,
                            reliability, operational gaps, source trust, and the context an agent
                            needs before it changes anything.
                        </p>
                        <Link
                            href="/marketing/context-fabric/use-cases"
                            className="mt-7 inline-flex rounded-full bg-(--accent) px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            {CTA_LABELS.seeContextFabricInAction}
                        </Link>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {USE_CASE_TEASERS.map((useCase) => (
                            <div
                                key={useCase}
                                className="rounded-2xl border border-(--card-stroke) bg-(--card) p-5 text-sm"
                            >
                                {useCase}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Two experiences
                    </p>
                    <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                        One fabric, built for people and agents
                    </h2>
                </div>
                <div className="mt-10 grid gap-5 lg:grid-cols-2">
                    <article className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-7 sm:p-9">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            For teams and leaders
                        </p>
                        <h3 className="mt-4 font-(--font-display) text-3xl">Ask Dev</h3>
                        <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                            Ask Dev is the people-facing conversational layer in Dev Health. It
                            brings project, team, portfolio, delivery, reliability, investment,
                            operational, and data-trust evidence into one investigation.
                        </p>
                        <QuestionList questions={ASK_DEV_QUESTIONS} />
                        <a
                            href="https://github.com/full-chaos/dev-health-ops/blob/main/docs/use/ai-workflows/index.md#use-ask-dev-for-a-human-investigation"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-8 inline-flex rounded-full border border-(--card-stroke) bg-(--card-70) px-6 py-2.5 text-sm font-medium transition hover:border-foreground/30"
                        >
                            {CTA_LABELS.readAskDevGuide}
                        </a>
                    </article>
                    <article className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-7 sm:p-9">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            For developers and agents
                        </p>
                        <h3 className="mt-4 font-(--font-display) text-3xl">ACR and MCP</h3>
                        <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                            Compatible coding, review, documentation, CI, research, and automation
                            agents can receive scoped context and supporting evidence before they
                            begin work instead of starting cold or rediscovering the ecosystem.
                        </p>
                        <QuestionList questions={AGENT_QUESTIONS} />
                        <a
                            href="https://github.com/full-chaos/dev-health-acr/blob/main/docs/mcp-sidecar.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-8 inline-flex rounded-full border border-(--card-stroke) bg-(--card-70) px-6 py-2.5 text-sm font-medium transition hover:border-foreground/30"
                        >
                            {CTA_LABELS.configureAcrMcpSidecar}
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
                            Context should explain what it knows—and what it does not.
                        </h2>
                        <p className="mt-5 text-sm leading-relaxed text-(--ink-muted)">
                            Context Fabric keeps scope, freshness, coverage, relationships,
                            conflicts, unavailable sources, and supporting evidence visible instead
                            of turning incomplete data into certainty.
                        </p>
                    </div>
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {TRUST_POINTS.map((point) => (
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
                        Understand the whole context before deciding what happens next.
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-(--ink-muted)">
                        Use Ask Dev when a person needs an evidence-backed investigation. Use ACR
                        and MCP when an agent needs scoped context before it works.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-4">
                        <Link
                            href="/marketing/context-fabric/use-cases"
                            className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            {CTA_LABELS.exploreContextFabricUseCases}
                        </Link>
                        <Link
                            href="/auth/signup"
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            {CTA_LABELS.getStarted}
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
