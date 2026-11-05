import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AnswerProjection } from "@full-chaos/ask-dev/render";

/**
 * ACR's bounded answers (`context_fabric_answer_projection.v1`, CHAOS-12643), copied unchanged from
 * ask-dev f59c00f9 `src/test/fixtures/bounded-answers/`. They are the output of ACR's real
 * projector (`answerprojection.Project`, then `MarkFullResultOmitted` and `Validate`, as the API's
 * `projectToCallerOption` serves an answer over the caller's byte option), regenerated at acr
 * 5cb92237 with the same content; ask-dev's `generate.go.txt` beside them rebuilds them. Not
 * edited by hand.
 */
const DIR = join(process.cwd(), "tests/fixtures/ask-dev/bounded-answers");

function load(name: string): AnswerProjection {
    return JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as AnswerProjection;
}

export const boundedAnswer = (): AnswerProjection => load("bounded-answer");
export const boundedNoMatch = (): AnswerProjection => load("bounded-no-match");
export const boundedPartialTable = (): AnswerProjection => load("bounded-partial-table");
