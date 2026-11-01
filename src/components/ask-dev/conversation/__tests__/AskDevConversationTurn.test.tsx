import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
    AskDevChat,
    CHAT_PROGRESS_COPY,
    CHAT_STAGE_COPY,
    CHAT_STATUS_COPY,
    NOT_RUN_COPY,
    retryAfterText,
    STOPPED_COPY,
} from "@full-chaos/ask-dev/render";

import { createChatSource, type HostChatSource } from "../chatSource";
import { ConversationStore } from "../conversationStore";
import { FeedbackStore } from "../feedbackStore";
import { TransportFailure, TransportRefusal, type InvestigationEvent } from "../transport";
import {
    accepted,
    acrError,
    captureResult,
    deferred,
    errorEvent,
    FakeTransport,
    resultEvent,
    stageEvent,
    threadTurn,
    threadView,
} from "./fakeTransport";

/**
 * Plan §2.7.8 (CHAOS-11929, CHAOS-12201, CHAOS-11957): every state a web turn can end in, reached
 * by the real store and drawn by ask-dev's own render (CHAOS-12384). The map from a store outcome to
 * the seam is pinned in `chatSource.test.tsx`; here the viewer's words are held: one line each, no
 * answer content, a Retry only where the store allows one.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const ORG_A = "org-a\u0000user-1\u0000";
const THREAD_A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUB = "sub_00000000000000000000000000000001";
const QUESTION = "Which projects are at risk?";

let transport: FakeTransport;

function makeSource(): { store: ConversationStore; source: HostChatSource } {
    let n = 0;
    const store = new ConversationStore({
        transport,
        hints: { read: () => null, write: () => undefined, clear: () => undefined },
        sleep: async () => undefined,
        uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    });
    store.setPartition(ORG_A);
    const feedback = new FeedbackStore({ transport });
    feedback.setPartition(ORG_A);
    return { store, source: createChatSource({ store, feedback }) };
}

const field = () => screen.getByRole("textbox", { name: "Ask a question" });

async function ask() {
    await userEvent.type(field(), `${QUESTION}{Enter}`);
}

const LIMIT = (limit: "principal" | "org", retryAfter?: number) =>
    new TransportRefusal(
        429,
        {
            ...acrError("concurrency_limited", 429, true),
            error: {
                ...acrError("concurrency_limited", 429, true).error,
                details: { limit },
            },
        },
        retryAfter,
    );

const DEADLINE = (deadline: string): InvestigationEvent =>
    ({
        ...errorEvent("upstream_unavailable"),
        error: {
            ...acrError("upstream_unavailable", 504, false),
            error: {
                ...acrError("upstream_unavailable", 504, false).error,
                details: { deadline },
            },
        },
    }) as InvestigationEvent;

beforeEach(() => {
    transport = new FakeTransport();
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    window.history.pushState(null, "", "/");
});

describe("each state the store reaches has its own words and no answer content", () => {
    type Script = Parameters<FakeTransport["scripts"]["push"]>[0];
    const cases: [string, string, Script, string][] = [
        [
            "deadline: model",
            "deadline",
            [accepted(), DEADLINE("model")],
            CHAT_STATUS_COPY.deadline.model,
        ],
        [
            "deadline: request",
            "deadline",
            [accepted(), DEADLINE("request")],
            CHAT_STATUS_COPY.deadline.request,
        ],
        [
            "deadline: admission",
            "deadline",
            [{ fail: new TransportFailure("admission_timeout") }],
            CHAT_STATUS_COPY.deadline.admission,
        ],
        [
            "429 principal concurrency",
            "limited",
            [{ fail: LIMIT("principal", 30) }],
            CHAT_STATUS_COPY.limited.principal,
        ],
        [
            "429 org concurrency",
            "limited",
            [{ fail: LIMIT("org", 30) }],
            CHAT_STATUS_COPY.limited.org,
        ],
        [
            "stream_unavailable",
            "stream_unavailable",
            [{ fail: new TransportRefusal(406, acrError("stream_unavailable", 406, false)) }],
            CHAT_STATUS_COPY.stream_unavailable,
        ],
        [
            "submission mismatch",
            "mismatch",
            [{ fail: new TransportRefusal(409, acrError("submission_mismatch", 409, false)) }],
            CHAT_STATUS_COPY.mismatch,
        ],
        [
            "submission unsaved",
            "unsaved",
            [accepted(), errorEvent("submission_unsaved")],
            CHAT_STATUS_COPY.unsaved,
        ],
        [
            "submission abandoned",
            "abandoned",
            [{ fail: new TransportRefusal(409, acrError("submission_abandoned", 409, false)) }],
            CHAT_STATUS_COPY.abandoned,
        ],
        [
            "transport canceled",
            "canceled",
            [accepted(), errorEvent("canceled")],
            CHAT_STATUS_COPY.canceled,
        ],
        [
            "transport interrupted",
            "interrupted",
            [accepted(), errorEvent("run_lost")],
            CHAT_STATUS_COPY.interrupted,
        ],
        [
            "transport stalled",
            "stalled",
            [{ fail: new TransportFailure("stalled") }],
            CHAT_STATUS_COPY.stalled,
        ],
        [
            "other error",
            "failed",
            [accepted(), errorEvent("internal_error")],
            CHAT_STATUS_COPY.failed,
        ],
        [
            "thread closed",
            "thread_closed",
            [accepted(), errorEvent("thread_closed")],
            CHAT_STATUS_COPY.thread_closed,
        ],
        // CHAOS-12104: no ACR access in this tab, or ACR's 401.
        [
            "connect",
            "connect",
            [{ fail: new TransportFailure("authorization_required") }],
            CHAT_STATUS_COPY.connect,
        ],
    ];

    it.each(cases)("%s", async (_name, kind, script, words) => {
        const { source } = makeSource();
        transport.scripts.push(script);
        render(<AskDevChat source={source} />);
        await ask();
        const status = await screen.findByTestId("chat-status");
        expect(status.dataset.status).toBe(kind);
        expect(within(status).getByText(words)).toBeInTheDocument();
        // The question the user asked stays on screen.
        expect(screen.getByText(QUESTION, { selector: ".chat__bubble" })).toBeInTheDocument();
        // Plan §2.7.8 "never": no answer content outside a validated result (checks 11, 12).
        expect(screen.queryByTestId("answer-panel")).toBeNull();
    });

    it("gives every state distinct words", () => {
        const copies = cases.map(([, , , words]) => words);
        expect(new Set(copies).size).toBe(copies.length);
    });

    it("connect: links to the ACR authorization with this page as the way back, and offers no retry", async () => {
        window.history.pushState(null, "", "/dev?thread=thread_00000000000000000000000000000001");
        const { source } = makeSource();
        transport.scripts.push([{ fail: new TransportFailure("authorization_required") }]);
        render(<AskDevChat source={source} />);
        await ask();
        const link = await screen.findByRole("link", { name: "Connect Ask Dev" });
        await waitFor(() =>
            expect(link.getAttribute("href")).toBe(
                "/ask-dev/oauth/start?return=%2Fdev%3Fthread%3Dthread_00000000000000000000000000000001",
            ),
        );
        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });

    it("draws the answer only for a validated result", async () => {
        const { source } = makeSource();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        render(<AskDevChat source={source} />);
        await ask();
        expect(await screen.findByTestId("answer-panel")).toBeInTheDocument();
        expect(screen.queryByTestId("chat-status")).toBeNull();
        expect(screen.queryByTestId("chat-progress")).toBeNull();
    });
});

describe("the streaming state: stage checklist and elapsed time", () => {
    it("lists the five stages in order, with the state of each, and the elapsed time", async () => {
        const { source } = makeSource();
        transport.scripts.push([
            accepted(),
            stageEvent("interpreting", "started", 100),
            stageEvent("interpreting", "completed", 200),
            stageEvent("reading_facts", "started", 300),
            { wait: new Promise(() => undefined) },
        ]);
        render(<AskDevChat source={source} />);
        await ask();
        const list = await screen.findByRole("list", { name: CHAT_STAGE_COPY.steps });
        await waitFor(() =>
            expect(
                within(list)
                    .getAllByRole("listitem")
                    .map((row) => [row.dataset.stage, row.dataset.state]),
            ).toEqual([
                ["interpreting", "done"],
                ["resolving_subjects", "skipped"],
                ["reading_facts", "active"],
                ["synthesizing", "pending"],
                ["validating", "pending"],
            ]),
        );
        expect(screen.getByTestId("chat-elapsed")).toBeInTheDocument();
    });

    it("keeps counting while it recovers, and drops the checklist", async () => {
        const { store, source } = makeSource();
        transport.statusHangs = true;
        transport.scripts.push([]);
        render(<AskDevChat source={source} />);
        await ask();
        await waitFor(() =>
            expect(store.getSnapshot().turns.at(-1)!.outcome.kind).toBe("recovering"),
        );
        expect(await screen.findByText(CHAT_PROGRESS_COPY.recovering)).toBeInTheDocument();
        expect(screen.getByTestId("chat-elapsed")).toBeInTheDocument();
        expect(screen.queryByRole("list", { name: CHAT_STAGE_COPY.steps })).toBeNull();
    });
});

describe("Retry-After, references and retry", () => {
    it("shows ACR's Retry-After under a limit", async () => {
        const { source } = makeSource();
        transport.scripts.push([{ fail: LIMIT("org", 90) }]);
        render(<AskDevChat source={source} />);
        await ask();
        expect(await screen.findByTestId("chat-status-retry-after")).toHaveTextContent(
            "Try again in about 2 minutes.",
        );
        expect(retryAfterText(90)).toBe("Try again in about 2 minutes.");
    });

    it("shows no Retry-After line when ACR sent none", async () => {
        const { source } = makeSource();
        transport.scripts.push([{ fail: LIMIT("org") }]);
        render(<AskDevChat source={source} />);
        await ask();
        await screen.findByTestId("chat-status");
        expect(screen.queryByTestId("chat-status-retry-after")).toBeNull();
    });

    it("shows the reference of another error as plain text", async () => {
        const { source } = makeSource();
        transport.scripts.push([accepted(), errorEvent("internal_error")]);
        render(<AskDevChat source={source} />);
        await ask();
        expect(await screen.findByTestId("chat-status-reference")).toHaveTextContent(
            `${CHAT_STATUS_COPY.reference}: req_test`,
        );
    });

    it("offers Retry where the store allows it, and sends the same submission again", async () => {
        const { source } = makeSource();
        transport.scripts.push(
            [{ fail: LIMIT("principal", 1) }],
            [accepted(), resultEvent(PARTIAL)],
        );
        render(<AskDevChat source={source} />);
        await ask();
        await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
        await screen.findByTestId("answer-panel");
        expect(transport.calls).toHaveLength(2);
        expect(transport.calls[1]!.submissionId).toBe(transport.calls[0]!.submissionId);
    });

    it.each([
        [
            "allowance exhausted",
            new TransportRefusal(429, acrError("allowance_exhausted", 429, false)) as unknown,
        ],
        ["stalled", new TransportFailure("stalled") as unknown],
        [
            "stream unavailable",
            new TransportRefusal(406, acrError("stream_unavailable", 406, false)) as unknown,
        ],
    ])("offers no Retry where the store does not: %s", async (_name, failure) => {
        const { source } = makeSource();
        transport.scripts.push([{ fail: failure }]);
        render(<AskDevChat source={source} />);
        await ask();
        await screen.findByTestId("chat-status");
        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });

    it("a deadline that ran out of budget offers no Retry, and says it ran out", async () => {
        const { source } = makeSource();
        transport.scripts.push([{ fail: new TransportFailure("budget_exhausted") }]);
        render(<AskDevChat source={source} />);
        await ask();
        const status = await screen.findByTestId("chat-status");
        expect(status).toHaveTextContent(CHAT_STATUS_COPY.deadline.budget_exhausted);
        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });
});

// CHAOS-12201: each refusal before a run says what to do; none reads as an outage or names a service.
describe("not-run refusals", () => {
    it.each([
        ["access_denied", 403, "access_denied", false],
        ["no_repository", 409, "no_repository", false],
        ["not_entitled", 403, "feature_not_enabled", false],
        ["repo_forbidden", 403, "repo_forbidden", false],
        ["rate_limited", 429, "rate_limited", true],
    ] as const)("%s shows its own guidance (retry %s)", async (reason, status, code, retry) => {
        const { source } = makeSource();
        transport.scripts.push([
            { fail: new TransportRefusal(status, acrError(code, status, retry)) },
        ]);
        render(<AskDevChat source={source} />);
        await ask();
        const view = await screen.findByTestId("chat-status");
        expect(view.dataset.status).toBe("not_run");
        expect(view).toHaveTextContent(NOT_RUN_COPY[reason]);
        expect(view.textContent).not.toMatch(/temporarily|Agent Context Runtime|ACR/u);
        if (retry) {
            expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        } else {
            expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
        }
    });
});

// codex r3 on #1639: a run ACR stopped after it started says why, and offers no retry.
describe("stopped runs", () => {
    it.each(["interpretation_rejected", "synthesis_rejected"] as const)(
        "%s shows its own words and no Retry",
        async (code) => {
            const { source } = makeSource();
            transport.scripts.push([accepted(), errorEvent(code)]);
            render(<AskDevChat source={source} />);
            await ask();
            const view = await screen.findByTestId("chat-status");
            expect(view.dataset.status).toBe("stopped");
            expect(view).toHaveTextContent(STOPPED_COPY[code]);
            expect(view.textContent).not.toMatch(
                /did not finish|temporarily|Agent Context Runtime/u,
            );
            expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
        },
    );
});

describe("Stop's progress (CHAOS-11957)", () => {
    it("says Stopping… while ACR has not answered, then that a run without a lease cannot be stopped", async () => {
        const { store, source } = makeSource();
        const gate = deferred();
        transport.cancelGate = gate.promise;
        transport.cancelAnswers.push({ kind: "not_leased" });
        transport.statusHangs = true;
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "running", { at: new Date().toISOString() })]),
        );
        render(<AskDevChat source={source} />);
        act(() => {
            store.selectThread(THREAD_A, "local");
        });
        await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
        expect(await screen.findByTestId("chat-progress-stop")).toHaveTextContent(
            CHAT_PROGRESS_COPY.stopRequested,
        );
        await act(async () => {
            gate.resolve();
        });
        await waitFor(() =>
            expect(screen.getByTestId("chat-progress-stop")).toHaveTextContent(
                CHAT_PROGRESS_COPY.stopNotLeased,
            ),
        );
        expect(transport.cancelCalls).toEqual([SUB]);
    });
});
