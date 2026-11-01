import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { AskDevChat, CHAT_PROGRESS_COPY, type BatchItem } from "@full-chaos/ask-dev/render";

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
    threadTurn,
    threadView,
} from "./fakeTransport";

/**
 * CHAOS-12383: the adapter under ask-dev's real `AskDevChat`, so the seam's promises hold where the
 * viewer meets them: a Retry, a refusal's narrower re-ask, a question that was not recorded, a
 * batch that waits its turn, and the composer between items.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const CLARIFICATION = captureResult("kiac_project_status_clarification.event.json");
const ORG_A = "org-a\u0000user-1\u0000";
const THREAD_A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUB = "sub_00000000000000000000000000000001";
const QUESTION = "Which projects are at risk?";
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");

let transport: FakeTransport;

function capturedRefusal(file: string): InvestigationEvent {
    return JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as InvestigationEvent;
}

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

async function ask(question = QUESTION) {
    await userEvent.type(field(), `${question}{Enter}`);
}

beforeEach(() => {
    transport = new FakeTransport();
    window.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
});

describe("the composer and the store", () => {
    it("keeps the question until it is answered, then clears it", async () => {
        const { source } = makeSource();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        render(<AskDevChat source={source} />);
        await ask();
        expect(field()).toBeDisabled();
        gate.resolve();
        await screen.findByTestId("answer-panel");
        await waitFor(() => expect(field()).toHaveValue(""));
    });

    it("every in-flight outcome holds it: a recovering run too", async () => {
        const { store, source } = makeSource();
        transport.statusHangs = true;
        transport.scripts.push([]);
        render(<AskDevChat source={source} />);
        await ask();
        await waitFor(() =>
            expect(store.getSnapshot().turns.at(-1)!.outcome.kind).toBe("recovering"),
        );
        expect(await screen.findByText(CHAT_PROGRESS_COPY.recovering)).toBeInTheDocument();
        expect(field()).toBeDisabled();
    });

    it("Stop is offered while a run can be stopped, and reaches the store", async () => {
        const { store, source } = makeSource();
        transport.cancelAnswers.push({ kind: "running" });
        transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
        render(<AskDevChat source={source} />);
        await ask();
        await waitFor(() =>
            expect(store.getSnapshot().turns.at(-1)!.reservedResultId).toBeDefined(),
        );
        await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
        expect(await screen.findByText(CHAT_PROGRESS_COPY.canceling)).toBeInTheDocument();
        expect(transport.cancelCalls).toHaveLength(1);
    });

    it("a clarification opens the popup, and a pick sends one re-ask with no second bubble", async () => {
        const { source } = makeSource();
        transport.scripts.push(
            [accepted(), resultEvent(CLARIFICATION)],
            [accepted(), resultEvent(PARTIAL)],
        );
        render(<AskDevChat source={source} />);
        // A real result echoes the question it was asked, and a re-ask resends that text.
        await ask(CLARIFICATION.question);
        const dialog = await screen.findByRole("dialog");
        const buttons = within(dialog).getAllByRole("button");
        const option = buttons.find((button) =>
            button.className.includes("clarification-popup__option"),
        );
        await userEvent.click(option!);
        await waitFor(() => expect(transport.calls).toHaveLength(2));
        const request = transport.calls[1]!.request;
        expect(request.question).toBe(CLARIFICATION.question);
        expect(request.parent_result_id).toBe(CLARIFICATION.result_id);
        expect(
            [
                request.prior_kind_receipts,
                request.prior_anchor_receipts,
                request.prior_handle_receipts,
                request.prior_window_receipts,
                request.prior_candidate_receipts,
                request.prior_subject_receipts,
            ].flat().length,
        ).toBeGreaterThan(0);
        await screen.findByTestId("answer-panel");
        expect(
            screen.getAllByText(CLARIFICATION.question, { selector: ".chat__bubble" }),
        ).toHaveLength(1);
    });
});

describe("Retry", () => {
    it("is the same submission id, through the composer", async () => {
        const { source } = makeSource();
        transport.scripts.push(
            [{ fail: new TransportRefusal(503, acrError("upstream_unavailable", 503, true)) }],
            [accepted(), resultEvent(PARTIAL)],
        );
        render(<AskDevChat source={source} />);
        await ask();
        const retry = await screen.findByRole("button", { name: "Retry" });
        await userEvent.click(retry);
        await screen.findByTestId("answer-panel");
        expect(transport.calls).toHaveLength(2);
        expect(transport.calls[1]!.submissionId).toBe(transport.calls[0]!.submissionId);
        await waitFor(() => expect(field()).toHaveValue(""));
    });

    it("is not offered on a turn the store cannot send again", async () => {
        const { source } = makeSource();
        transport.scripts.push([accepted(), errorEvent("internal_error")]);
        render(<AskDevChat source={source} />);
        await ask();
        await screen.findByTestId("chat-status");
        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });
});

describe("a budget refusal", () => {
    it("shows the render's words and the narrower re-ask, and re-asks a new turn", async () => {
        const { source } = makeSource();
        transport.scripts.push(
            [accepted(), capturedRefusal("acr_encoder_budget_refusal_result_count.event.json")],
            [accepted(), resultEvent(PARTIAL)],
        );
        render(<AskDevChat source={source} />);
        await ask();
        const refusal = await screen.findByTestId("ask-dev-refusal");
        expect(refusal).toHaveAttribute("data-kind", "budget");
        expect(refusal).toHaveAttribute("data-axis", "result_count");
        expect(within(refusal).getByTestId("ask-dev-refusal-overrun")).toHaveTextContent(
            "It held 41 items; an answer can hold 30.",
        );
        // No code, status or internal name reaches the viewer.
        expect(refusal.textContent).not.toMatch(/acr_|413|budget_refusal/u);
        expect(within(refusal).queryByRole("button", { name: "Retry" })).toBeNull();

        await userEvent.click(within(refusal).getByTestId("ask-dev-refusal-reask"));
        await waitFor(() => expect(transport.calls).toHaveLength(2));
        expect(transport.calls[1]!.request.question).toBe(
            "Which projects are at risk, top 5 only?",
        );
        // A new question: a new submission, not the refused one again.
        expect(transport.calls[1]!.submissionId).not.toBe(transport.calls[0]!.submissionId);
    });

    it("a second refusal narrows the viewer's own question, not the narrowed text", async () => {
        const { source } = makeSource();
        const refusal = () => capturedRefusal("acr_encoder_budget_refusal_result_count.event.json");
        transport.scripts.push([accepted(), refusal()], [accepted(), refusal()], []);
        render(<AskDevChat source={source} />);
        await ask();
        await userEvent.click(await screen.findByTestId("ask-dev-refusal-reask"));
        await waitFor(() => expect(transport.calls).toHaveLength(2));
        await waitFor(() =>
            expect(screen.getAllByTestId("ask-dev-refusal-reask").length).toBeGreaterThan(0),
        );
        await waitFor(() => expect(screen.getAllByTestId("ask-dev-refusal")).toHaveLength(2));
        const buttons = screen.getAllByTestId("ask-dev-refusal-reask");
        await userEvent.click(buttons.at(-1)!);
        await waitFor(() => expect(transport.calls).toHaveLength(3));
        expect(transport.calls[2]!.request.question).toBe(
            "Which projects are at risk, top 5 only?",
        );
    });
});

describe("a restored conversation", () => {
    function restored(question: string | null, resultId = CLARIFICATION.result_id) {
        transport.results.set(resultId, CLARIFICATION);
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done", { resultId, question })]),
        );
    }

    it("a question ACR did not record says so, offers no choice, and sends nothing", async () => {
        const { store, source } = makeSource();
        restored(null);
        render(<AskDevChat source={source} />);
        act(() => {
            store.selectThread(THREAD_A, "local");
        });
        expect(await screen.findByTestId("ask-dev-turn-question-not-recorded")).toHaveTextContent(
            "Question not recorded",
        );
        await waitFor(() => expect(store.getSnapshot().thread.kind).toBe("loaded"));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(transport.calls).toHaveLength(0);
    });

    it("Load again is a GET", async () => {
        const { store, source } = makeSource();
        transport.readErrors.set(PARTIAL.result_id, new Error("offline"));
        transport.results.set(PARTIAL.result_id, PARTIAL);
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done", { resultId: PARTIAL.result_id })]),
        );
        render(<AskDevChat source={source} />);
        act(() => {
            store.selectThread(THREAD_A, "local");
        });
        const reload = await screen.findByRole("button", { name: "Load again" });
        transport.readErrors.clear();
        await userEvent.click(reload);
        await screen.findByTestId("answer-panel");
        expect(transport.calls).toHaveLength(0);
    });
});

describe("no token, a closed door", () => {
    it("a connect turn shows web's link and no Retry", async () => {
        const { source } = makeSource();
        transport.scripts.push([{ fail: new TransportFailure("authorization_required") }]);
        render(<AskDevChat source={source} />);
        await ask();
        const status = await screen.findByTestId("chat-status");
        expect(status).toHaveAttribute("data-status", "connect");
        expect(within(status).getByRole("link", { name: "Connect Ask Dev" })).toHaveAttribute(
            "data-testid",
            "ask-dev-connect",
        );
        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });
});

describe("a batch, seen by the viewer", () => {
    const item = (receiptId: string): BatchItem => ({
        priorSubjectReceipts: [{ result_id: CLARIFICATION.result_id, receipt_id: receiptId }],
        structureBatch: {},
        chosenSubject: undefined,
        selectionEvents: [],
    });

    it("says where each item stands, and the composer holds until the last one ended", async () => {
        const { store, source } = makeSource();
        const [one, two] = [deferred(), deferred()];
        transport.scripts.push(
            [accepted(), resultEvent(CLARIFICATION)],
            [accepted(), { wait: one.promise }, resultEvent(PARTIAL)],
            [accepted(), { wait: two.promise }, resultEvent(PARTIAL)],
        );
        render(
            <StrictMode>
                <AskDevChat source={source} />
            </StrictMode>,
        );
        await ask();
        await screen.findByRole("dialog");

        act(() => {
            source.askBatch([item("subject-a"), item("subject-b")], QUESTION);
        });
        expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
        expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
        expect(screen.getByText(CHAT_PROGRESS_COPY.queued)).toBeInTheDocument();
        expect(field()).toBeDisabled();

        await act(async () => {
            one.resolve();
            await waitFor(() => expect(transport.calls).toHaveLength(3));
        });
        expect(screen.queryByText(CHAT_PROGRESS_COPY.queued)).toBeNull();
        expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
        expect(field()).toBeDisabled();

        await act(async () => {
            two.resolve();
            await waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        });
        await waitFor(() => expect(field()).toBeEnabled());
        expect(screen.getAllByTestId("answer-panel")).toHaveLength(2);
    });
});
