import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

const log = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { ...log, info: vi.fn() } }));
vi.mock("@/lib/echartsInit", async () => (await import("./echartsStub")).echartsStubModule);

import {
    kiacRanking,
    memberOf,
    seedRanking,
    shapeOf,
    topRanked,
    withShapes,
    type Result,
} from "@/lib/ask-dev/render/__tests__/cohortFixtures";

import { AskDevAnswer } from "../../answer/AskDevAnswer";
import type { AnswerResult } from "../../answer/answerModel";
import { stub } from "./echartsStub";

// CHAOS-11943, E8 design §7.4, §10, §5.3: the cohort charts in the ranking panel's chart slot.
const answer = (result: Result) =>
    render(<AskDevAnswer result={result as unknown as AnswerResult} />);
const slot = () => screen.getByTestId("ask-dev-ranking-chart-slot");
const figures = () => within(slot()).queryAllByTestId("ask-dev-render-figure");
const events = (name: string) =>
    log.warn.mock.calls.filter(([fields]) => (fields as { event?: string }).event === name);
const withheldReasons = () =>
    events("ask_dev_render_withheld").map(([fields]) => [
        (fields as { shape_index: number }).shape_index,
        (fields as { reason: string }).reason,
    ]);

beforeEach(() => {
    stub.reset();
    log.warn.mockClear();
    log.error.mockClear();
});
afterEach(() => cleanup());

describe("the ranking panel draws the verified cohort charts", () => {
    it("draws the attention bars and the driver stack above the table, each with its summary", () => {
        const result = kiacRanking();
        answer(result);
        const [bars, stack] = figures();
        expect([bars, stack].map((figure) => figure!.getAttribute("data-state"))).toEqual([
            "drawn",
            "drawn",
        ]);
        expect(bars).toHaveAccessibleDescription(
            /^Bar chart of attention score by repository: 4 positions, 1 series\. Window: .+\.$/u,
        );
        expect(stack).toHaveAccessibleDescription(
            /^Stacked bar chart of points contributed by repository: 4 positions, 2 series\. Window: .+\. No total is shown\.$/u,
        );
        // The slot sits above the ranking table.
        const table = within(screen.getByTestId("ask-dev-ranking")).getAllByRole("table").at(-1)!;
        expect(
            slot().compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(screen.queryByTestId("ask-dev-answer-withheld")).toBeNull();
    });

    it("lists each stack segment in the value table, with no total column", () => {
        const result = kiacRanking();
        answer(result);
        const stack = figures()[1]!;
        const table = within(stack).getByRole("table", {
            name: shapeOf(result, "cohort_driver_contribution").title,
        });
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((th) => th.textContent),
        ).toEqual([
            "repository",
            ...shapeOf(result, "cohort_driver_contribution").series.map((series) => series.label),
        ]);
        expect(table.textContent).not.toMatch(/total/iu);
    });

    it("seed (F13): the caption names the ranked teams with no score", () => {
        answer(seedRanking());
        for (const figure of figures())
            expect(figure).toHaveAccessibleDescription(/ 2 ranked teams have no score\./u);
    });

    it("a chart citing fewer members than ACR's selection: plain counts, and a counts-only log", () => {
        const result = kiacRanking();
        const bars = structuredClone(shapeOf(result, "cohort_attention_score"));
        bars.series[0]!.points.pop();
        answer(withShapes(result, [bars]));
        expect(figures()[0]).toHaveAccessibleDescription(/ Shows 3 of 4 ranked repositories\.$/u);
        const [mismatch] = events("ask_dev_cohort_coverage_mismatch");
        expect(mismatch?.[0]).toEqual({
            event: "ask_dev_cohort_coverage_mismatch",
            result_id: result.result_id,
            shape_index: 0,
            ranked: 4,
            scored: 4,
            expected: 4,
            cited: 3,
        });
    });
});

describe("web guards at mount (E8 §5.3)", () => {
    it("G2: a score with no driver behind it withholds the whole attention chart, in the slot", () => {
        const result = kiacRanking();
        memberOf(result, topRanked(result)).drivers = [];
        answer(withShapes(result, [shapeOf(result, "cohort_attention_score")]));
        expect(figures()).toHaveLength(0);
        expect(screen.getByTestId("ask-dev-ranking-chart-withheld")).toHaveTextContent(
            "A chart was withheld: it could not be checked against the facts it cites in this answer.",
        );
        expect(withheldReasons()).toEqual([[0, "chart_score_without_drivers"]]);
    });

    it("G2: a point whose member has no ranking row withholds the whole attention chart", () => {
        const result = kiacRanking();
        const bars = structuredClone(shapeOf(result, "cohort_attention_score"));
        const last = bars.series[0]!.points.at(-1)!.source.subject_canonical_id!;
        memberOf(result, last).ranking_computed = false;
        answer(withShapes(result, [bars]));
        expect(figures()).toHaveLength(0);
        expect(withheldReasons()).toEqual([[0, "chart_score_without_ranking_row"]]);
    });

    it("G6: a stack with a negative segment is withheld, never drawn with signed stacking", () => {
        const result = kiacRanking();
        const stack = structuredClone(shapeOf(result, "cohort_driver_contribution"));
        const point = stack.series[0]!.points[0]!;
        const driver = memberOf(result, point.source.subject_canonical_id!).drivers!.find(
            (candidate) => candidate.signal === point.source.signal,
        )!;
        driver.weight_contributed = -5;
        point.value = -5;
        answer(withShapes(result, [stack]));
        expect(figures()).toHaveLength(0);
        expect(withheldReasons()).toEqual([[0, "signed_stack_unsupported"]]);
        expect(screen.getByTestId("ask-dev-ranking-chart-withheld")).toBeInTheDocument();
    });
});
