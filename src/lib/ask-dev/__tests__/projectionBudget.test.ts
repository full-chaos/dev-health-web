import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AnswerProjection } from "@full-chaos/ask-dev/render";
import { describe, expect, it } from "vitest";

import {
    budgetIsConsistent,
    isAnswerProjection,
    OMISSION_COUNTS,
    type ProjectionBudget,
} from "../projectionBudget";

/**
 * CHAOS-12643: ACR's rule for a bounded answer's budget (acr `validate_context_fabric_answer_
 * projection.go`): `truncated` iff a count is above zero or the whole result was withheld.
 */

const DIR = join(process.cwd(), "tests/fixtures/ask-dev/bounded-answers");
const fixture = (name: string) =>
    JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as AnswerProjection;

const nothingCut = (): ProjectionBudget => {
    const budget = {
        ...fixture("bounded-answer").projection_budget,
        truncated: false,
        values_clamped: 0,
        full_result_omitted: false,
    };
    for (const key of OMISSION_COUNTS) budget[key] = 0;
    return budget;
};

describe("ACR's budget rule", () => {
    it("holds for every bounded answer ACR's projector produced", () => {
        for (const name of ["bounded-answer", "bounded-no-match", "bounded-partial-table"]) {
            expect(budgetIsConsistent(fixture(name).projection_budget), name).toBe(true);
        }
    });

    it.each(OMISSION_COUNTS)("reads %s: truncated must follow it", (key) => {
        expect(budgetIsConsistent({ ...nothingCut(), [key]: 1, truncated: true })).toBe(true);
        expect(budgetIsConsistent({ ...nothingCut(), [key]: 1, truncated: false })).toBe(false);
    });

    it("reads values_clamped and full_result_omitted the same way", () => {
        expect(budgetIsConsistent({ ...nothingCut(), values_clamped: 1, truncated: true })).toBe(
            true,
        );
        expect(budgetIsConsistent({ ...nothingCut(), values_clamped: 1 })).toBe(false);
        expect(
            budgetIsConsistent({ ...nothingCut(), full_result_omitted: true, truncated: true }),
        ).toBe(true);
        expect(budgetIsConsistent({ ...nothingCut(), full_result_omitted: true })).toBe(false);
    });

    it("refuses truncated with nothing cut, and accepts nothing cut and not truncated", () => {
        expect(budgetIsConsistent({ ...nothingCut(), truncated: true })).toBe(false);
        expect(budgetIsConsistent(nothingCut())).toBe(true);
    });
});

describe("isAnswerProjection", () => {
    it("names ACR's bounded form by its schema version only", () => {
        expect(isAnswerProjection(fixture("bounded-answer"))).toBe(true);
        expect(
            isAnswerProjection({ schema_version: "context_fabric_investigation_result.v2" }),
        ).toBe(false);
        expect(isAnswerProjection(null)).toBe(false);
        expect(isAnswerProjection("context_fabric_answer_projection.v1")).toBe(false);
    });
});
