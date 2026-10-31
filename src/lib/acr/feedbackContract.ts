/**
 * The check of the ACR feedback body in the browser (CHAOS-11958).
 *
 * The browser reads and sets `…/investigations/feedback/{result_id}` directly, and checks each body
 * against `context_fabric_result_feedback.v1` before the feedback store maps it. As for the thread
 * bodies (`threadContract.ts`), the check is Ajv standalone code generated from the vendored schema
 * (`threadValidators.js`, `scripts/acr-contract-artifacts.mjs`): no eval at runtime, no
 * hand-written second implementation, and `pnpm acr:contracts:check` fails on any drift.
 *
 * This module only MAPS a body that passed to the view the store reads: the result id and the two
 * flags. `updated_at` is not read.
 *
 * Do not import `ajv` or `@/lib/acr/contracts` here: both would put the runtime Ajv in the browser.
 */
import type { FeedbackFlag, FeedbackView } from "@/components/ask-dev/conversation/transport";

import { validateResultFeedback } from "./threadValidators";

type FeedbackBody = {
    readonly result_id: string;
    readonly correct: FeedbackFlag;
    readonly useful: FeedbackFlag;
};

/** The view of a `context_fabric_result_feedback.v1` body, or `null` when it breaks the contract. */
export function parseResultFeedback(body: unknown): FeedbackView | null {
    if (!validateResultFeedback(body)) return null;
    const feedback = body as FeedbackBody;
    return { resultId: feedback.result_id, correct: feedback.correct, useful: feedback.useful };
}
