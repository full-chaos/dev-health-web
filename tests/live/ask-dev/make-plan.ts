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
    latencyQuestionFor,
    pageQuestionFor,
    questionFor,
    type QuestionCase,
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
writeFileSync(
    output,
    JSON.stringify(
        { ...plan, service: { questions: [...entries, ...pageEntries, ...latencyEntries] } },
        null,
        2,
    ),
);
