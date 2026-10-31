import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// No canvas in jsdom: the Ask Dev charts draw through a stub that keeps ECharts' event order.
vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../../render/__tests__/echartsStub")).echartsStubModule,
);
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { buildInvestigationRequest } from "@/lib/ask-dev/request-builder";

import {
    AskDevConversationTurn,
    NOT_RUN_COPY,
    retryAfterText,
    STOPPED_COPY,
    TURN_STATUS_COPY,
} from "../AskDevConversationTurn";
import { formatElapsed, PROGRESS_COPY, STAGE_COPY, stageRows } from "../AskDevProgress";
import type { StoreTurn, TurnOutcome } from "../conversationStore";
import { captureResult } from "./fakeTransport";

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const STARTED = Date.parse("2026-10-30T12:00:00Z");

function turn(outcome: TurnOutcome): StoreTurn {
    return {
        id: 0,
        threadId: "thread_00000000000000000000000000000001",
        origin: "submitted",
        question: "Which projects are at risk?",
        createdAt: "2026-10-30T12:00:00.000Z",
        submissionId: "sub_00000000000000000000000000000001",
        request: buildInvestigationRequest({
            question: "Which projects are at risk?",
            requestId: "request_000000000000000000000001",
        }),
        outcome,
    };
}

/**
 * Plan §2.7.8 "never": an answer card, "no issues found", coverage or a score, outside a validated
 * `result` (checks 11, 12). These are the answer views' own markers.
 */
const ANSWER_MARKERS = [
    "ask-dev-answer-lead",
    "ask-dev-answer-status",
    "ask-dev-answer-fact-tables",
    "ask-dev-coverage",
    "ask-dev-coverage-state",
    "ask-dev-ranking-score",
    "ask-dev-ranking-table",
    "ask-dev-render-figure",
    "ask-dev-clarification",
    "ask-dev-refusal",
];

function expectNoAnswerContent(container: HTMLElement) {
    for (const marker of ANSWER_MARKERS) {
        expect(container.querySelector(`[data-testid="${marker}"]`), marker).toBeNull();
    }
    expect(container.querySelector('[data-testid*="score"]')).toBeNull();
    expect(container.textContent).not.toMatch(/no issues|coverage|complete(?:ness)?\b/iu);
}

afterEach(() => {
    vi.useRealTimers();
});

describe("each panel state has its own copy and no answer content (plan §2.7.8)", () => {
    const cases: [string, TurnOutcome, string][] = [
        [
            "streaming",
            { kind: "running", startedAt: STARTED, stages: {} },
            TURN_STATUS_COPY.running,
        ],
        ["recovering", { kind: "recovering", startedAt: STARTED }, TURN_STATUS_COPY.recovering],
        [
            "deadline: model",
            { kind: "deadline", deadline: "model" },
            TURN_STATUS_COPY.deadline.model,
        ],
        [
            "deadline: request",
            { kind: "deadline", deadline: "request" },
            TURN_STATUS_COPY.deadline.request,
        ],
        [
            "deadline: admission",
            { kind: "deadline", deadline: "admission" },
            TURN_STATUS_COPY.deadline.admission,
        ],
        [
            "budget exhausted",
            { kind: "deadline", deadline: "budget_exhausted" },
            TURN_STATUS_COPY.deadline.budget_exhausted,
        ],
        [
            "429 principal concurrency",
            { kind: "limited", limit: "principal", retry: true, retryAfterSeconds: 30 },
            TURN_STATUS_COPY.limited.principal,
        ],
        [
            "429 org concurrency",
            { kind: "limited", limit: "org", retry: true, retryAfterSeconds: 30 },
            TURN_STATUS_COPY.limited.org,
        ],
        [
            "429 concurrency, limit unknown",
            { kind: "limited", limit: "concurrency", retry: true },
            TURN_STATUS_COPY.limited.concurrency,
        ],
        [
            "429 allowance exhausted",
            { kind: "limited", limit: "allowance", retry: false, retryAfterSeconds: 86_400 * 9 },
            TURN_STATUS_COPY.limited.allowance,
        ],
        ["stream_unavailable", { kind: "stream_unavailable" }, TURN_STATUS_COPY.streamUnavailable],
        [
            "submission mismatch",
            { kind: "mismatch", reference: "req_abc" },
            TURN_STATUS_COPY.mismatch,
        ],
        ["submission unsaved", { kind: "unsaved" }, TURN_STATUS_COPY.unsaved],
        ["submission abandoned", { kind: "abandoned" }, TURN_STATUS_COPY.abandoned],
        ["transport canceled", { kind: "canceled" }, TURN_STATUS_COPY.canceled],
        ["transport interrupted", { kind: "interrupted" }, TURN_STATUS_COPY.interrupted],
        ["transport stalled", { kind: "stalled" }, TURN_STATUS_COPY.stalled],
        [
            "other error",
            { kind: "failed", retry: false, reference: "req_abc" },
            TURN_STATUS_COPY.failed,
        ],
        [
            "other error, retryable",
            { kind: "failed", retry: true, reference: "req_abc" },
            TURN_STATUS_COPY.failedRetry,
        ],
        ["thread closed", { kind: "thread_closed" }, TURN_STATUS_COPY.threadClosed],
        // CHAOS-11957: Stop through the cancel endpoint.
        ["canceling (202)", { kind: "canceling", startedAt: STARTED }, TURN_STATUS_COPY.canceling],
        ["stopped or interrupted", { kind: "halted" }, TURN_STATUS_COPY.halted],
    ];

    it.each(cases)("%s", (_name, outcome, copy) => {
        const { container } = render(<AskDevConversationTurn turn={turn(outcome)} />);
        const view = screen.getByTestId("ask-dev-turn");
        expect(view.dataset.status).toBe(outcome.kind);
        expect(screen.getByTestId("ask-dev-turn-status").textContent).toBe(copy);
        // The question the user asked stays on screen.
        expect(view.textContent).toContain("Which projects are at risk?");
        expectNoAnswerContent(container);
    });

    it("gives every state distinct copy", () => {
        const copies = cases.map(([, , copy]) => copy);
        expect(new Set(copies).size).toBe(copies.length);
    });

    it("draws the answer core only for a validated result", () => {
        render(<AskDevConversationTurn turn={turn({ kind: "answered", result: PARTIAL })} />);
        expect(screen.queryByTestId("ask-dev-turn-status")).toBeNull();
        expect(screen.queryByTestId("ask-dev-stages")).toBeNull();
        expect(screen.getAllByTestId("ask-dev-answer-lead").length).toBeGreaterThan(0);
    });
});

describe("the streaming state: stage checklist and elapsed time", () => {
    it("lists the five stages in order, with the state of each", () => {
        render(
            <AskDevConversationTurn
                turn={turn({
                    kind: "running",
                    startedAt: STARTED,
                    stage: "reading_facts",
                    stages: { interpreting: "completed", reading_facts: "started" },
                })}
            />,
        );
        const list = screen.getByRole("list", { name: PROGRESS_COPY.steps });
        const rows = within(list).getAllByRole("listitem");
        expect(rows.map((row) => [row.dataset.stage, row.dataset.state])).toEqual([
            ["interpreting", "done"],
            ["resolving_subjects", "skipped"],
            ["reading_facts", "active"],
            ["synthesizing", "pending"],
            ["validating", "pending"],
        ]);
        expect(rows[0]!.textContent).toBe(`${STAGE_COPY.interpreting}: done`);
        expect(rows[1]!.textContent).toBe(`${STAGE_COPY.resolving_subjects}: skipped`);
        expect(rows[2]!.textContent).toBe(`${STAGE_COPY.reading_facts}: in progress`);
        expect(rows[3]!.textContent).toBe(`${STAGE_COPY.synthesizing}: not started`);
    });

    it("counts the elapsed time from the run's start, once a second", () => {
        vi.useFakeTimers();
        vi.setSystemTime(STARTED + 4_000);
        render(
            <AskDevConversationTurn
                turn={turn({ kind: "running", startedAt: STARTED, stages: {} })}
            />,
        );
        expect(screen.getByTestId("ask-dev-elapsed-value").textContent).toBe("0:04");
        act(() => {
            vi.advanceTimersByTime(61_000);
        });
        expect(screen.getByTestId("ask-dev-elapsed-value").textContent).toBe("1:05");
    });

    it("keeps counting while it recovers, and drops the checklist", () => {
        vi.useFakeTimers();
        vi.setSystemTime(STARTED + 12_000);
        render(<AskDevConversationTurn turn={turn({ kind: "recovering", startedAt: STARTED })} />);
        expect(screen.getByTestId("ask-dev-elapsed-value").textContent).toBe("0:12");
        expect(screen.queryByTestId("ask-dev-stages")).toBeNull();
    });

    it.each([
        [{}, ["pending", "pending", "pending", "pending", "pending"]],
        [{ interpreting: "started" }, ["active", "pending", "pending", "pending", "pending"]],
        [
            { interpreting: "started", synthesizing: "started" },
            ["done", "skipped", "skipped", "active", "pending"],
        ],
        [{ validating: "completed" }, ["skipped", "skipped", "skipped", "skipped", "done"]],
    ] as const)("stageRows(%j)", (stages, states) => {
        expect(stageRows(stages).map((row) => row.state)).toEqual(states);
    });

    it.each([
        [0, "0:00"],
        [999, "0:00"],
        [59_000, "0:59"],
        [3_599_000, "59:59"],
        [3_600_000, "1:00:00"],
        [-5_000, "0:00"],
    ])("formatElapsed(%d) = %s", (ms, text) => {
        expect(formatElapsed(ms)).toBe(text);
    });
});

describe("Retry-After, references and retry", () => {
    it.each([
        [0, "You can try again now."],
        [1, "Try again in 1 second."],
        [30, "Try again in 30 seconds."],
        [60, "Try again in about 1 minute."],
        [61, "Try again in about 2 minutes."],
        [3_600, "Try again in about 1 hour."],
        [7_201, "Try again in about 3 hours."],
        [86_400 * 9, "Try again in about 9 days."],
    ])("retryAfterText(%d)", (seconds, text) => {
        expect(retryAfterText(seconds)).toBe(text);
    });

    it("shows ACR's Retry-After under a limit, and no line without one", () => {
        const { rerender } = render(
            <AskDevConversationTurn
                turn={turn({ kind: "limited", limit: "org", retry: true, retryAfterSeconds: 90 })}
            />,
        );
        expect(screen.getByTestId("ask-dev-turn-retry-after").textContent).toBe(
            "Try again in about 2 minutes.",
        );
        rerender(
            <AskDevConversationTurn turn={turn({ kind: "limited", limit: "org", retry: true })} />,
        );
        expect(screen.queryByTestId("ask-dev-turn-retry-after")).toBeNull();
    });

    it("shows the reference of another error as plain text", () => {
        render(
            <AskDevConversationTurn
                turn={turn({ kind: "failed", retry: false, reference: "req_0123456789abcdef" })}
            />,
        );
        expect(screen.getByTestId("ask-dev-turn-reference").textContent).toBe(
            `${TURN_STATUS_COPY.reference}: req_0123456789abcdef`,
        );
    });

    it("offers Retry only where the store allows it", async () => {
        const onRetry = vi.fn();
        const { rerender } = render(
            <AskDevConversationTurn
                turn={turn({ kind: "limited", limit: "principal", retry: true })}
                onRetry={onRetry}
            />,
        );
        await userEvent.click(screen.getByTestId("ask-dev-turn-retry"));
        expect(onRetry).toHaveBeenCalledTimes(1);
        for (const outcome of [
            { kind: "limited", limit: "allowance", retry: false },
            { kind: "deadline", deadline: "budget_exhausted" },
            { kind: "stalled" },
            { kind: "stream_unavailable" },
            { kind: "failed", retry: false },
        ] as const) {
            rerender(<AskDevConversationTurn turn={turn(outcome)} onRetry={onRetry} />);
            expect(screen.queryByTestId("ask-dev-turn-retry"), outcome.kind).toBeNull();
        }
    });
});

// CHAOS-12201: each refusal before a run says what to do; none reads as an outage or names a service.
describe("AskDevConversationTurn: not-run refusals", () => {
    it.each([
        ["access_denied", false],
        ["no_repository", false],
        ["not_entitled", false],
        ["repo_forbidden", false],
        ["budget_refusal", false],
        ["rate_limited", true],
    ] as const)("%s shows its own guidance (retry %s)", async (reason, retry) => {
        const onRetry = vi.fn();
        render(
            <AskDevConversationTurn
                turn={turn({ kind: "not_run", reason, retry })}
                onRetry={onRetry}
            />,
        );
        const status = screen.getByTestId("ask-dev-turn-status");
        expect(status).toHaveTextContent(NOT_RUN_COPY[reason]);
        expect(status.textContent).not.toMatch(/temporarily|Agent Context Runtime|ACR/u);
        if (retry) {
            await userEvent.click(screen.getByRole("button", { name: "Retry" }));
            expect(onRetry).toHaveBeenCalledOnce();
        } else {
            expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
        }
    });

    it("gives every reason different words, and access_denied names both ways back", () => {
        const copy = Object.values(NOT_RUN_COPY);
        expect(new Set(copy).size).toBe(copy.length);
        expect(NOT_RUN_COPY.access_denied).toMatch(/Sign in again/u);
        expect(NOT_RUN_COPY.access_denied).toMatch(/admin/u);
    });
});

// codex r3 on #1639: a run ACR stopped after it started says why, and offers no retry.
describe("AskDevConversationTurn: stopped runs", () => {
    it.each(["rate_limited", "interpretation_rejected", "synthesis_rejected"] as const)(
        "%s shows its own words and no Retry",
        (reason) => {
            render(
                <AskDevConversationTurn
                    turn={turn({ kind: "stopped", reason })}
                    onRetry={vi.fn()}
                />,
            );
            const status = screen.getByTestId("ask-dev-turn-status");
            expect(status).toHaveTextContent(STOPPED_COPY[reason]);
            expect(status.textContent).not.toMatch(
                /did not finish|temporarily|Agent Context Runtime/u,
            );
            expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
        },
    );

    it("tells the user to wait a moment after a rate limit", () => {
        expect(STOPPED_COPY.rate_limited).toMatch(/Wait a moment/u);
    });
});

describe("AskDevConversationTurn: Stop's progress (CHAOS-11957)", () => {
    const running: TurnOutcome = { kind: "running", startedAt: STARTED, stages: {} };

    it("says Stopping… while ACR has not answered", () => {
        render(<AskDevConversationTurn turn={{ ...turn(running), stop: "requested" }} />);
        expect(screen.getByTestId("ask-dev-turn-stop")).toHaveTextContent(
            TURN_STATUS_COPY.stopRequested,
        );
    });

    it("says a run without a lease cannot be stopped, and keeps its progress", () => {
        render(<AskDevConversationTurn turn={{ ...turn(running), stop: "not_leased" }} />);
        expect(screen.getByTestId("ask-dev-turn-stop")).toHaveTextContent(
            TURN_STATUS_COPY.stopNotLeased,
        );
        expect(screen.getByTestId("ask-dev-turn-status")).toHaveTextContent(
            TURN_STATUS_COPY.running,
        );
    });

    it("keeps counting the elapsed time while it cancels", () => {
        render(<AskDevConversationTurn turn={turn({ kind: "canceling", startedAt: STARTED })} />);
        expect(screen.getByTestId("ask-dev-elapsed")).toBeInTheDocument();
        expect(screen.queryByTestId("ask-dev-turn-stop")).toBeNull();
    });
});

describe("AskDevConversationTurn: the observation cap (E6 design v5 N4)", () => {
    it("shows a last-seen time only when a read confirmed it", () => {
        const { rerender } = render(
            <AskDevConversationTurn turn={turn({ kind: "unconfirmed" })} />,
        );
        expect(screen.getByTestId("ask-dev-turn-status")).toHaveTextContent(
            TURN_STATUS_COPY.unconfirmed,
        );
        expect(screen.queryByTestId("ask-dev-turn-last-seen")).toBeNull();
        expect(screen.getByTestId("ask-dev-turn").textContent).not.toContain("still running");
        rerender(
            <AskDevConversationTurn
                turn={turn({ kind: "unconfirmed", lastSeenRunningAt: STARTED })}
            />,
        );
        expect(screen.getByTestId("ask-dev-turn-last-seen")).toHaveTextContent(
            TURN_STATUS_COPY.lastSeenRunning,
        );
    });
});
