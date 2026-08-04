import type { Metadata } from "next";
import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";

export const metadata: Metadata = {
    title: "Context Fabric use cases — Full Chaos Dev Health",
    description:
        "See how Context Fabric helps people and agents understand project status, health, workload, investment, operational deficiencies, source trust, and the context behind engineering work.",
    openGraph: {
        title: "Context Fabric use cases — Evidence-backed engineering context",
        description:
            "Explore practical Context Fabric use cases for teams, leaders, developers, and agents.",
        type: "website",
        siteName: "Full Chaos Dev Health",
        images: [
            {
                url: "/opengraph-image.png",
                width: 1200,
                height: 630,
                alt: "Full Chaos Dev Health Context Fabric use cases",
            },
        ],
    },
};

const ACTUAL_STATE = [
    "Pull request merged",
    "CI passed",
    "Deployment succeeded",
    "Feature flag enabled",
    "Available to users",
] as const;

const PEOPLE_USE_CASES = [
    {
        eyebrow: "Project and portfolio readiness",
        title: "Know what is complete, blocked, ready, or still uncertain",
        question: "What is the status of these projects, and which need attention?",
        description:
            "Connect declared state with required work, reviews, CI, releases, incidents, dependencies, and source freshness. See remaining work and blockers without averaging unknown projects into a misleading portfolio percentage.",
        signals: ["Actual completion", "Remaining work", "Blockers", "Readiness", "Coverage"],
    },
    {
        eyebrow: "Project health",
        title: "Understand the conditions affecting safe delivery",
        question: "What does project health look like, and what is driving it?",
        description:
            "Bring together delivery flow, execution state, reliability, code and ownership risk, review pressure, investment mix, dependencies, and data trust as an inspectable profile—not one unexplained score.",
        signals: ["Delivery flow", "Reliability", "Code risk", "Dependencies", "Data trust"],
    },
    {
        eyebrow: "Team health",
        title: "Find teams that may need attention without ranking people",
        question: "Which teams show sustained pressure, and why?",
        description:
            "Look for supported patterns across flow, WIP, review demand, reliability, ownership concentration, investment, and source coverage. A single bad week or one metric is not enough to label a team.",
        signals: ["Flow", "Review demand", "Reliability", "Ownership", "Sustained pressure"],
    },
    {
        eyebrow: "Workload pressure",
        title: "Separate visible pressure from unsupported workload claims",
        question: "Which teams appear overburdened?",
        description:
            "Compare active work, WIP, review demand, ownership breadth, team size, and historical or cohort baselines. When a defensible denominator is missing, report higher observed pressure rather than pretending burden is known.",
        signals: ["WIP", "Review load", "Ownership breadth", "Denominators", "Baselines"],
    },
    {
        eyebrow: "Investment balance",
        title: "See where engineering effort is going—and what remains unclassified",
        question: "Which teams are light on feature work, and what are they working on instead?",
        description:
            "Read new-value work beside KTLO, security, infrastructure, and unclassified work with enough coverage and a valid comparison period. Maintenance and platform work remain visible rather than being treated as less valuable.",
        signals: ["New value", "KTLO", "Security", "Infrastructure", "Coverage"],
    },
    {
        eyebrow: "Operational deficiencies",
        title: "Prioritize evidence-backed gaps across the delivery system",
        question: "What operational deficiencies should we investigate first?",
        description:
            "Surface versioned, evidence-linked gaps in data coverage, planning relationships, delivery flow, review and CI, reliability, ownership and code risk, capacity pressure, and investment balance.",
        signals: ["Data coverage", "Delivery flow", "CI controls", "Reliability", "Code risk"],
    },
    {
        eyebrow: "Change and source trust",
        title: "Understand what improved, worsened, or cannot yet be concluded",
        question: "What changed over the last 90 days, and which sources can we trust?",
        description:
            "Compare canonical metrics and operating conditions while keeping stale, missing, unavailable, unconfigured, and not-applicable sources distinct. Missing evidence never silently becomes zero or healthy.",
        signals: ["Observed change", "Freshness", "Coverage", "Conflicts", "Uncertainty"],
    },
] as const;

const AGENT_USE_CASES = [
    {
        title: "Plan a change without starting cold",
        description:
            "Give an agent the authorized repository, task, branch or commit, related work, ownership, prior decisions, known risks, and required checks before it proposes an implementation.",
        questions: [
            "Who owns or is affected by this change?",
            "Which decisions and dependencies already govern it?",
        ],
    },
    {
        title: "Review code with the surrounding evidence",
        description:
            "Connect the change to related files, open work, earlier reviews, CI results, hotspots, incidents, and documented constraints so a review is informed by more than the diff alone.",
        questions: [
            "Which related changes or failures matter?",
            "What evidence should be verified before approval?",
        ],
    },
    {
        title: "Investigate a failure across systems",
        description:
            "Trace relevant delivery, incident, code, ownership, and prior-attempt evidence without allowing unrelated organization-wide records to masquerade as causes.",
        questions: [
            "What changed before the failure?",
            "Which evidence supports the suspected relationship?",
        ],
    },
    {
        title: "Carry context into docs, CI, and automation",
        description:
            "Let documentation and automation agents understand current contracts, source health, release constraints, and existing decisions before they update instructions or workflows.",
        questions: [
            "What constraints must this workflow preserve?",
            "Which checks and evidence paths are already required?",
        ],
    },
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

export default function ContextFabricUseCasesPage() {
    return (
        <>
            <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 sm:pt-24">
                <div className="mx-auto max-w-4xl text-center">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                        Context Fabric use cases
                    </p>
                    <h1 className="mt-6 font-(--font-display) text-4xl leading-tight sm:text-5xl lg:text-6xl">
                        Understand the whole context behind an engineering decision.
                    </h1>
                    <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-(--ink-muted)">
                        Context Fabric connects authorized evidence across work, code, delivery,
                        reliability, ownership, investment, dependencies, and source health. These
                        are representative questions people and agents can investigate without
                        treating one tool, metric, or memory as the whole story.
                    </p>
                    <div className="mt-10 flex flex-wrap justify-center gap-4">
                        <Link
                            href="/marketing/context-fabric"
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            Context Fabric overview
                        </Link>
                        <Link
                            href="/auth/signup"
                            className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            {CTA_LABELS.getStarted}
                        </Link>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-6 sm:p-10">
                    <div className="max-w-3xl">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            A familiar day-to-day example
                        </p>
                        <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                            The ticket says “In Progress.” What is the actual state?
                        </h2>
                        <p className="mt-5 text-sm leading-relaxed text-(--ink-muted)">
                            A tracking system records what someone declared. The rest of the
                            engineering ecosystem records what actually happened. Project status is
                            one place where connected context immediately changes the answer.
                        </p>
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
                        For teams and leaders
                    </p>
                    <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                        Ask operating questions across the ecosystem
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-(--ink-muted)">
                        Ask Dev is the people-facing path into Context Fabric. It can bring the
                        relevant authorized sources into one bounded investigation while keeping
                        evidence, coverage, and uncertainty visible.
                    </p>
                </div>

                <div className="mt-12 grid gap-5 lg:grid-cols-2">
                    {PEOPLE_USE_CASES.map((useCase) => (
                        <article
                            key={useCase.title}
                            className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-7 sm:p-8"
                        >
                            <p className="text-xs uppercase tracking-[0.16em] text-(--accent)">
                                {useCase.eyebrow}
                            </p>
                            <h3 className="mt-4 font-(--font-display) text-2xl">
                                {useCase.title}
                            </h3>
                            <p className="mt-5 rounded-2xl border border-(--card-stroke) bg-(--card) p-4 text-sm font-medium">
                                “{useCase.question}”
                            </p>
                            <p className="mt-5 text-sm leading-relaxed text-(--ink-muted)">
                                {useCase.description}
                            </p>
                            <div className="mt-6 flex flex-wrap gap-2">
                                {useCase.signals.map((signal) => (
                                    <span
                                        key={signal}
                                        className="rounded-full border border-(--card-stroke) bg-(--card) px-3 py-1.5 text-xs text-(--ink-muted)"
                                    >
                                        {signal}
                                    </span>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        For developers and agents
                    </p>
                    <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                        Bring the surrounding context to the agent before it works
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-(--ink-muted)">
                        Through ACR and MCP, compatible coding, review, documentation, CI, research,
                        and automation agents can retrieve bounded context and expand supporting
                        evidence instead of reconstructing the ecosystem from scratch.
                    </p>
                </div>

                <div className="mt-12 grid gap-5 sm:grid-cols-2">
                    {AGENT_USE_CASES.map((useCase) => (
                        <article
                            key={useCase.title}
                            className="rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-7 sm:p-8"
                        >
                            <h3 className="font-(--font-display) text-2xl">{useCase.title}</h3>
                            <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                                {useCase.description}
                            </p>
                            <ul className="mt-6 space-y-3">
                                {useCase.questions.map((question) => (
                                    <li key={question} className="flex gap-3 text-sm">
                                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-(--accent)" />
                                        <span>{question}</span>
                                    </li>
                                ))}
                            </ul>
                        </article>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-6 pb-24">
                <div className="grid gap-8 rounded-[2rem] border border-(--card-stroke) bg-(--card-80) p-7 sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-(--accent)">
                            Evidence-backed by design
                        </p>
                        <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
                            Useful context preserves its limits.
                        </h2>
                        <p className="mt-5 text-sm leading-relaxed text-(--ink-muted)">
                            Context Fabric does not turn a missing denominator into a workload claim,
                            one bad week into a team judgment, semantic similarity into a
                            relationship, or incomplete source coverage into certainty.
                        </p>
                    </div>
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {[
                            "Named subjects stay bound to exact authorized relationships.",
                            "Observed facts, inferred pressure, and recommendations remain distinct.",
                            "Missing, stale, unavailable, and not-applicable sources remain distinct.",
                            "No person-level productivity, health, commitment, or workload ranking.",
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
                        Give the next conversation—or the next agent—the whole relevant context.
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-(--ink-muted)">
                        Start with Ask Dev for people, or connect a compatible agent through the ACR
                        MCP sidecar.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-4">
                        <Link
                            href="/auth/signup"
                            className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
                        >
                            {CTA_LABELS.getStarted}
                        </Link>
                        <a
                            href="https://github.com/full-chaos/dev-health-acr/blob/main/docs/mcp-sidecar.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
                        >
                            Configure ACR and MCP
                        </a>
                    </div>
                </div>
            </section>
        </>
    );
}
