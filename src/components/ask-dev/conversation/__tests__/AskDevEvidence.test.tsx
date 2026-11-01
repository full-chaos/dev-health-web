import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const navigation = vi.hoisted(() => ({ pathname: "/dashboard", search: "" }));
vi.mock("next/navigation", () => ({
    usePathname: () => navigation.pathname,
    useSearchParams: () => new URLSearchParams(navigation.search),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
const session = vi.hoisted(() => ({ org: "org-1" }));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { id: "user-1", org_id: session.org }, expires: "2099-01-01" },
        status: "authenticated",
    }),
}));

import { EVIDENCE_COPY, NOT_RUN_COPY, CHAT_STATUS_COPY } from "@full-chaos/ask-dev/render";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import {
    EvidenceDrawerProvider,
    useEvidenceDrawer,
} from "@/components/evidence/EvidenceDrawerProvider";
import { CTA_LABELS } from "@/lib/design/cta";
import { claimRightDrawer, resetRightDrawerForTest } from "@/lib/shell/rightDrawer";

import { AskDevFullPage } from "../../AskDevFullPage";
import { AskDevPanel } from "../../AskDevPanel";
import { AskDevRender } from "../../AskDevRender";
import { AskDevShellProvider, useAskDevShell } from "../../AskDevShellContext";
import { AskDevConversationProvider } from "../AskDevConversationContext";
import { AskDevEvidence, evidenceFailureOf, evidenceStateOf } from "../AskDevEvidence";
import type { ConversationStore } from "../conversationStore";
import { TransportFailure, TransportRefusal, type EvidenceView } from "../transport";
import {
    acrError,
    captureResult,
    deferred,
    FakeTransport,
    summary,
    threadTurn,
    threadView,
} from "./fakeTransport";

/**
 * CHAOS-12105: an evidence reference opens in the app's one drawer, read by web and drawn by
 * ask-dev's `ChatEvidenceBody`. These tests run the real render over the real store and drawer.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const RESULT_A = PARTIAL.result_id;
const RESULT_B = "result_b_000000001";
const REF = "acr:v1:team:linear:TEAMA";
const LABEL = (PARTIAL as { evidence_ref_labels: Record<string, string> }).evidence_ref_labels[
    REF
]!;
const ON = { ask_dev: true, agent_context_runtime: true };
const THREAD = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUB_A = "sub_00000000000000000000000000000001";
const SUB_B = "sub_00000000000000000000000000000002";

const view = (citation: string, more: Partial<EvidenceView> = {}): EvidenceView => ({
    refId: REF,
    citation,
    observedAt: "2026-07-10T14:00:00Z",
    availability: "available",
    structuredFields: { status: "Backlog" },
    ...more,
});
const refused = (code: string, status: number, retryable: boolean) =>
    new TransportRefusal(status, acrError(code, status, retryable));

/** One thread of two answers that cite the same reference. */
function seeded(): FakeTransport {
    const transport = new FakeTransport();
    transport.threads.set(
        THREAD,
        threadView(THREAD, [
            threadTurn(SUB_A, "done", { resultId: RESULT_A }),
            threadTurn(SUB_B, "done", { resultId: RESULT_B }),
        ]),
    );
    transport.results.set(RESULT_A, PARTIAL);
    transport.results.set(RESULT_B, { ...PARTIAL, result_id: RESULT_B });
    transport.listPages.push({ threads: [summary(THREAD)], nextCursor: null });
    return transport;
}

function Page({ onDrawer }: { readonly onDrawer?: ReactNode }) {
    const { setOpen } = useAskDevShell();
    if (navigation.pathname === "/dev") return <AskDevFullPage />;
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                test-open
            </button>
            {onDrawer}
        </>
    );
}

function tree(transport: FakeTransport, withDrawer = true, onDrawer?: ReactNode) {
    const shell = (
        <AskDevShellProvider>
            <AskDevConversationProvider transport={transport}>
                <Page onDrawer={onDrawer} />
                <AskDevPanel />
            </AskDevConversationProvider>
        </AskDevShellProvider>
    );
    return (
        <AdminTierProvider tier="team" features={ON}>
            {withDrawer ? <EvidenceDrawerProvider>{shell}</EvidenceDrawerProvider> : shell}
        </AdminTierProvider>
    );
}

const panel = () => screen.queryByRole("complementary", { name: "Ask Dev" });
const page = () => screen.getByTestId("ask-dev-page");
const body = () => screen.findByTestId("ask-dev-evidence-body");
const closeDrawer = () => userEvent.click(screen.getByRole("button", { name: "Close" }));

/** The reference in the first answer, or in the last: an answer may show it more than once. */
async function refOnPage(which: "first" | "last" = "first") {
    await waitFor(() =>
        expect(within(page()).getAllByRole("button", { name: LABEL }).length).toBeGreaterThan(1),
    );
    const refs = within(page()).getAllByRole("button", { name: LABEL });
    return which === "first" ? refs[0]! : refs.at(-1)!;
}

/** The full page on one thread: both answers shown, the first reference clicked. */
async function openOnPage(transport: FakeTransport) {
    navigation.pathname = "/dev";
    navigation.search = `?thread=${THREAD}`;
    render(tree(transport));
    await userEvent.click(await refOnPage());
}

/** The panel on one thread, through its history. */
async function openPanelThread() {
    await userEvent.click(screen.getByRole("button", { name: "test-open" }));
    await userEvent.click(within(panel()!).getByTestId("ask-dev-history-toggle"));
    const row = await within(panel()!).findByTestId("ask-dev-history-row");
    await userEvent.click(within(row).getAllByRole("button")[0]!);
    await waitFor(() =>
        expect(within(panel()!).getAllByRole("button", { name: LABEL }).length).toBeGreaterThan(0),
    );
}

beforeEach(() => {
    session.org = "org-1";
    navigation.pathname = "/dashboard";
    navigation.search = "";
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

describe("evidenceStateOf", () => {
    it("null, and the two values ACR answers as its 404, are one neutral state", () => {
        expect(evidenceStateOf(null)).toEqual({ kind: "not_found" });
        expect(evidenceStateOf(view("x", { availability: "deleted" }))).toEqual({
            kind: "not_found",
        });
        expect(evidenceStateOf(view("x", { availability: "unauthorized" }))).toEqual({
            kind: "not_found",
        });
    });

    it("available, stale and redacted select a state", () => {
        expect(evidenceStateOf(view("x")).kind).toBe("ready");
        expect(evidenceStateOf(view("x", { availability: "stale" })).kind).toBe("stale");
        expect(
            evidenceStateOf(view("x", { availability: "redacted", redactionReason: "Why." })),
        ).toMatchObject({ kind: "redacted", reason: "Why.", detail: { citation: "x" } });
    });

    it("a redacted answer with no reason has none", () => {
        expect(evidenceStateOf(view("x", { availability: "redacted" }))).not.toHaveProperty(
            "reason",
        );
    });

    it("carries the served fields", () => {
        expect(evidenceStateOf(view("x", { excerpt: "Served." }))).toMatchObject({
            detail: {
                refId: REF,
                citation: "x",
                excerpt: "Served.",
                observedAt: "2026-07-10T14:00:00Z",
                structuredFields: { status: "Backlog" },
            },
        });
        expect(evidenceStateOf(view("x"))).not.toHaveProperty("detail.excerpt");
    });

    it("a value of the open vocabulary shows what ACR served", () => {
        expect(evidenceStateOf(view("x", { availability: "added_later" }))).toMatchObject({
            kind: "ready",
            detail: { citation: "x" },
        });
    });
});

describe("evidenceFailureOf", () => {
    it("no access is Connect, with no retry", () => {
        expect(evidenceFailureOf(new TransportFailure("authorization_required"))).toEqual({
            state: { kind: "connect" },
            retry: false,
        });
    });

    it("403 is denied, with no retry", () => {
        expect(evidenceFailureOf(refused("access_denied", 403, false))).toEqual({
            state: { kind: "denied" },
            retry: false,
        });
    });

    it("409 no_repository is its own state, with no retry", () => {
        expect(evidenceFailureOf(refused("no_repository", 409, false))).toEqual({
            state: { kind: "no_repository" },
            retry: false,
        });
    });

    it("another 409 is unavailable", () => {
        expect(evidenceFailureOf(refused("submission_in_progress", 409, true))).toEqual({
            state: { kind: "unavailable" },
            retry: true,
        });
    });

    it("ACR's retryable decides Try again on a refusal", () => {
        expect(evidenceFailureOf(refused("upstream_unavailable", 503, true)).retry).toBe(true);
        expect(evidenceFailureOf(refused("invalid_request", 413, false))).toEqual({
            state: { kind: "unavailable" },
            retry: false,
        });
    });

    it("a dropped call and a broken body are unavailable, with Try again", () => {
        expect(evidenceFailureOf(new Error("network"))).toEqual({
            state: { kind: "unavailable" },
            retry: true,
        });
        expect(evidenceFailureOf(new TransportFailure("invalid_upstream"))).toEqual({
            state: { kind: "unavailable" },
            retry: true,
        });
    });
});

describe("the drawer's body", () => {
    const REF_OF = { refId: REF, resultId: RESULT_A, label: LABEL };

    /** The part of the store the body reads, with a generation a test can move. */
    function fakeStore(read: ConversationStore["readEvidence"]) {
        const listeners = new Set<() => void>();
        let generation = 1;
        const store = {
            subscribe: (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            getSnapshot: () => ({ generation }),
            readEvidence: read,
        } as unknown as ConversationStore;
        return {
            store,
            nextGeneration() {
                generation += 1;
                for (const listener of listeners) listener();
            },
        };
    }

    it("its own abort is no failure: StrictMode's first read shows nothing of it", async () => {
        const reads: AbortSignal[] = [];
        const { store } = fakeStore(
            ({ signal }) =>
                new Promise((_, reject) => {
                    reads.push(signal);
                    signal.addEventListener("abort", () => reject(new Error("aborted")));
                }),
        );
        render(
            <StrictMode>
                <AskDevEvidence
                    store={store}
                    evidence={REF_OF}
                    generation={1}
                    onOrganizationChanged={() => undefined}
                />
            </StrictMode>,
        );
        await waitFor(() => expect(reads).toHaveLength(2));
        expect(reads[0]!.aborted).toBe(true);
        await act(async () => Promise.resolve());
        expect(screen.getByTestId("ask-dev-evidence-body")).toHaveAttribute(
            "data-state",
            "loading",
        );
    });

    it("shows nothing of another org, even before the drawer closes", async () => {
        const { store, nextGeneration } = fakeStore(async () => view("Org one only."));
        const left = vi.fn();
        render(
            <AskDevEvidence
                store={store}
                evidence={REF_OF}
                generation={1}
                onOrganizationChanged={left}
            />,
        );
        expect(await screen.findByText("Org one only.")).toBeVisible();
        act(() => nextGeneration());
        expect(screen.queryByText("Org one only.")).toBeNull();
        expect(left).toHaveBeenCalledTimes(1);
    });
});

describe("a reference in the render", () => {
    it("is plain text with no drawer", async () => {
        navigation.pathname = "/dev";
        navigation.search = `?thread=${THREAD}`;
        render(tree(seeded(), false));
        await within(page()).findAllByText(LABEL);
        expect(within(page()).queryByRole("button", { name: LABEL })).toBeNull();
    });

    it("a restored answer has its buttons on the panel's first paint", async () => {
        const transport = seeded();
        const first = render(tree(transport));
        await openPanelThread();
        first.unmount();

        render(tree(transport));
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await waitFor(() =>
            expect(
                within(panel()!).getAllByRole("button", { name: LABEL, hidden: true }).length,
            ).toBeGreaterThan(0),
        );
    });

    it("two results citing one ref open their own citation", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Cited by the first answer."));
        transport.evidence.set(`${REF}|${RESULT_B}`, view("Cited by the second answer."));
        await openOnPage(transport);
        expect(await body()).toHaveTextContent("Cited by the first answer.");
        await closeDrawer();

        await userEvent.click(await refOnPage("last"));
        const second = await body();
        await waitFor(() => expect(second).toHaveTextContent("Cited by the second answer."));
        expect(second).not.toHaveTextContent("Cited by the first answer.");
        expect(transport.evidenceCalls.map((call) => call.resultId)).toEqual([RESULT_A, RESULT_B]);
    });

    it("titles the drawer with the served label, and keeps the raw id in the closed fold", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Cited."));
        await openOnPage(transport);
        const shown = await body();
        await within(shown).findByText("Cited.");
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByRole("heading", { name: LABEL })).toBeVisible();
        const fold = shown.querySelector("details")!;
        expect(fold.open).toBe(false);
        expect(fold).toHaveTextContent(REF);
    });

    it("shows the state while the read is out, and one read for one click", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Cited."));
        const gate = deferred();
        transport.evidenceGate = gate.promise;
        await openOnPage(transport);
        expect(await body()).toHaveTextContent(EVIDENCE_COPY.loading);
        await act(async () => gate.resolve());
        expect(await body()).toHaveTextContent("Cited.");
        expect(transport.evidenceCalls).toHaveLength(1);
    });

    it("another principal's reference and one that is gone read the same, with no id", async () => {
        const transport = seeded();
        await openOnPage(transport);
        const shown = await body();
        await waitFor(() => expect(shown).toHaveAttribute("data-state", "not_found"));
        expect(shown).toHaveTextContent(EVIDENCE_COPY.notFound);
        expect(shown.textContent).not.toContain(REF);
        expect(shown.innerHTML).not.toContain(REF);
        expect(within(shown).queryByRole("button")).toBeNull();
    });

    it("a revoked session is denied, with no Try again", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, {
            fail: refused("access_denied", 403, false),
        });
        await openOnPage(transport);
        const shown = await body();
        await waitFor(() => expect(shown).toHaveAttribute("data-state", "denied"));
        expect(shown).toHaveTextContent(NOT_RUN_COPY.access_denied);
        expect(within(shown).queryByRole("button")).toBeNull();
    });

    it("an empty scope is no_repository, with no Try again", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, {
            fail: refused("no_repository", 409, false),
        });
        await openOnPage(transport);
        const shown = await body();
        await waitFor(() => expect(shown).toHaveAttribute("data-state", "no_repository"));
        expect(shown).toHaveTextContent(NOT_RUN_COPY.no_repository);
        expect(within(shown).queryByRole("button")).toBeNull();
        expect(shown.textContent).not.toMatch(/no_repository|409/u);
    });

    it("no access shows Connect, with a link back here and no Try again", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, {
            fail: new TransportFailure("authorization_required"),
        });
        await openOnPage(transport);
        const shown = await body();
        await waitFor(() => expect(shown).toHaveAttribute("data-state", "connect"));
        expect(shown).toHaveTextContent(CHAT_STATUS_COPY.connect);
        expect(within(shown).getByTestId("ask-dev-evidence-connect")).toHaveAttribute(
            "href",
            expect.stringMatching(/^\/ask-dev\/oauth\/start\?return=/u),
        );
        expect(within(shown).queryByRole("button")).toBeNull();
    });

    it("unavailable reads again on Try again, with the same result id", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, {
            fail: refused("upstream_unavailable", 503, true),
        });
        await openOnPage(transport);
        const shown = await body();
        await waitFor(() => expect(shown).toHaveAttribute("data-state", "unavailable"));
        expect(shown).toHaveTextContent(EVIDENCE_COPY.unavailable);

        transport.evidence.set(`${REF}|${RESULT_A}`, view("Back."));
        await userEvent.click(within(shown).getByRole("button", { name: CTA_LABELS.tryAgain }));
        await waitFor(() =>
            expect(screen.getByTestId("ask-dev-evidence-body")).toHaveTextContent("Back."),
        );
        expect(transport.evidenceCalls.map((call) => call.resultId)).toEqual([RESULT_A, RESULT_A]);
    });

    it("ACR's retryable false offers no Try again", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, {
            fail: refused("invalid_request", 413, false),
        });
        await openOnPage(transport);
        const shown = await body();
        await waitFor(() => expect(shown).toHaveAttribute("data-state", "unavailable"));
        expect(within(shown).queryByRole("button")).toBeNull();
    });

    it("closing the drawer aborts the read, and a late answer changes nothing", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Late."));
        const gate = deferred();
        transport.evidenceGate = gate.promise;
        await openOnPage(transport);
        await body();
        await closeDrawer();
        expect(transport.evidenceCalls[0]!.signal.aborted).toBe(true);
        await act(async () => gate.resolve());
        expect(screen.queryByTestId("ask-dev-evidence-body")).toBeNull();
    });
});

describe("the panel and the right edge", () => {
    function Other() {
        const drawer = useEvidenceDrawer();
        return (
            <button
                type="button"
                onClick={() => drawer.open({ title: "Another", content: <p>Another body</p> })}
            >
                test-other-subject
            </button>
        );
    }

    it("the drawer takes the edge from the panel, and closing it brings the panel back", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Cited."));
        render(tree(transport));
        await openPanelThread();
        const turns = within(panel()!).getAllByRole("button", { name: LABEL }).length;
        await userEvent.click(within(panel()!).getAllByRole("button", { name: LABEL })[0]!);
        expect(await body()).toHaveTextContent("Cited.");
        expect(panel()).toBeNull();

        await closeDrawer();
        await waitFor(() => expect(panel()).not.toBeNull());
        expect(screen.queryByTestId("ask-dev-evidence-body")).toBeNull();
        // The conversation is still there.
        expect(within(panel()!).getAllByRole("button", { name: LABEL })).toHaveLength(turns);
        expect(transport.threadCalls).toHaveLength(1);
    });

    it("a peer that takes the edge keeps it: the panel stays closed", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Cited."));
        render(tree(transport));
        await openPanelThread();
        await userEvent.click(within(panel()!).getAllByRole("button", { name: LABEL })[0]!);
        await body();
        act(() => claimRightDrawer("filters", () => undefined));
        await waitFor(() => expect(screen.queryByTestId("ask-dev-evidence-body")).toBeNull());
        expect(panel()).toBeNull();
    });

    it("another subject that replaces it keeps the edge: the panel stays closed", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Cited."));
        render(tree(transport, true, <Other />));
        await openPanelThread();
        await userEvent.click(within(panel()!).getAllByRole("button", { name: LABEL })[0]!);
        await body();
        // The page's own opener, behind the modal drawer: by the DOM, as a keyboard shortcut would.
        act(() => screen.getByRole("button", { name: "test-other-subject", hidden: true }).click());
        await screen.findByText("Another body");
        expect(panel()).toBeNull();
    });

    it("opened where the panel was closed, closing it opens no panel", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Cited."));
        render(tree(transport, true, <AskDevRender />));
        await openPanelThread();
        await userEvent.click(within(panel()!).getByRole("button", { name: /close/iu }));
        await waitFor(() => expect(panel()).toBeNull());

        await userEvent.click(screen.getAllByRole("button", { name: LABEL })[0]!);
        await body();
        await closeDrawer();
        await waitFor(() => expect(screen.queryByTestId("ask-dev-evidence-body")).toBeNull());
        expect(panel()).toBeNull();
    });

    it("opened from the full page, closing it opens no panel", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Cited."));
        await openOnPage(transport);
        await body();
        await closeDrawer();
        await waitFor(() => expect(screen.queryByTestId("ask-dev-evidence-body")).toBeNull());
        expect(panel()).toBeNull();
    });

    it("an org switch drops the other org's evidence, and opens no panel", async () => {
        const transport = seeded();
        transport.evidence.set(`${REF}|${RESULT_A}`, view("Org one only."));
        const shown = render(tree(transport));
        await openPanelThread();
        await userEvent.click(within(panel()!).getAllByRole("button", { name: LABEL })[0]!);
        expect(await body()).toHaveTextContent("Org one only.");

        session.org = "org-2";
        shown.rerender(tree(transport));
        await waitFor(() => expect(screen.queryByText("Org one only.")).toBeNull());
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(panel()).toBeNull();
    });
});
