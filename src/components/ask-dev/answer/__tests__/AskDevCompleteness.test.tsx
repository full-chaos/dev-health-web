import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../../render/__tests__/echartsStub")).echartsStubModule,
);

import { AskDevAnswer } from "../AskDevAnswer";
import type { AnswerResult } from "../answerModel";
import type { CoverageResult } from "../coverageModel";
import ciRateComplete from "./captures/kiac_repo_ci_rate_complete.event.json";
import ownerComplete from "./captures/kiac_repo_owner_complete.event.json";
import projectStatusPartial from "./captures/kiac_project_status_partial.event.json";
import teamOpenWorkDegraded from "./captures/kiac_team_open_work_degraded.event.json";

/**
 * CHAOS-12245, chris's ruling (2026-10-31): "web never shows the raw completeness state". The
 * answer's `completeness.state` is a machine field. `complete` adds nothing; `not_derived` (and a
 * result with no completeness) renders nothing; `partial` and `degraded` add at most one plain
 * sentence that names the data that was missing, never the state word. Real kiac answers.
 */
type Result = AnswerResult & CoverageResult;
const resultOf = (event: { result: unknown }) => event.result as Result;
const copyOf = (event: { result: unknown }) => structuredClone(resultOf(event));

const notDerived = resultOf(ciRateComplete);
const partial = resultOf(ownerComplete);
const degraded = resultOf(teamOpenWorkDegraded);

/** Words that name a completeness state, or only restate one. */
const STATE_WORDS =
    /\b(complete|completeness|partial|degraded|not[ _]derived|not known|unknown)\b|Everything this answer needed was read|Only part of what this answer needed|could not be read/iu;

const answer = () => screen.getByTestId("ask-dev-answer");
const stateLine = () => within(answer()).queryByTestId("ask-dev-coverage-state");
const note = () => within(answer()).queryByTestId("ask-dev-answer-completeness");
const coverageText = () =>
    within(answer()).getByTestId("ask-dev-coverage-completeness").textContent;

describe("the captures hold each state", () => {
    it("has not_derived, partial and degraded answers", () => {
        expect(notDerived.completeness.state).toBe("not_derived");
        expect(partial.completeness.state).toBe("partial");
        expect(degraded.completeness.state).toBe("degraded");
    });
});

describe("web never shows the raw completeness state (CHAOS-12245)", () => {
    it("complete: nothing extra", () => {
        const complete = copyOf(projectStatusPartial);
        complete.completeness.state = "complete";
        complete.completeness.outcomes = (complete.completeness.outcomes ?? []).map((row) => ({
            ...row,
            outcome: "satisfied",
        }));
        render(<AskDevAnswer result={complete} />);
        expect(stateLine()).toBeNull();
        expect(note()).toBeNull();
        expect(coverageText()).not.toMatch(STATE_WORDS);
    });

    it("not_derived: nothing at all about completeness; the pill claims neither full nor a gap", () => {
        render(<AskDevAnswer result={notDerived} />);
        expect(stateLine()).toBeNull();
        expect(note()).toBeNull();
        expect(coverageText()).not.toMatch(STATE_WORDS);
        expect(within(answer()).getByTestId("ask-dev-answer-status")).toHaveTextContent(
            /^Answer$/u,
        );
    });

    it("no completeness on the result: nothing at all about completeness", () => {
        const absent = copyOf(projectStatusPartial) as unknown as Record<string, unknown>;
        delete absent.completeness;
        render(<AskDevAnswer result={absent as unknown as Result} />);
        expect(stateLine()).toBeNull();
        expect(note()).toBeNull();
    });

    it("partial: exactly one plain sentence, in the coverage block, that names what was read only in part", () => {
        render(<AskDevAnswer result={partial} />);
        // codex r1 on #1650: at most one sentence, so it is said once, where completeness lives.
        expect(note()).toBeNull();
        expect(stateLine()).toHaveTextContent(
            /^Missing data: health read in part \(1 of 1\); status read in part \(1 of 4\)\.$/u,
        );
        expect(answer().textContent?.split("Missing data:")).toHaveLength(2);
        expect(stateLine()?.textContent).not.toMatch(STATE_WORDS);
    });

    it("degraded: exactly one plain sentence that names what was not available", () => {
        render(<AskDevAnswer result={degraded} />);
        expect(answer().textContent?.split("Missing data:")).toHaveLength(2);
        const lines = [stateLine(), note()].filter((line) => line !== null);
        for (const line of lines) {
            expect(line.textContent).toBe(
                "Missing data: health read in part (1 of 1); ranking not available; status read in part (2 of 5).",
            );
            expect(line.textContent).not.toMatch(STATE_WORDS);
        }
        expect(lines.length).toBeGreaterThan(0);
    });

    it("partial with no requirement gap named: nothing, never the state word", () => {
        const bare = copyOf(ownerComplete);
        bare.completeness.outcomes = [];
        render(<AskDevAnswer result={bare} />);
        expect(stateLine()).toBeNull();
        expect(note()).toBeNull();
    });
});
