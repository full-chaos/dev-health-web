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
} as const;

export type QuestionCase = keyof typeof CASES;

export const questionFor = (name: QuestionCase, nonce: string): string =>
    `Case ${name} ${nonce}: ${BASE}`;
