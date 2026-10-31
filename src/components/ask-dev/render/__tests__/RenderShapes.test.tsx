import { act } from "react";
import { render as rtlRender } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, userEvent, within } from "@/test/utils";

const log = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { ...log, info: vi.fn() } }));
vi.mock("@/lib/echartsInit", async () => (await import("./echartsStub")).echartsStubModule);
// A figure that throws while rendering its value table, chosen by title (planted React error).
const tableThrowsFor = vi.hoisted(() => ({ title: "" }));
vi.mock("../ShapeValueTable", async (importOriginal) => {
    const real = await importOriginal<typeof import("../ShapeValueTable")>();
    return {
        ...real,
        ShapeValueTable: (props: Parameters<typeof real.ShapeValueTable>[0]) => {
            if (props.shape.title === tableThrowsFor.title) throw new Error("table failed");
            return real.ShapeValueTable(props);
        },
    };
});

import attentionRanking from "@/lib/ask-dev/render/__oracle__/captures/kiac_repo_attention_ranking.event.json";
import { formatExact } from "@/lib/ask-dev/render/format";
import { shapePositions } from "@/lib/ask-dev/render/series-option";
import {
    factOf,
    hostileLine,
    HOSTILE,
    k1,
    multiSeries,
    READINESS,
    withShapes,
    WORKLOAD,
    type Result,
} from "@/lib/ask-dev/render/__tests__/seriesFixtures";

import { AskDevAnswer } from "../../answer/AskDevAnswer";
import type { AnswerResult } from "../../answer/answerModel";
import { AskDevTurn, type TranscriptResult } from "../../answer/AskDevTurn";
import { CHART_READY_TIMEOUT_MS } from "../AskDevEChart";
import { RENDER_BOUND_MS, RenderShapesProvider, AnswerWithheldNotice } from "../RenderShapes";
import { media, stub } from "./echartsStub";

// CHAOS-11942, E8 design §4.1, §4.3, §9: figures, the occurrence ledger and its notices.
const answer = (result: Result) =>
    render(<AskDevAnswer result={result as unknown as AnswerResult} />);
const slotOf = (claimId: string) => {
    const slot = screen
        .getAllByTestId("ask-dev-fact-trend-slot")
        .find((candidate) =>
            (candidate.getAttribute("data-claim-ids") ?? "").split(" ").includes(claimId),
        );
    if (slot === undefined) throw new Error(`no slot for ${claimId}`);
    return slot;
};
const figures = () => screen.queryAllByTestId("ask-dev-render-figure");
const withheldLogs = () =>
    log.warn.mock.calls.filter(
        ([fields]) => (fields as { event?: string }).event === "ask_dev_render_withheld",
    );
const errorEvents = () =>
    log.error.mock.calls.map(([fields]) => (fields as { event?: string }).event);

beforeEach(() => {
    stub.reset();
    media.setReducedMotion(false);
    tableThrowsFor.title = "";
    log.warn.mockClear();
    log.error.mockClear();
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("a drawn chart is DRAWN only by ECharts' finished event (E8 §4.1)", () => {
    it("draws both K1 trends in their own table groups when finished comes inside setOption", () => {
        vi.useFakeTimers();
        answer(k1());
        // No timer has run: the outcome came from the event, not from a fallback.
        for (const claimId of [WORKLOAD, READINESS]) {
            const figure = within(slotOf(claimId)).getByTestId("ask-dev-render-figure");
            expect(figure).toHaveAttribute("data-state", "drawn");
            expect(within(figure).getByTestId("ask-dev-echart")).toHaveAttribute(
                "data-chart-ready",
                "true",
            );
        }
        act(() => vi.advanceTimersByTime(RENDER_BOUND_MS + 1000));
        expect(figures().map((figure) => figure.getAttribute("data-state"))).toEqual([
            "drawn",
            "drawn",
        ]);
        expect(errorEvents()).toEqual([]);
        expect(withheldLogs()).toEqual([]);
        expect(screen.queryByTestId("ask-dev-answer-withheld")).toBeNull();
    });

    it("shows the title and 'Drawing chart…' and no number while it waits for finished", () => {
        vi.useFakeTimers();
        stub.mode = "async";
        answer(k1());
        const figure = within(slotOf(WORKLOAD)).getByTestId("ask-dev-render-figure");
        expect(figure).toHaveAttribute("data-state", "pending");
        expect(within(figure).getByText("Drawing chart…")).toBeInTheDocument();
        expect(within(figure).queryByRole("table")).toBeNull();
        expect(within(figure).getByTestId("ask-dev-echart")).toHaveAttribute(
            "data-chart-ready",
            "false",
        );
        act(() => vi.advanceTimersByTime(10));
        expect(figure).toHaveAttribute("data-state", "drawn");
        expect(within(figure).getByRole("table")).toBeInTheDocument();
    });
});

describe("a chart that cannot be drawn is WITHHELD once, with one notice (E8 §4.1, §4.3)", () => {
    it.each([
        ["echarts.init throws", "init_throws" as const],
        ["setOption throws", "set_throws" as const],
    ])("%s: render_error, answer-level notice, logged once", (_, mode) => {
        vi.useFakeTimers();
        // The adapter handles the error itself: nothing reaches React's error boundary (which
        // logs through console.error), and the chart that did start is disposed on unmount.
        const reactErrors = vi.spyOn(console, "error").mockImplementation(() => undefined);
        stub.modes = [mode];
        const view = answer(k1());
        expect(within(slotOf(WORKLOAD)).queryByTestId("ask-dev-render-figure")).toBeNull();
        expect(within(slotOf(READINESS)).getByTestId("ask-dev-render-figure")).toHaveAttribute(
            "data-state",
            "drawn",
        );
        expect(screen.getByTestId("ask-dev-answer-withheld")).toHaveTextContent(
            "A chart was withheld: it could not be drawn.",
        );
        expect(within(slotOf(WORKLOAD)).queryByTestId("ask-dev-fact-trend-withheld")).toBeNull();
        act(() => vi.advanceTimersByTime(RENDER_BOUND_MS + 1000));
        expect(withheldLogs().map(([fields]) => [fields.shape_index, fields.reason])).toEqual([
            [0, "render_error"],
        ]);
        expect(errorEvents()).toEqual([]);
        expect(reactErrors).not.toHaveBeenCalled();
        view.unmount();
        expect(stub.disposed).toBe(mode === "init_throws" ? stub.inits - 1 : stub.inits);
        reactErrors.mockRestore();
    });

    it("no finished event: still PENDING just before the bound, render_timeout at it, and a loud log", () => {
        vi.useFakeTimers();
        stub.modes = ["never"];
        answer(k1());
        act(() => vi.advanceTimersByTime(CHART_READY_TIMEOUT_MS - 1));
        expect(within(slotOf(WORKLOAD)).getByTestId("ask-dev-render-figure")).toHaveAttribute(
            "data-state",
            "pending",
        );
        expect(errorEvents()).toEqual([]);
        act(() => vi.advanceTimersByTime(1));
        expect(within(slotOf(WORKLOAD)).queryByTestId("ask-dev-render-figure")).toBeNull();
        expect(screen.getByTestId("ask-dev-answer-withheld")).toHaveTextContent(
            "it could not be drawn",
        );
        expect(log.error).toHaveBeenCalledWith(
            {
                event: "ask_dev_chart_ready_timeout",
                result_id: "result_12b5069196d7adaf4208939a97b449ca",
                shape_index: 0,
                elapsed_ms: CHART_READY_TIMEOUT_MS,
            },
            expect.any(String),
        );
        expect(withheldLogs().map(([fields]) => fields.reason)).toEqual(["render_timeout"]);
    });

    it("settles once: after DRAWN the timer is gone and nothing later changes the outcome", () => {
        vi.useFakeTimers();
        answer(k1());
        // Only the answer's own bound timer is left: each chart cleared its 5 s timer on finished.
        expect(vi.getTimerCount()).toBe(1);
        act(() => vi.advanceTimersByTime(CHART_READY_TIMEOUT_MS * 3));
        expect(figures().map((figure) => figure.getAttribute("data-state"))).toEqual([
            "drawn",
            "drawn",
        ]);
        expect(errorEvents()).toEqual([]);
        expect(withheldLogs()).toEqual([]);
    });

    it("a React error in one figure withholds that figure only, even after it drew", () => {
        vi.useFakeTimers();
        tableThrowsFor.title = k1().render_shapes![0]!.title;
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        answer(k1());
        expect(within(slotOf(WORKLOAD)).queryByTestId("ask-dev-render-figure")).toBeNull();
        expect(within(slotOf(READINESS)).getByTestId("ask-dev-render-figure")).toHaveAttribute(
            "data-state",
            "drawn",
        );
        expect(screen.getByTestId("ask-dev-answer-withheld")).toHaveTextContent(
            "A chart was withheld: it could not be drawn.",
        );
        expect(withheldLogs().map(([fields]) => [fields.shape_index, fields.reason])).toEqual([
            [0, "render_error"],
        ]);
    });
});

describe("one notice owner per occurrence (E8 §4.3)", () => {
    it("a trend citing two claims: exactly one notice in the whole answer, at answer level", () => {
        const result = k1();
        const shape = structuredClone(result.render_shapes![0]!);
        shape.series[0]!.points[0]!.source.claim_id = READINESS;
        answer(withShapes(result, [shape, result.render_shapes![1]!]));
        expect(screen.getAllByText(/withheld/u)).toHaveLength(1);
        expect(screen.getByTestId("ask-dev-answer-withheld")).toHaveTextContent(
            "A chart was withheld: it does not belong to one fact table of this answer.",
        );
        expect(screen.queryAllByTestId("ask-dev-fact-trend-withheld")).toEqual([]);
    });

    it("a trend whose number disagrees with its row: the notice sits in its own table group", () => {
        const result = k1();
        const shape = structuredClone(result.render_shapes![0]!);
        shape.series[0]!.points[2]!.value += 5;
        answer(withShapes(result, [shape, result.render_shapes![1]!]));
        expect(
            within(slotOf(WORKLOAD)).getByTestId("ask-dev-fact-trend-withheld"),
        ).toHaveTextContent(
            "A chart was withheld: it could not be checked against the facts it cites in this answer.",
        );
        expect(within(slotOf(WORKLOAD)).queryByTestId("ask-dev-render-figure")).toBeNull();
        expect(screen.queryByTestId("ask-dev-answer-withheld")).toBeNull();
        expect(withheldLogs().map(([fields]) => [fields.shape_index, fields.reason])).toEqual([
            [0, "value_mismatch"],
        ]);
    });

    it("a trend owned only by a secondary claim of a group draws in that group's one slot", () => {
        const result = k1();
        const copy = structuredClone(factOf(result, WORKLOAD));
        copy.claim_id = "claim-workload-backlog-again";
        result.claimed_facts.splice(
            result.claimed_facts.indexOf(factOf(result, WORKLOAD)) + 1,
            0,
            copy,
        );
        const shape = structuredClone(result.render_shapes![0]!);
        for (const point of shape.series[0]!.points) point.source.claim_id = copy.claim_id;
        answer(withShapes(result, [shape]));
        const slot = slotOf("claim-workload-backlog-again");
        expect(slot.getAttribute("data-claim-ids")).toBe(
            `${WORKLOAD} claim-workload-backlog-again`,
        );
        expect(within(slot).getByTestId("ask-dev-render-figure")).toHaveAttribute(
            "data-state",
            "drawn",
        );
    });

    it("the ranking panel's slot draws the verified cohort shapes (CHAOS-11943)", () => {
        answer((attentionRanking as { result: unknown }).result as Result);
        const slot = screen.getByTestId("ask-dev-ranking-chart-slot");
        expect(slot).not.toHaveAttribute("hidden");
        expect(
            within(slot)
                .getAllByTestId("ask-dev-render-figure")
                .map((figure) => figure.getAttribute("data-state")),
        ).toEqual(["drawn", "drawn"]);
        expect(screen.queryByTestId("ask-dev-ranking-chart-withheld")).toBeNull();
        expect(screen.queryByTestId("ask-dev-answer-withheld")).toBeNull();
    });
});

describe("the ledger accounts for every occurrence (G4)", () => {
    it("an occurrence placed in a slot that never mounts withholds every chart at the bound, loudly", () => {
        vi.useFakeTimers();
        const result = k1();
        render(
            <RenderShapesProvider result={result} groups={[[WORKLOAD], [READINESS]]}>
                <AnswerWithheldNotice />
            </RenderShapesProvider>,
        );
        act(() => vi.advanceTimersByTime(RENDER_BOUND_MS - 1));
        expect(screen.queryByTestId("ask-dev-answer-withheld")).toBeNull();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.getByTestId("ask-dev-answer-withheld")).toHaveTextContent(
            "2 charts were withheld: the charts of this answer could not be accounted for.",
        );
        expect(log.error).toHaveBeenCalledWith(
            {
                event: "ask_dev_render_accounting_violated",
                result_id: "result_12b5069196d7adaf4208939a97b449ca",
                shapes: 2,
                missing_outcome: 0,
                duplicate_outcome: 0,
                unknown_index: 0,
                pending_after_bound: 2,
            },
            expect.any(String),
        );
        expect(withheldLogs().map(([fields]) => [fields.shape_index, fields.reason])).toEqual([
            [0, "render_accounting_violated"],
            [1, "render_accounting_violated"],
        ]);
    });
});

describe("the value table (E8 §9)", () => {
    it("lists every verified point: caption = title, header = axis then series, rows in order, — for a gap", async () => {
        const result = k1();
        const shape = multiSeries(result);
        answer(withShapes(result, [shape]));
        const figure = within(slotOf(WORKLOAD)).getByTestId("ask-dev-render-figure");
        expect(figure).toHaveAccessibleName(shape.title);
        const table = within(figure).getByRole("table", { name: shape.title });
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((th) => th.textContent),
        ).toEqual(["day", "Backlog size", "Throughput mean"]);
        const rows = within(table).getAllByRole("row").slice(1);
        const positions = shapePositions(shape);
        expect(rows.map((row) => within(row).getByRole("rowheader").textContent)).toEqual(
            positions.map((position) => position.label),
        );
        const cells = rows.map((row) =>
            within(row)
                .getAllByRole("cell")
                .map((cell) => cell.textContent),
        );
        expect(cells.map((row) => row[0])).toEqual(
            shape.series[0]!.points.map((point) => formatExact(point.value)),
        );
        const gaps = rows
            .flatMap((row) => within(row).getAllByRole("cell"))
            .filter((cell) => cell.textContent === "—");
        expect(gaps).toHaveLength(1);
        expect(gaps[0]).toHaveAttribute("aria-label", "no point");

        const toggle = within(figure).getByRole("button", { name: "Show values" });
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        expect(within(figure).getByTestId("ask-dev-shape-values")).toHaveClass("sr-only");
        await userEvent.click(toggle);
        expect(within(figure).getByRole("button", { name: "Hide values" })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
        expect(within(figure).getByTestId("ask-dev-shape-values")).not.toHaveClass("sr-only");
    });

    it("summarises with counts and the window only: no value, minimum, maximum or trend word", () => {
        answer(k1());
        const figure = within(slotOf(WORKLOAD)).getByTestId("ask-dev-render-figure");
        expect(figure).toHaveAccessibleDescription(
            "Line chart of Backlog size over day: 8 positions, 1 series. Window: Last 30 days.",
        );
    });
});

describe("a refreshed answer keeps its charts accounted for (codex r1c P2)", () => {
    it("keeps each occurrence drawn after a shallow refresh of the answer object", () => {
        vi.useFakeTimers();
        const result = k1();
        const view = answer(result);
        const inits = stub.inits;
        view.rerender(
            <AskDevAnswer
                result={{ ...result, result_id: "result_12345678" } as unknown as AnswerResult}
            />,
        );
        // Same served fields: same ledger, no new chart attempt.
        expect(stub.inits).toBe(inits);
        expect(figures().map((figure) => figure.getAttribute("data-state"))).toEqual([
            "drawn",
            "drawn",
        ]);
        act(() => vi.advanceTimersByTime(RENDER_BOUND_MS + 1000));
        expect(figures()).toHaveLength(2);
        expect(errorEvents()).toEqual([]);
        expect(screen.queryByTestId("ask-dev-answer-withheld")).toBeNull();
    });

    it("draws again against a new ledger when the table groups change but the shapes do not", () => {
        vi.useFakeTimers();
        const result = k1();
        const view = answer(result);
        const inits = stub.inits;
        // A new facts array (same facts, same shape objects): the groups and the ledger are new.
        view.rerender(
            <AskDevAnswer
                result={
                    {
                        ...result,
                        claimed_facts: [...result.claimed_facts],
                    } as unknown as AnswerResult
                }
            />,
        );
        expect(figures().map((figure) => figure.getAttribute("data-state"))).toEqual([
            "drawn",
            "drawn",
        ]);
        act(() => vi.advanceTimersByTime(RENDER_BOUND_MS + 1000));
        expect(stub.inits).toBe(inits + 2);
        expect(figures()).toHaveLength(2);
        expect(errorEvents()).toEqual([]);
        expect(withheldLogs()).toEqual([]);
    });
});

describe("a non-answer turn that carries shapes (codex r3 P2)", () => {
    it.each(["clarification_required", "no_match"] as const)(
        "%s: every served shape is withheld once, at answer level, and logged",
        (status) => {
            const turn = { ...k1(), status } as unknown as TranscriptResult;
            render(<AskDevTurn turn={turn} />);
            expect(figures()).toHaveLength(0);
            expect(screen.getByTestId("ask-dev-answer-withheld")).toHaveTextContent(
                "2 charts were withheld: they do not belong to one fact table of this answer.",
            );
            expect(withheldLogs().map(([fields]) => [fields.shape_index, fields.reason])).toEqual([
                [0, "placement_missing"],
                [1, "placement_missing"],
            ]);
        },
    );
});

describe("StrictMode replays an attempt (codex r2b P2)", () => {
    it("is not ready on a replayed attempt that never finishes, and withdraws it at the timeout", () => {
        vi.useFakeTimers();
        const result = k1();
        stub.modes = ["sync", "never"];
        rtlRender(
            <AskDevAnswer
                result={withShapes(result, [result.render_shapes![0]!]) as unknown as AnswerResult}
            />,
            { reactStrictMode: true },
        );
        expect(stub.inits).toBe(2);
        const chart = within(slotOf(WORKLOAD)).getByTestId("ask-dev-echart");
        expect(chart).toHaveAttribute("data-chart-ready", "false");
        act(() => vi.advanceTimersByTime(CHART_READY_TIMEOUT_MS));
        expect(within(slotOf(WORKLOAD)).queryByTestId("ask-dev-render-figure")).toBeNull();
        expect(screen.getByTestId("ask-dev-answer-withheld")).toHaveTextContent(
            "A chart was withheld: it could not be drawn.",
        );
    });
});

describe("a cohort shape the verifier refuses (codex r2b P2)", () => {
    it("is stated at answer level with the verifier's reason, though the ranking is not shown", () => {
        const result = structuredClone((attentionRanking as { result: unknown }).result) as Result;
        const cohort = result.cohort as unknown as {
            kind: string;
            members: { subject: { kind: string } }[];
        };
        cohort.kind = "person";
        for (const member of cohort.members) member.subject.kind = "person";
        result.render_shapes![0] = { ...result.render_shapes![0]!, kind: "quadrant" };
        answer(result);
        expect(screen.getByTestId("ask-dev-ranking-not-shown")).toBeInTheDocument();
        expect(screen.getByTestId("ask-dev-answer-withheld")).toHaveTextContent(
            "A chart was withheld: it is a kind of chart this view does not draw.",
        );
        expect(withheldLogs().map(([fields]) => [fields.shape_index, fields.reason])).toEqual([
            [0, "kind_not_drawable"],
            [1, "cohort_kind_not_ranked"],
        ]);
    });
});

describe("a redraw is a new attempt (codex r1 opinions)", () => {
    it("is not ready again until its own finished, and withdraws the figure if that never comes", () => {
        vi.useFakeTimers();
        answer(k1());
        const chart = () =>
            within(within(slotOf(WORKLOAD)).getByTestId("ask-dev-render-figure")).getByTestId(
                "ask-dev-echart",
            );
        expect(chart()).toHaveAttribute("data-chart-ready", "true");
        stub.mode = "never";
        act(() => media.setReducedMotion(true));
        expect(chart()).toHaveAttribute("data-chart-ready", "false");
        act(() => vi.advanceTimersByTime(CHART_READY_TIMEOUT_MS));
        expect(within(slotOf(WORKLOAD)).queryByTestId("ask-dev-render-figure")).toBeNull();
        expect(screen.getByTestId("ask-dev-answer-withheld")).toHaveTextContent(
            "2 charts were withheld: they could not be drawn.",
        );
    });

    it("logs the timeout with a result id in ACR's id form only", () => {
        vi.useFakeTimers();
        stub.modes = ["never"];
        const result = { ...k1(), result_id: "<img src=x onerror=alert(1)>" } as Result;
        answer(result);
        act(() => vi.advanceTimersByTime(CHART_READY_TIMEOUT_MS));
        const timeout = log.error.mock.calls.find(
            ([fields]) => (fields as { event?: string }).event === "ask_dev_chart_ready_timeout",
        );
        expect(timeout?.[0]).toMatchObject({ result_id: "unlisted", shape_index: 0 });
        expect(JSON.stringify(log.error.mock.calls)).not.toContain("<img");
    });
});

describe("reduced motion (E8 §7.1)", () => {
    it("draws with animation off when the reader asks for reduced motion, and on otherwise", () => {
        media.setReducedMotion(true);
        answer(k1());
        expect(stub.options.at(-1)!.animation).toBe(false);
        for (const chart of screen.getAllByTestId("ask-dev-echart"))
            expect(chart).toHaveAttribute("data-animation", "off");
        cleanup();
        stub.reset();
        media.setReducedMotion(false);
        answer(k1());
        expect(stub.options.at(-1)!.animation).toBe(true);
    });
});

describe("served text stays text (E8 §8)", () => {
    it("shows hostile labels as literal text and creates no element from them", () => {
        const result = k1();
        answer(withShapes(result, [hostileLine(result)]));
        const figure = within(slotOf(WORKLOAD)).getByTestId("ask-dev-render-figure");
        expect(figure.querySelector("img, script")).toBeNull();
        expect(document.querySelectorAll("img, script")).toHaveLength(0);
        expect(within(figure).getByRole("table", { name: HOSTILE[0] })).toBeInTheDocument();
        const text = figure.textContent ?? "";
        for (const hostile of [HOSTILE[0], HOSTILE[1], HOSTILE[2], HOSTILE[3], HOSTILE[5]])
            expect(text).toContain(hostile);
        // The log carries closed words only, never a served string.
        const logged = JSON.stringify([...log.warn.mock.calls, ...log.error.mock.calls]);
        for (const hostile of HOSTILE) expect(logged).not.toContain(hostile);
    });
});
