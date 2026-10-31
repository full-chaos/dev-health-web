import { describe, expect, it } from "vitest";

import { missingDataSentence, type CoverageResult } from "../coverageModel";
import projectStatusPartial from "./captures/kiac_project_status_partial.event.json";

// CHAOS-12245: the one sentence of missing data, from the requirement rows; never a state word.
type Completeness = NonNullable<CoverageResult["completeness"]>;
const base = (projectStatusPartial as { result: { completeness: Completeness } }).result
    .completeness;
const row = (requirement: string, outcome: string, served = 0, declared = 0) => ({
    ...(base.outcomes ?? [])[0]!,
    requirement,
    obligation: requirement.split("/")[0],
    outcome,
    served,
    declared,
});
const withRows = (state: Completeness["state"], rows: ReturnType<typeof row>[]) =>
    ({ ...base, state, outcomes: rows }) as Completeness;

describe("missingDataSentence", () => {
    it("names each gap, in row order, and skips what was read in full or does not apply", () => {
        expect(
            missingDataSentence(
                withRows("degraded", [
                    row("state/subject/project", "narrowed", 2, 5),
                    row("health/subject/project", "satisfied"),
                    row("ranking/member/project", "unavailable"),
                    row("workload/member/team", "not_attempted"),
                    row("flow/member/team", "not_applicable"),
                    row("investment/member/team", "narrowed", 3, 0),
                ]),
            ),
        ).toBe(
            "Missing data: status read in part (2 of 5); ranking not available; workload not read; investment read in part.",
        );
    });

    it("takes each requirement's last row: a later stage supersedes an earlier one", () => {
        expect(
            missingDataSentence(
                withRows("partial", [
                    row("state/subject/project", "unavailable"),
                    row("state/subject/project", "satisfied"),
                ]),
            ),
        ).toBeNull();
    });

    it("says nothing for complete, not derived, or no completeness", () => {
        const gap = [row("state/subject/project", "unavailable")];
        expect(missingDataSentence(withRows("complete", gap))).toBeNull();
        expect(missingDataSentence(withRows("not_derived", gap))).toBeNull();
        expect(missingDataSentence(null)).toBeNull();
    });
});
