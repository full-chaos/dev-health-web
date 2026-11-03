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
    // CHAOS-12209 (`dev-page.spec.ts`): Expand while the run holds, then a follow-up on the thread.
    devExpand: "Hold: what is the status of full-chaos/dev-health-web?",
    devFollowUp: "What is the status of full-chaos/dev-health-web?",
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

/**
 * CHAOS-11946 (I-50, Phase 3): one question per rich view, asked twice (2 replicates per case).
 * `make-plan.ts` scripts each one's frame and claims, so the view the answer serves depends on the
 * data alone:
 *
 * - `forecast`: one team's open work. The claimed workload fact draws the completion curve, its
 *   dated trend and its claimed-fact table. `claim_first_only` claims the team's own scope: a
 *   claim over several scopes withholds the curve by design (CHAOS-4613, CHAOS-12809).
 * - `treemap`: one repository's investment. Its theme breakdown draws the treemap.
 * - `comparison`: two repositories on pull request delivery. Both sides' window measures draw the
 *   side-by-side table (only `metrics` and `pull_requests` fields compare, CHAOS-12513).
 * - `landscape`: two teams on churn and delivery units. Their landscape claims draw the quadrant,
 *   but only when both teams hold the same newest day (CHAOS-4611 ruling 3, CHAOS-12676).
 * - `cohort`: the teams that are struggling, ranked with their drivers.
 * - `sankey`: one team's effort across its repositories. The scope-anchor allocation route serves
 *   it from the team's own investment fact, and the claimed `repository_theme_breakdown` detail
 *   table draws the sankey (CHAOS-12582; NOT RUN while the stack's sankey flag is off).
 * - `window`: one team's open work over a stated date range. A non-current axis composes no
 *   effective window, so the answer must say its window was not reported (AC-7).
 */
const RICH_BASES = {
    forecast: "when will the Fullchaos team finish its open work over the last 30 days?",
    treemap:
        "where is engineering effort going in full-chaos/dev-health-acr over the last 30 days?",
    comparison:
        "compare full-chaos/dev-health-acr and full-chaos/dev-health-ops on pull request delivery over the last 30 days",
    landscape:
        "how do Fullchaos and Ops Team compare on churn and delivery units over the last 30 days?",
    cohort: "which teams are struggling and why over the last 30 days?",
    sankey: "how is the Fullchaos team's engineering effort split across its repositories over the last 30 days?",
    window: "how was the Fullchaos team's open work between 2026-10-01 and 2026-10-15?",
} as const;

export type RichCase = keyof typeof RICH_BASES;

export const RICH_CASES = Object.keys(RICH_BASES) as RichCase[];

/** The design's 2 replicates per case (E8 design §13.7). */
export const REPLICATES = [1, 2] as const;

export type Replicate = (typeof REPLICATES)[number];

export const richQuestionFor = (name: RichCase, replicate: Replicate, nonce: string): string =>
    `Case ${name}${String(replicate)} ${nonce}: ${RICH_BASES[name]}`;
