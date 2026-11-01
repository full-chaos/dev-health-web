import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No canvas in jsdom: the Ask Dev charts draw through a stub that keeps ECharts' event order.
vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../render/__tests__/echartsStub")).echartsStubModule,
);
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
/** Every product telemetry event enters by `trackTelemetryEvent`: recorded, then passed on. */
const telemetry = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/telemetry", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/telemetry")>();
    return {
        ...actual,
        trackTelemetryEvent: (...args: Parameters<typeof actual.trackTelemetryEvent>) => {
            telemetry.track(...args);
            return actual.trackTelemetryEvent(...args);
        },
    };
});

/**
 * A router that changes the route the way Next does, and records every write: `push` and
 * `replace` both navigate, so the page sees its own URL change as a later render does.
 */
const nav = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    return {
        pathname: "/dashboard",
        search: "",
        writes: [] as { kind: "push" | "replace"; href: string }[],
        listeners,
        go(href: string) {
            const url = new URL(href, "http://localhost");
            nav.pathname = url.pathname;
            nav.search = url.search;
            window.history.pushState({}, "", href);
            for (const listener of listeners) listener();
        },
    };
});
vi.mock("next/navigation", async () => {
    const { useSyncExternalStore } = await import("react");
    const subscribe = (listener: () => void) => {
        nav.listeners.add(listener);
        return () => nav.listeners.delete(listener);
    };
    return {
        usePathname: () => useSyncExternalStore(subscribe, () => nav.pathname),
        useSearchParams: () =>
            new URLSearchParams(useSyncExternalStore(subscribe, () => nav.search)),
        useRouter: () => ({
            push: (href: string) => {
                nav.writes.push({ kind: "push", href });
                nav.go(href);
            },
            replace: (href: string) => {
                nav.writes.push({ kind: "replace", href });
                nav.go(href);
            },
            refresh: vi.fn(),
        }),
    };
});
/** The signed-in org; a test switches it to model an org switch. */
const session = vi.hoisted(() => ({ org: "org-1" }));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { id: "user-1", org_id: session.org }, expires: "2099-01-01" },
        status: "authenticated",
    }),
}));

import { StrictMode, useSyncExternalStore } from "react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { CTA_LABELS } from "@/lib/design/cta";
import { resetRightDrawerForTest } from "@/lib/shell/rightDrawer";

import { AskDevFullPage } from "../AskDevFullPage";
import { AskDevPanel } from "../AskDevPanel";
import { TRANSCRIPT_COPY } from "../AskDevConversationView";
import { AskDevShellProvider, useAskDevShell } from "../AskDevShellContext";
import { AskDevConversationProvider } from "../conversation/AskDevConversationContext";
import { TURN_STATUS_COPY } from "../conversation/AskDevConversationTurn";
import { COMPOSER_COPY } from "../conversation/AskDevComposer";
import { HISTORY_COPY, historyRowLabel, historyRowMeta } from "../conversation/AskDevHistory";
import { THREAD_HINT_KEY } from "../conversation/conversationStore";
import { partitionTag } from "../conversation/keys";
import { TransportFailure, type AskDevTransport } from "../conversation/transport";
import {
    accepted,
    captureResult,
    deferred,
    FakeTransport,
    resultEvent,
    summary,
    threadTurn,
    threadView,
} from "../conversation/__tests__/fakeTransport";

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const CLARIFICATION = captureResult("kiac_project_status_clarification.event.json");
const ON = { ask_dev: true, agent_context_runtime: true };
const PARTITION = ["org-1", "user-1", ""].join("\u0000");
const THREAD_A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const THREAD_B = "thread_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SUB_A = "sub_00000000000000000000000000000001";
const SUB_B = "sub_00000000000000000000000000000002";

const subscribe = (listener: () => void) => {
    nav.listeners.add(listener);
    return () => nav.listeners.delete(listener);
};

function Page() {
    const pathname = useSyncExternalStore(subscribe, () => nav.pathname);
    const { setOpen } = useAskDevShell();
    if (pathname === "/dev") return <AskDevFullPage />;
    return (
        <button type="button" onClick={() => setOpen(true)}>
            test-open
        </button>
    );
}

function renderShell(transport: AskDevTransport) {
    return render(
        <AdminTierProvider tier="team" features={ON}>
            <AskDevShellProvider>
                <AskDevConversationProvider transport={transport}>
                    <Page />
                    <AskDevPanel />
                </AskDevConversationProvider>
            </AskDevShellProvider>
        </AdminTierProvider>,
    );
}

/** Thread A (one answered turn) and thread B (one answered turn), both listed. */
function seeded(): FakeTransport {
    const transport = new FakeTransport();
    transport.threads.set(
        THREAD_A,
        threadView(THREAD_A, [threadTurn(SUB_A, "done", { resultId: PARTIAL.result_id })]),
    );
    transport.threads.set(
        THREAD_B,
        threadView(THREAD_B, [threadTurn(SUB_B, "done", { resultId: "result_b_000000001" })]),
    );
    transport.results.set(PARTIAL.result_id, PARTIAL);
    transport.results.set("result_b_000000001", { ...PARTIAL, result_id: "result_b_000000001" });
    transport.listPages.push({ threads: [summary(THREAD_A), summary(THREAD_B)], nextCursor: null });
    return transport;
}

const page = () => screen.getByTestId("ask-dev-page");
const panel = () => screen.getByRole("complementary", { name: "Ask Dev" });

beforeEach(() => {
    session.org = "org-1";
    nav.writes.length = 0;
    nav.go("/dashboard");
    window.sessionStorage.clear();
    resetRightDrawerForTest();
    vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
            matches: true,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("/dev?thread= and the store's selection (design §4.1)", () => {
    it("a URL that names a thread selects it and writes nothing", async () => {
        const transport = seeded();
        nav.go(`/dev?thread=${THREAD_A}`);
        renderShell(transport);
        expect(await within(page()).findByTestId("answer-panel")).toBeInTheDocument();
        expect(transport.threadCalls.map((call) => call.threadId)).toEqual([THREAD_A]);
        expect(nav.writes).toEqual([]);
        expect(transport.calls).toHaveLength(0);
    });

    it("a history click pushes its thread; back selects the earlier one again, and writes nothing", async () => {
        const transport = seeded();
        nav.go(`/dev?thread=${THREAD_A}`);
        renderShell(transport);
        await within(page()).findByTestId("answer-panel");
        const rows = await within(page()).findAllByTestId("ask-dev-history-open");
        await userEvent.click(rows[1]!);
        await waitFor(() => expect(nav.search).toBe(`?thread=${THREAD_B}`));
        expect(nav.writes).toEqual([{ kind: "push", href: `/dev?thread=${THREAD_B}` }]);
        await waitFor(() =>
            expect(transport.threadCalls.map((call) => call.threadId)).toEqual([
                THREAD_A,
                THREAD_B,
            ]),
        );

        act(() => nav.go(`/dev?thread=${THREAD_A}`));
        await waitFor(() =>
            expect(transport.threadCalls.map((call) => call.threadId)).toEqual([
                THREAD_A,
                THREAD_B,
                THREAD_A,
            ]),
        );
        expect(nav.writes).toHaveLength(1);
    });

    it("the first submit on bare /dev names the new thread by a replace", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        nav.go("/dev");
        renderShell(transport);
        const field = within(page()).getByRole("textbox", { name: COMPOSER_COPY.label });
        await waitFor(() => expect(field).toBeEnabled());
        await userEvent.type(field, "Which projects are at risk?{Enter}");
        await waitFor(() => expect(nav.writes).toHaveLength(1));
        expect(nav.writes[0]).toEqual({
            kind: "replace",
            href: `/dev?thread=${transport.calls[0]!.threadId}`,
        });
    });

    it("a conversation read with no ACR token shows Connect Ask Dev, read-only, with no Try again", async () => {
        const transport = seeded();
        transport.threads.set(THREAD_A, { fail: new TransportFailure("authorization_required") });
        nav.go(`/dev?thread=${THREAD_A}`);
        renderShell(transport);
        const connect = await within(page()).findByTestId("ask-dev-conversation-connect");
        expect(connect).toHaveTextContent(TRANSCRIPT_COPY.connect);
        const link = within(connect).getByRole("link", { name: "Connect Ask Dev" });
        expect(link.getAttribute("href")).toMatch(/^\/ask-dev\/oauth\/start\?return=%2F/u);
        expect(within(page()).queryByTestId("ask-dev-conversation-retry")).toBeNull();
        expect(within(page()).getByTestId("ask-dev-composer-locked")).toHaveTextContent(
            TRANSCRIPT_COPY.lockedReadOnly,
        );
        expect(connect.textContent).not.toMatch(/authorization_required|read_failed/u);
    });

    it("a malformed id shows the neutral state; New conversation names no thread", async () => {
        const transport = seeded();
        nav.go("/dev?thread=not%20a%20thread");
        renderShell(transport);
        expect(
            await within(page()).findByTestId("ask-dev-conversation-unavailable"),
        ).toHaveTextContent(TRANSCRIPT_COPY.unavailable);
        expect(within(page()).getByTestId("ask-dev-composer-locked")).toHaveTextContent(
            TRANSCRIPT_COPY.lockedReadOnly,
        );
        expect(transport.threadCalls).toEqual([]);
        expect(nav.writes).toEqual([]);

        await userEvent.click(within(page()).getByTestId("ask-dev-conversation-new"));
        await waitFor(() => expect(nav.writes).toEqual([{ kind: "replace", href: "/dev" }]));
        expect(within(page()).queryByTestId("ask-dev-composer-locked")).toBeNull();
    });

    it("the URL wins over the restore hint on /dev", async () => {
        const transport = seeded();
        window.sessionStorage.setItem(
            THREAD_HINT_KEY,
            JSON.stringify({
                thread_id: THREAD_B,
                partition: partitionTag(PARTITION),
                expires_at: null,
            }),
        );
        nav.go(`/dev?thread=${THREAD_A}`);
        renderShell(transport);
        await within(page()).findByTestId("answer-panel");
        expect(transport.threadCalls.map((call) => call.threadId)).toEqual([THREAD_A]);
    });
});

describe("the panel's history (design §4.3)", () => {
    it("a reload restores the conversation from its hint, with zero investigation calls", async () => {
        const transport = seeded();
        window.sessionStorage.setItem(
            THREAD_HINT_KEY,
            JSON.stringify({
                thread_id: THREAD_A,
                partition: partitionTag(PARTITION),
                expires_at: null,
            }),
        );
        renderShell(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(await within(panel()).findByTestId("ask-dev-answer")).toBeInTheDocument();
        expect(transport.calls).toHaveLength(0);
    });

    it("History lists the conversations; opening one shows it, and the list has no composer", async () => {
        const transport = seeded();
        renderShell(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-toggle"));
        const list = await within(panel()).findByTestId("ask-dev-history-list");
        expect(within(panel()).queryByTestId("ask-dev-composer")).toBeNull();
        expect(within(list).getAllByTestId("ask-dev-history-open")[0]).toHaveTextContent(
            historyRowLabel(summary(THREAD_A)),
        );

        await userEvent.click(within(list).getAllByTestId("ask-dev-history-open")[1]!);
        expect(await within(panel()).findByTestId("ask-dev-answer")).toBeInTheDocument();
        expect(within(panel()).getByTestId("ask-dev-composer")).toBeInTheDocument();
        expect(transport.threadCalls.map((call) => call.threadId)).toEqual([THREAD_B]);
        expect(transport.calls).toHaveLength(0);
    });

    it("a delete in the panel is gone on /dev (one store), after a confirm", async () => {
        const transport = seeded();
        renderShell(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-toggle"));
        const rows = await within(panel()).findAllByTestId("ask-dev-history-row");
        await userEvent.click(within(rows[0]!).getByTestId("ask-dev-history-delete"));
        expect(within(rows[0]!).getByTestId("ask-dev-history-confirm")).toHaveTextContent(
            HISTORY_COPY.confirm,
        );
        expect(transport.deleteCalls).toEqual([]);
        await userEvent.click(within(rows[0]!).getByTestId("ask-dev-history-confirm-delete"));
        await waitFor(() =>
            expect(within(panel()).getAllByTestId("ask-dev-history-row")).toHaveLength(1),
        );
        expect(transport.deleteCalls).toEqual([THREAD_A]);

        // The fake keeps listing A: only the store's tombstone keeps it out on /dev.
        act(() => nav.go("/dev"));
        const pageRows = await within(page()).findAllByTestId("ask-dev-history-row");
        expect(pageRows.map((row) => row.getAttribute("data-thread-id"))).toEqual([THREAD_B]);
    });

    it("the confirm for the conversation shown says a running question is not stopped", async () => {
        const transport = seeded();
        transport.scripts.push([accepted(), { wait: deferred().promise }]);
        renderShell(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-toggle"));
        await userEvent.click((await within(panel()).findAllByTestId("ask-dev-history-open"))[0]!);
        await within(panel()).findByTestId("ask-dev-answer");
        await userEvent.type(
            within(panel()).getByRole("textbox", { name: COMPOSER_COPY.label }),
            "And next?{Enter}",
        );
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-toggle"));
        const current = (await within(panel()).findAllByTestId("ask-dev-history-row")).find(
            (row) => row.getAttribute("data-current") === "true",
        )!;
        await userEvent.click(within(current).getByTestId("ask-dev-history-delete"));
        expect(within(current).getByTestId("ask-dev-history-confirm-running")).toHaveTextContent(
            HISTORY_COPY.confirmRunning,
        );
    });

    // CHAOS-12336 (T14b, the lead's ruling 2 = A): no ACR token, or ACR's 401, shows Connect Ask Dev.
    it("a list with no ACR token shows Connect Ask Dev, a link back here, and no Try again", async () => {
        const transport = seeded();
        transport.listPages.splice(0, 1, { fail: new TransportFailure("authorization_required") });
        renderShell(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-toggle"));
        const connect = await within(panel()).findByTestId("ask-dev-history-connect");
        expect(connect).toHaveTextContent(HISTORY_COPY.connect);
        const link = within(connect).getByRole("link", { name: "Connect Ask Dev" });
        expect(link.getAttribute("href")).toMatch(/^\/ask-dev\/oauth\/start\?return=%2F/u);
        expect(within(panel()).queryByTestId("ask-dev-history-retry")).toBeNull();
        expect(within(panel()).queryByTestId("ask-dev-history-read-failed")).toBeNull();
        expect(connect.textContent).not.toMatch(/authorization_required|read_failed/u);
    });

    it("a list that could not be read says so and reads again on Try again", async () => {
        const transport = seeded();
        transport.listPages.splice(0, 1, { fail: new Error("network") });
        renderShell(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-toggle"));
        expect(await within(panel()).findByTestId("ask-dev-history-read-failed")).toHaveTextContent(
            HISTORY_COPY.readFailed,
        );
        transport.listPages.splice(0, 1, { threads: [summary(THREAD_A)], nextCursor: null });
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-retry"));
        expect(await within(panel()).findAllByTestId("ask-dev-history-row")).toHaveLength(1);
    });
});

describe("restored turns in the transcript (design §3.2)", () => {
    it("a question ACR did not record is shown as such and its clarification is read-only", async () => {
        const transport = new FakeTransport();
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [
                threadTurn(SUB_A, "done", { resultId: CLARIFICATION.result_id, question: null }),
            ]),
        );
        transport.results.set(CLARIFICATION.result_id, CLARIFICATION);
        nav.go(`/dev?thread=${THREAD_A}`);
        renderShell(transport);
        expect(
            await within(page()).findByTestId("ask-dev-turn-question-not-recorded"),
        ).toHaveTextContent(TURN_STATUS_COPY.questionNotRecorded);
        await within(page()).findByRole("article");
        // Read-only: it offers no choice, and the question is never sent again.
        expect(within(page()).queryByRole("dialog")).toBeNull();
        expect(transport.calls).toHaveLength(0);
    });

    it("a recorded question keeps its clarification live", async () => {
        const transport = new FakeTransport();
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [
                threadTurn(SUB_A, "done", { resultId: CLARIFICATION.result_id }),
            ]),
        );
        transport.results.set(CLARIFICATION.result_id, CLARIFICATION);
        nav.go(`/dev?thread=${THREAD_A}`);
        renderShell(transport);
        expect(await within(page()).findByRole("dialog")).toBeInTheDocument();
    });

    it("Load again on a failed answer read is a GET, never an investigation", async () => {
        const transport = new FakeTransport();
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [
                threadTurn(SUB_A, "done", { resultId: PARTIAL.result_id, question: null }),
                threadTurn(SUB_B, "done_unsaved"),
            ]),
        );
        transport.readErrors.set(PARTIAL.result_id, new Error("network"));
        transport.results.set(PARTIAL.result_id, PARTIAL);
        nav.go(`/dev?thread=${THREAD_A}`);
        renderShell(transport);
        const reload = await within(page()).findByRole("button", {
            name: CTA_LABELS.askDevLoadAgain,
        });
        expect(within(page()).getByTestId("ask-dev-turn-question-not-recorded")).toHaveTextContent(
            TURN_STATUS_COPY.questionNotRecorded,
        );
        expect(within(page()).queryByRole("button", { name: "Retry" })).toBeNull();
        transport.readErrors.delete(PARTIAL.result_id);
        await userEvent.click(reload);
        expect(await within(page()).findByTestId("answer-panel")).toBeInTheDocument();
        expect(transport.calls).toHaveLength(0);
        expect(within(page()).getByText(TURN_STATUS_COPY.unsaved)).toBeInTheDocument();
    });
});

describe("the composer draft belongs to one conversation (codex r2 on #1648)", () => {
    const field = () => within(page()).getByRole("textbox", { name: COMPOSER_COPY.label });

    it("selecting another conversation drops the draft", async () => {
        const transport = seeded();
        nav.go(`/dev?thread=${THREAD_A}`);
        renderShell(transport);
        await within(page()).findByTestId("answer-panel");
        await userEvent.type(field(), "A draft for conversation A");
        const rows = await within(page()).findAllByTestId("ask-dev-history-open");
        await userEvent.click(rows[1]!);
        await waitFor(() => expect(nav.search).toBe(`?thread=${THREAD_B}`));
        await within(page()).findByTestId("answer-panel");
        expect(field()).toHaveValue("");
    });

    it("an org switch drops the draft, so it can never be sent to the other org", async () => {
        const transport = new FakeTransport();
        nav.go("/dev");
        const view = renderShell(transport);
        await waitFor(() => expect(field()).toBeEnabled());
        await userEvent.type(field(), "org A confidential question");
        session.org = "org-2";
        view.rerender(
            <AdminTierProvider tier="team" features={ON}>
                <AskDevShellProvider>
                    <AskDevConversationProvider transport={transport}>
                        <Page />
                        <AskDevPanel />
                    </AskDevConversationProvider>
                </AskDevShellProvider>
            </AdminTierProvider>,
        );
        await waitFor(() => expect(field()).toHaveValue(""));
        expect(transport.calls).toHaveLength(0);
    });
});

describe("Stop on a conversation restored while it runs (CHAOS-11957)", () => {
    it("offers Stop for the restored run; without a lease it says the run cannot be stopped", async () => {
        const transport = new FakeTransport();
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB_A, "running")]));
        transport.attachScripts.push([
            {
                seq: 1,
                request_id: "request_run",
                type: "accepted",
                reserved_result_id: "result_reserved_0001",
                // The page runs on the real clock: a run that started now, so D is ahead.
                started_at: new Date().toISOString(),
                budget_seconds: 110,
            },
            { wait: new Promise(() => undefined) },
        ]);
        nav.go(`/dev?thread=${THREAD_A}`);
        renderShell(transport);
        const stop = await within(page()).findByRole("button", { name: CTA_LABELS.askDevStop });
        await userEvent.click(stop);
        expect(await within(page()).findByTestId("chat-progress-stop")).toHaveTextContent(
            TURN_STATUS_COPY.stopNotLeased,
        );
        expect(within(page()).queryByRole("button", { name: CTA_LABELS.askDevStop })).toBeNull();
        expect(transport.cancelCalls).toEqual([SUB_A]);
        expect(transport.calls).toHaveLength(0);
    });
});

describe("dev StrictMode remount (CHAOS-11957)", () => {
    it("restores and attaches once: the first mount's thread read is dropped before any attach", async () => {
        const transport = new FakeTransport();
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB_A, "running")]));
        const accepted = {
            seq: 1,
            request_id: "request_run",
            type: "accepted" as const,
            reserved_result_id: "result_reserved_0001",
            started_at: new Date().toISOString(),
            budget_seconds: 110,
        };
        const hold = { wait: new Promise<void>(() => undefined) };
        transport.attachScripts.push([accepted, hold]);
        window.sessionStorage.setItem(
            THREAD_HINT_KEY,
            JSON.stringify({
                thread_id: THREAD_A,
                partition: partitionTag(PARTITION),
                expires_at: null,
            }),
        );
        render(
            <StrictMode>
                <AdminTierProvider tier="team" features={ON}>
                    <AskDevShellProvider>
                        <AskDevConversationProvider transport={transport}>
                            <Page />
                            <AskDevPanel />
                        </AskDevConversationProvider>
                    </AskDevShellProvider>
                </AdminTierProvider>
            </StrictMode>,
        );
        await waitFor(() => expect(transport.attachCalls.length).toBeGreaterThanOrEqual(1));
        expect(transport.attachCalls.every((call) => call.lastEventId === undefined)).toBe(true);
        // Dev StrictMode mounts, unmounts (a clear) and mounts again: the first selection's thread
        // read is stale before it can attach, so exactly one attach follows the run.
        expect(transport.attachCalls).toHaveLength(1);
        expect(transport.attachCalls[0]!.signal.aborted).toBe(false);
        expect(transport.threadCalls).toHaveLength(2);
        expect(transport.calls).toHaveLength(0);
    });
});

describe("the first question as the row title (CHAOS-12238)", () => {
    const QUESTION =
        "Which teams are overloaded this quarter, and what is driving it across the platform org?";

    async function historyOf(firstQuestionA: string | null) {
        const transport = seeded();
        transport.listPages.length = 0;
        transport.listPages.push({
            threads: [{ ...summary(THREAD_A), firstQuestion: firstQuestionA }, summary(THREAD_B)],
            nextCursor: null,
        });
        renderShell(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.click(within(panel()).getByTestId("ask-dev-history-toggle"));
        const list = await within(panel()).findByTestId("ask-dev-history-list");
        return within(list).getAllByTestId("ask-dev-history-open");
    }

    it("titles a row by its first question on one line, with the full text on hover and focus, then the date and count", async () => {
        const [a, b] = await historyOf(QUESTION);
        const title = within(a!).getByTestId("ask-dev-history-question");
        expect(title.textContent).toBe(QUESTION);
        expect(title).toHaveAttribute("title", QUESTION);
        expect(title).toHaveClass("truncate");
        expect(title.className).toMatch(/group-hover:whitespace-normal/u);
        expect(title.className).toMatch(/group-focus-visible:whitespace-normal/u);
        expect(within(a!).getByTestId("ask-dev-history-meta").textContent).toBe(
            historyRowMeta(summary(THREAD_A)),
        );
        expect(a).toHaveAccessibleName(expect.stringContaining(QUESTION));
        // A row with no first question keeps the date-and-count label of CHAOS-11956.
        expect(b).toHaveTextContent(historyRowLabel(summary(THREAD_B)));
        expect(within(b!).queryByTestId("ask-dev-history-question")).toBeNull();
    });

    it("never shows a blank title: a blank first question keeps the date-and-count label", async () => {
        const [a] = await historyOf("   \n\t ");
        expect(within(a!).queryByTestId("ask-dev-history-question")).toBeNull();
        expect(a).toHaveTextContent(historyRowLabel(summary(THREAD_A)));
    });

    it("shows the question as inert text, and logs or reports none of it", async () => {
        // The logger is the file's mock: every level's calls are recorded. Every telemetry event
        // enters by trackTelemetryEvent, recorded above (codex r1 on #1656: logs alone did not cover
        // telemetry). Opening and hovering the row are the interactions it has.
        const { logger } = await import("@/lib/logger");
        telemetry.track.mockClear();
        const hostile = '<img src=x onerror="alert(1)"> see https://evil.example/x';
        const [a] = await historyOf(hostile);
        await userEvent.click(a!);
        await userEvent.hover(a!);
        expect(within(a!).getByTestId("ask-dev-history-question").textContent).toBe(hostile);
        expect(a!.querySelector("img, a")).toBeNull();
        const calls = Object.values(logger).map(
            (fn) => (fn as ReturnType<typeof vi.fn>).mock.calls,
        );
        expect(JSON.stringify(calls)).not.toContain("evil.example");
        expect(JSON.stringify(telemetry.track.mock.calls)).not.toContain("evil.example");
    });
});
