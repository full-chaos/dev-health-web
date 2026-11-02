/**
 * The routed cases' questions. ACR reuses a stored answer for the same question, so a run needs
 * fresh ones: each case has its own, and each run has its own `ASK_DEV_LIVE_NONCE`.
 * `make-plan.ts` writes the same text into the oracle's plan.
 *
 * A question states its window: with none, ACR asks the user to confirm one, and that is not an
 * answer.
 */
const BASE = "what is the status of full-chaos/dev-health-web over the last 30 days?";

/** Each case, and the entry of acr's plan whose delays it needs. */
export const CASES = {
    stages: "What is the status of full-chaos/dev-health-web?",
    doubleSubmit: "What is the status of full-chaos/dev-health-web?",
    reload: "What is the status of full-chaos/dev-health-web?",
    stop: "Hold: what is the status of full-chaos/dev-health-web?",
    ceiling: "Hold: what is the status of full-chaos/dev-health-web?",
    retry: "Again: what is the status of full-chaos/dev-health-web?",
    reuse: "Again: what is the status of full-chaos/dev-health-web?",
    long: "Long: what is the status of full-chaos/dev-health-web?",
    late: "Late: what is the status of full-chaos/dev-health-web?",
    expand: "Hold: what is the status of full-chaos/dev-health-web?",
    // CHAOS-12192 (`store.spec.ts`): one case per test, so no test is served another's answer.
    close: "Hold: what is the status of full-chaos/dev-health-web?",
    signOutLeaseOn: "Hold: what is the status of full-chaos/dev-health-web?",
    signOutLeaseOff: "Hold: what is the status of full-chaos/dev-health-web?",
    poll: "Hold: what is the status of full-chaos/dev-health-web?",
    abandon: "Hold: what is the status of full-chaos/dev-health-web?",
    reuseDrop: "Again: what is the status of full-chaos/dev-health-web?",
    thread1: "What is the status of full-chaos/dev-health-web?",
    thread2: "What is the status of full-chaos/dev-health-web?",
    thread3: "What is the status of full-chaos/dev-health-web?",
} as const;

export type QuestionCase = keyof typeof CASES;

export const questionFor = (name: QuestionCase, nonce: string): string =>
    `Case ${name} ${nonce}: ${BASE}`;

/**
 * The page-context cases (CHAOS-11940). The question names no subject, so the only subject is the
 * page's hint. Each case has its own text, so a run never reuses another case's answer.
 */
const PAGE_BASE = "where is engineering effort going in this repository over the last 30 days?";

export const PAGE_CASES = ["pageHint", "chipRemoved", "forgedId"] as const;

export type PageCase = (typeof PAGE_CASES)[number];

export const pageQuestionFor = (name: PageCase, nonce: string): string =>
    `Case ${name} ${nonce}: ${PAGE_BASE}`;

/**
 * CHAOS-3598, exit P2-4: the question chris saw answered at organization scope, asked from a
 * repository page (its hint) and from `/dev` (no hint), twice each.
 */
const LATENCY_BASE =
    "what is driving the review latency regression in this repository over the last 30 days?";

export const LATENCY_CASES = [
    "latencyPage1",
    "latencyPage2",
    "latencyDev1",
    "latencyDev2",
] as const;

export type LatencyCase = (typeof LATENCY_CASES)[number];

export const latencyQuestionFor = (name: LatencyCase, nonce: string): string =>
    `Case ${name} ${nonce}: ${LATENCY_BASE}`;
