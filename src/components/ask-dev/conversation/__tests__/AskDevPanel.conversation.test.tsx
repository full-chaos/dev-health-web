import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No canvas in jsdom: the Ask Dev charts draw through a stub that keeps ECharts' event order.
vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../../render/__tests__/echartsStub")).echartsStubModule,
);
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { id: "user-1", org_id: "org-1" }, expires: "2099-01-01" },
        status: "authenticated",
    }),
}));

import { AdminTierProvider } from "@/components/admin/AdminTierContext";

import { AskDevPanel } from "../../AskDevPanel";
import { AskDevShellProvider, useAskDevShell } from "../../AskDevShellContext";
import { AskDevConversationProvider } from "../AskDevConversationContext";
import { TURN_STATUS_COPY } from "../AskDevConversationTurn";
import { COMPOSER_COPY } from "../AskDevComposer";
import type { AskDevTransport } from "../transport";
import { accepted, captureResult, deferred, FakeTransport, resultEvent } from "./fakeTransport";

const PARTIAL = captureResult("kiac_project_status_partial.event.json");

function OpenClose() {
    const { open, setOpen } = useAskDevShell();
    return (
        <button type="button" onClick={() => setOpen(!open)}>
            {open ? "test-close" : "test-open"}
        </button>
    );
}

function renderPanel(transport: AskDevTransport | null) {
    return render(
        <AdminTierProvider tier="team" features={{ ask_dev: true, agent_context_runtime: true }}>
            <AskDevShellProvider>
                <AskDevConversationProvider transport={transport}>
                    <OpenClose />
                    <AskDevPanel />
                </AskDevConversationProvider>
            </AskDevShellProvider>
        </AdminTierProvider>,
    );
}

const panel = () => screen.getByRole("complementary", { name: "Ask Dev" });
const input = () => within(panel()).getByRole("textbox", { name: COMPOSER_COPY.label });

beforeEach(() => {
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

describe("Ask Dev panel with the conversation store (CHAOS-11928)", () => {
    it("draws no composer and sends nothing without a transport", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        renderPanel(null);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(panel()).toBeInTheDocument();
        expect(screen.queryByTestId("ask-dev-composer")).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends one request for a double click and shows the answer", async () => {
        const transport = new FakeTransport();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        renderPanel(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.type(input(), "Which projects are at risk?");
        await userEvent.dblClick(within(panel()).getByRole("button", { name: "Send" }));

        expect(transport.calls).toHaveLength(1);
        expect(await within(panel()).findByText(TURN_STATUS_COPY.running)).toBeInTheDocument();
        expect(within(panel()).getByRole("button", { name: "Send" })).toBeDisabled();
        gate.resolve();
        expect(await within(panel()).findByTestId("ask-dev-answer")).toBeInTheDocument();
        expect(input()).toHaveValue("");
        expect(transport.calls).toHaveLength(1);
    });

    it("keeps the conversation and its run when the panel closes and opens again", async () => {
        const transport = new FakeTransport();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        renderPanel(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.type(input(), "Which projects are at risk?{Enter}");
        await userEvent.click(screen.getByRole("button", { name: "test-close" }));
        expect(screen.queryByRole("complementary", { name: "Ask Dev" })).toBeNull();
        expect(transport.calls[0]!.signal.aborted).toBe(false);

        gate.resolve();
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(await within(panel()).findByTestId("ask-dev-answer")).toBeInTheDocument();
        expect(transport.calls).toHaveLength(1);
    });

    it("stops a run with Stop and says what that means", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), { wait: deferred().promise }]);
        renderPanel(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.type(input(), "Which projects are at risk?{Enter}");
        await userEvent.click(await within(panel()).findByRole("button", { name: "Stop" }));
        expect(within(panel()).getByTestId("ask-dev-turn-status")).toHaveTextContent(
            TURN_STATUS_COPY.canceled,
        );
        expect(transport.calls[0]!.signal.aborted).toBe(true);
        expect(within(panel()).queryByRole("button", { name: "Stop" })).toBeNull();
    });

    // CHAOS-11929 (plan §2.7.8 "Streaming"): the stage checklist, the elapsed time and the run's
    // Cancel (the composer's Stop), with no answer content until the terminal.
    it("shows the streaming state with the stage checklist, then the answer", async () => {
        const transport = new FakeTransport();
        const gate = deferred();
        transport.scripts.push([
            accepted(),
            {
                seq: 2,
                request_id: "request_test",
                type: "stage",
                stage: "interpreting",
                state: "started",
                elapsed_ms: 5,
            },
            { wait: gate.promise },
            resultEvent(PARTIAL),
        ]);
        renderPanel(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.type(input(), "Which projects are at risk?{Enter}");

        const steps = await within(panel()).findByRole("list", { name: "Investigation steps" });
        await waitFor(() =>
            expect(within(steps).getAllByRole("listitem")[0]!.dataset.state).toBe("active"),
        );
        expect(within(panel()).getByTestId("ask-dev-elapsed")).toBeInTheDocument();
        expect(within(panel()).getByRole("button", { name: "Stop" })).toBeInTheDocument();
        expect(within(panel()).queryByTestId("ask-dev-answer")).toBeNull();
        expect(within(panel()).queryByTestId("ask-dev-coverage")).toBeNull();

        gate.resolve();
        expect(await within(panel()).findByTestId("ask-dev-answer")).toBeInTheDocument();
        expect(within(panel()).queryByTestId("ask-dev-stages")).toBeNull();
        expect(within(panel()).queryByRole("button", { name: "Stop" })).toBeNull();
    });

    it("retries a call ACR never admitted under the same submission id", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([{ fail: new TypeError("network") }], [resultEvent(PARTIAL)]);
        transport.statuses.push(null);
        renderPanel(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.type(input(), "Which projects are at risk?{Enter}");
        await userEvent.click(await within(panel()).findByRole("button", { name: "Retry" }));
        await waitFor(() => expect(transport.calls).toHaveLength(2));
        expect(transport.calls[1]!.submissionId).toBe(transport.calls[0]!.submissionId);
        expect(await within(panel()).findByTestId("ask-dev-answer")).toBeInTheDocument();
    });
});
