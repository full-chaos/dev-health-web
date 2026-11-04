/**
 * Writes one run's plan for acr's `modeloracle` from acr's I-48 plan: one entry per case, with that
 * run's nonce in the question, then the page-context cases built on its status entry.
 *
 *   npx tsx tests/live/ask-dev/make-plan.ts <acr plan> <output> <nonce>
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
    CASES,
    LATENCY_CASES,
    PAGE_CASES,
    REPLICATES,
    RICH_CASES,
    latencyQuestionFor,
    pageQuestionFor,
    questionFor,
    richQuestionFor,
    type QuestionCase,
    type RichCase,
} from "./questions";

type Entry = { question: string; interpretation: Record<string, unknown> };
type Plan = { service: { questions: Entry[] } };

const [source, output, nonce] = process.argv.slice(2);
if (!source || !output || !nonce) throw new Error("usage: make-plan <acr plan> <output> <nonce>");

const plan = JSON.parse(readFileSync(source, "utf8")) as Plan;
const entries = (Object.keys(CASES) as QuestionCase[]).map((name) => {
    const entry = plan.service.questions.find((item) => item.question === CASES[name]);
    if (entry === undefined) throw new Error(`acr's plan has no entry for: ${CASES[name]}`);
    return {
        ...entry,
        question: questionFor(name, nonce),
        interpretation: {
            ...entry.interpretation,
            window_class: "recent_activity_lookup",
            window_confidence: "high",
        },
    };
});

// The term names no real subject: the page's hint is the only subject ACR can commit. A plain status
// entry gives the delays and the synthesis.
const template = plan.service.questions.find((item) => item.question === CASES.stages);
if (template === undefined) throw new Error(`acr's plan has no entry for: ${CASES.stages}`);
const TERM = "this repository";
const pageEntries = PAGE_CASES.map((name) => ({
    ...template,
    question: pageQuestionFor(name, nonce),
    interpretation: {
        shape: "single_subject",
        requested_judgment: "investment",
        subject_terms: [TERM],
        requested_subject_kind: "repository",
        time_context: { axis: "current" },
        fact_requirements: [{ kind: "investment" }],
        clarification_needed: false,
        window_class: "recent_activity_lookup",
        window_confidence: "high",
        question_frame: {
            goals: ["allocate_investment"],
            subject_expression: { kind: "named_subject", terms: [TERM] },
            temporal: "current",
        },
    },
}));
// CHAOS-3598 (P2-4): the same scripted frame from both surfaces, so only the hint differs. The
// oracle fixes the interpretation, so this shows what the server does with it, not how a model
// routes the question.
const latencyEntries = LATENCY_CASES.map((name) => ({
    ...template,
    question: latencyQuestionFor(name, nonce),
    interpretation: {
        shape: "single_subject",
        requested_judgment: "status",
        subject_terms: [TERM],
        requested_subject_kind: "repository",
        time_context: { axis: "current" },
        fact_requirements: [{ kind: "reviews" }, { kind: "metrics" }],
        clarification_needed: false,
        window_class: "recent_activity_lookup",
        window_confidence: "high",
        question_frame: {
            goals: ["explain_drivers"],
            subject_expression: { kind: "named_subject", terms: [TERM] },
            temporal: "current",
        },
    },
}));
// CHAOS-11946 (Phase 3): each rich view's frame and claims, scripted so the view the answer serves
// depends on the data alone. No delays: Phase 3 times nothing. `claim_fields`/`claim_first_only`
// need acr's modeloracle from main bbe95afa or later (CHAOS-12809); an older oracle refuses this
// plan at load, so a run never answers with the wrong claims. `claim_detail_tables` (the sankey's
// table, claimed by name with value null) needs the modeloracle with CHAOS-12857.
const named = (term: string) => ({ kind: "named_subject", terms: [term] });
const RICH_PLAN: Record<
    RichCase,
    {
        interpretation: Record<string, unknown>;
        claims?: Record<string, unknown>;
        /** False for a non-current axis: no window class is stated (default true). */
        currentAxis?: boolean;
    }
> = {
    forecast: {
        interpretation: {
            shape: "single_subject",
            requested_judgment: "status",
            subject_terms: ["Fullchaos"],
            requested_subject_kind: "team",
            time_context: { axis: "current" },
            fact_requirements: [{ kind: "workload" }],
            clarification_needed: false,
            question_frame: {
                goals: ["assess_state"],
                subject_expression: named("Fullchaos"),
                temporal: "current",
                dimensions: ["execution_completion"],
            },
        },
        claims: { claim_fields: ["backlog_size"], claim_first_only: true },
    },
    treemap: {
        interpretation: {
            shape: "single_subject",
            requested_judgment: "investment",
            subject_terms: ["full-chaos/dev-health-acr"],
            requested_subject_kind: "repository",
            time_context: { axis: "current" },
            fact_requirements: [{ kind: "investment" }],
            clarification_needed: false,
            question_frame: {
                goals: ["allocate_investment"],
                subject_expression: named("full-chaos/dev-health-acr"),
                temporal: "current",
            },
        },
    },
    comparison: {
        interpretation: {
            shape: "explicit_cohort",
            requested_judgment: "comparison",
            subject_terms: ["full-chaos/dev-health-acr", "full-chaos/dev-health-ops"],
            requested_subject_kind: "repository",
            time_context: { axis: "current" },
            fact_requirements: [{ kind: "metrics" }, { kind: "pull_requests" }],
            clarification_needed: false,
            comparison_terms: ["full-chaos/dev-health-acr", "full-chaos/dev-health-ops"],
            question_frame: {
                goals: ["compare"],
                subject_expression: {
                    kind: "explicit_set",
                    operands: [
                        named("full-chaos/dev-health-acr"),
                        named("full-chaos/dev-health-ops"),
                    ],
                },
                temporal: "current",
            },
        },
        claims: { claim_fields: ["window_pr_cycle_hours_median", "window_pr_count"] },
    },
    landscape: {
        interpretation: {
            shape: "explicit_cohort",
            requested_judgment: "comparison",
            subject_terms: ["Fullchaos", "Ops Team"],
            requested_subject_kind: "team",
            time_context: { axis: "current" },
            fact_requirements: [{ kind: "landscape" }],
            clarification_needed: false,
            comparison_terms: ["Fullchaos", "Ops Team"],
            question_frame: {
                goals: ["compare"],
                subject_expression: {
                    kind: "explicit_set",
                    operands: [named("Fullchaos"), named("Ops Team")],
                },
                temporal: "current",
            },
        },
        claims: { claim_fields: ["churn_loc_30d", "delivery_units_30d"] },
    },
    window: {
        // A stated range is a non-current axis: no window class, and no effective window composed.
        interpretation: {
            shape: "single_subject",
            requested_judgment: "status",
            subject_terms: ["Fullchaos"],
            requested_subject_kind: "team",
            time_context: {
                axis: "range",
                start: "2026-10-01T00:00:00Z",
                end: "2026-10-15T00:00:00Z",
            },
            fact_requirements: [{ kind: "workload" }],
            clarification_needed: false,
            question_frame: {
                goals: ["assess_state"],
                subject_expression: named("Fullchaos"),
                temporal: "bounded_window",
            },
        },
        currentAxis: false,
    },
    sankey: {
        // A team's repositories with the one goal allocate_investment: the scope-anchor allocation
        // route serves it from the team's own fact (CHAOS-12606), and the sankey plots the table
        // the claim names (CHAOS-12580, CHAOS-12582).
        interpretation: {
            shape: "open",
            requested_judgment: "investment",
            subject_terms: ["Fullchaos"],
            requested_subject_kind: "repository",
            scope_anchor_kind: "team",
            scope_anchor_term: "Fullchaos",
            time_context: { axis: "current" },
            fact_requirements: [{ kind: "investment" }],
            clarification_needed: false,
            question_frame: {
                goals: ["allocate_investment"],
                subject_expression: {
                    kind: "children_of_scope",
                    anchor_terms: ["Fullchaos"],
                    member_kind: "repository",
                },
                temporal: "current",
            },
        },
        claims: { claim_detail_tables: ["repository_theme_breakdown"] },
    },
    sunburst: {
        // One repository with the one goal allocate_investment, as the treemap case: with the
        // sunburst flag on, its investment fact carries the subcategory_breakdown detail table, and
        // the sunburst plots the table the claim names (CHAOS-12554).
        interpretation: {
            shape: "single_subject",
            requested_judgment: "investment",
            subject_terms: ["full-chaos/dev-health-acr"],
            requested_subject_kind: "repository",
            time_context: { axis: "current" },
            fact_requirements: [{ kind: "investment" }],
            clarification_needed: false,
            question_frame: {
                goals: ["allocate_investment"],
                subject_expression: named("full-chaos/dev-health-acr"),
                temporal: "current",
            },
        },
        claims: { claim_detail_tables: ["subcategory_breakdown"] },
    },
    cohort: {
        interpretation: {
            shape: "discovered_cohort",
            requested_judgment: "survey",
            subject_terms: [],
            requested_subject_kind: "team",
            time_context: { axis: "current" },
            fact_requirements: [],
            clarification_needed: false,
            question_frame: {
                goals: ["rank_or_survey", "explain_drivers"],
                subject_expression: { kind: "discovered_kind", member_kind: "team" },
                temporal: "current",
            },
        },
    },
};
const RICH_SYNTHESIS = {
    status: "complete",
    direct_judgment: "Scripted live acceptance: no model wrote this.",
    current_state: "Scripted live acceptance: no model wrote this.",
    strongest_pressures: [],
    limitations: ["A scripted oracle wrote this answer."],
    driver: { title: "", summary: "" },
    deterministic_answer: "Placeholder prose. The server composes the served answer.",
    min_evidence_refs: 0,
};
const richEntries = RICH_CASES.flatMap((name) =>
    REPLICATES.map((replicate) => ({
        question: richQuestionFor(name, replicate, nonce),
        delay_ms: { interpret: 0, synthesize: 0, phrase: 0 },
        interpretation:
            RICH_PLAN[name].currentAxis === false
                ? RICH_PLAN[name].interpretation
                : {
                      ...RICH_PLAN[name].interpretation,
                      window_class: "recent_activity_lookup",
                      window_confidence: "high",
                  },
        synthesis: { ...RICH_SYNTHESIS, ...RICH_PLAN[name].claims },
    })),
);
writeFileSync(
    output,
    JSON.stringify(
        {
            ...plan,
            service: {
                questions: [...entries, ...pageEntries, ...latencyEntries, ...richEntries],
            },
        },
        null,
        2,
    ),
);
