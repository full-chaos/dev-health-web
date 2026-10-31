import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No canvas in jsdom: the Ask Dev charts draw through a stub that keeps ECharts' event order.
vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../../render/__tests__/echartsStub")).echartsStubModule,
);
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));
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

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
/** The signed-in org; a test switches it to prove the feedback goes with the partition. */
const session = vi.hoisted(() => ({ org: "org-1" }));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { id: "user-1", org_id: session.org }, expires: "2099-01-01" },
        status: "authenticated",
    }),
}));

import { AdminTierProvider } from "@/components/admin/AdminTierContext";

import type { TranscriptResult } from "../../answer/AskDevTurn";
import { AskDevPanel } from "../../AskDevPanel";
import { AskDevShellProvider, useAskDevShell } from "../../AskDevShellContext";
import { AskDevConversationProvider } from "../AskDevConversationContext";
import { AskDevFeedback, FEEDBACK_COPY } from "../AskDevFeedback";
import { COMPOSER_COPY } from "../AskDevComposer";
import { TransportFailure } from "../transport";
import { accepted, captureResult, deferred, FakeTransport, resultEvent } from "./fakeTransport";

/**
 * CHAOS-11958 (I-32b), E6 web design v5 §6: the feedback controls on an answer, in the panel and
 * beside each other (a reused answer, or the panel and `/dev`). The live proofs are CHAOS-12234.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const CLARIFICATION = captureResult("kiac_project_status_clarification.event.json");
const QUESTION = "Which projects are at risk this quarter?";
const R1 = PARTIAL.result_id;

function OpenClose() {
    const { open, setOpen } = useAskDevShell();
    return (
        <button type="button" onClick={() => setOpen(!open)}>
            {open ? "test-close" : "test-open"}
        </button>
    );
}

function renderPanel(transport: FakeTransport) {
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

/** Two controls of one result, as a reused answer (or the panel beside `/dev`) shows it. */
function renderTwice(transport: FakeTransport) {
    return render(
        <AskDevConversationProvider transport={transport}>
            <div data-testid="first">
                <AskDevFeedback resultId={R1} />
            </div>
            <div data-testid="second">
                <AskDevFeedback resultId={R1} />
            </div>
        </AskDevConversationProvider>,
    );
}

const panel = () => screen.getByRole("complementary", { name: "Ask Dev" });

/** Asks QUESTION in the panel and waits for `result`. */
async function answered(transport: FakeTransport, result: TranscriptResult = PARTIAL) {
    transport.scripts.push([accepted(), resultEvent(result)]);
    renderPanel(transport);
    await userEvent.click(screen.getByRole("button", { name: "test-open" }));
    const input = within(panel()).getByRole("textbox", { name: COMPOSER_COPY.label });
    await userEvent.type(input, `${QUESTION}{Enter}`);
    await within(panel()).findByTestId("ask-dev-answer");
}

const choice = (scope: HTMLElement, question: "correct" | "useful", value: "Yes" | "No") =>
    within(within(scope).getByRole("group", { name: FEEDBACK_COPY[question] })).getByRole(
        "button",
        { name: value },
    );

beforeEach(() => {
    session.org = "org-1";
    window.sessionStorage.clear();
    log.debug.mockReset();
    log.info.mockReset();
    log.warn.mockReset();
    log.error.mockReset();
    telemetry.track.mockReset();
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

describe("feedback on an answer (CHAOS-11958)", () => {
    it("shows Correct? and Useful? under an answer; a press sets the flag, a second press clears it", async () => {
        const transport = new FakeTransport();
        await answered(transport);
        const region = await within(panel()).findByRole("region", {
            name: FEEDBACK_COPY.region,
        });
        await waitFor(() => expect(choice(region, "correct", "Yes")).toBeEnabled());
        for (const question of ["correct", "useful"] as const) {
            for (const value of ["Yes", "No"] as const) {
                expect(choice(region, question, value)).toHaveAttribute("aria-pressed", "false");
            }
        }
        expect(transport.feedbackReads).toEqual([R1]);

        await userEvent.click(choice(region, "correct", "Yes"));
        expect(choice(region, "correct", "Yes")).toHaveAttribute("aria-pressed", "true");
        await waitFor(() => expect(transport.feedbackSetCalls).toHaveLength(1));
        await userEvent.click(choice(region, "useful", "No"));
        await waitFor(() => expect(transport.feedbackSetCalls).toHaveLength(2));
        await userEvent.click(choice(region, "correct", "Yes"));
        await waitFor(() => expect(transport.feedbackSetCalls).toHaveLength(3));
        expect(choice(region, "correct", "Yes")).toHaveAttribute("aria-pressed", "false");
        expect(choice(region, "useful", "No")).toHaveAttribute("aria-pressed", "true");
        expect(
            transport.feedbackSetCalls.map((call) => [call.resultId, call.correct, call.useful]),
        ).toEqual([
            [R1, "yes", "unset"],
            [R1, "yes", "no"],
            [R1, "unset", "no"],
        ]);
        await waitFor(() => expect(region).toHaveAttribute("aria-busy", "false"));
    });

    it("asks nothing on a clarification (a non-answer)", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(CLARIFICATION)]);
        renderPanel(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        const input = within(panel()).getByRole("textbox", { name: COMPOSER_COPY.label });
        await userEvent.type(input, `${QUESTION}{Enter}`);
        await within(panel()).findByTestId("ask-dev-clarification");
        expect(within(panel()).queryByTestId("ask-dev-feedback")).toBeNull();
        expect(transport.feedbackReads).toEqual([]);
    });

    it("draws the controls disabled while the read is out", async () => {
        const transport = new FakeTransport();
        const gate = deferred();
        transport.feedbackReadGate = gate.promise;
        renderTwice(transport);
        const region = within(screen.getByTestId("first")).getByTestId("ask-dev-feedback");
        expect(region).toHaveAttribute("data-state", "loading");
        expect(choice(region, "correct", "Yes")).toBeDisabled();
        gate.resolve();
        await waitFor(() => expect(choice(region, "correct", "Yes")).toBeEnabled());
    });

    it("one state per result: two controls of a reused answer read once and show one choice", async () => {
        const transport = new FakeTransport();
        renderTwice(transport);
        const first = within(screen.getByTestId("first")).getByTestId("ask-dev-feedback");
        const second = within(screen.getByTestId("second")).getByTestId("ask-dev-feedback");
        await waitFor(() => expect(choice(first, "useful", "Yes")).toBeEnabled());
        await userEvent.click(choice(first, "useful", "Yes"));
        expect(choice(second, "useful", "Yes")).toHaveAttribute("aria-pressed", "true");
        await waitFor(() => expect(transport.feedbackSetCalls).toHaveLength(1));
        expect(transport.feedbackReads).toEqual([R1]);
    });

    it("ACR's 404 hides the controls", async () => {
        const transport = new FakeTransport();
        transport.feedback.set(R1, null);
        renderTwice(transport);
        await waitFor(() => expect(transport.feedbackReads).toEqual([R1]));
        await waitFor(() => expect(screen.queryByTestId("ask-dev-feedback")).toBeNull());
        expect(screen.queryByText(FEEDBACK_COPY.readFailed)).toBeNull();
    });

    it("a failed read keeps the controls disabled, with Try again (a GET)", async () => {
        const transport = new FakeTransport();
        transport.feedback.set(R1, { fail: new TransportFailure("invalid_upstream") });
        renderTwice(transport);
        const region = within(screen.getByTestId("first")).getByTestId("ask-dev-feedback");
        expect(
            await within(region).findByText(FEEDBACK_COPY.readFailed, { exact: false }),
        ).toBeInTheDocument();
        expect(choice(region, "correct", "Yes")).toBeDisabled();
        transport.feedback.set(R1, { resultId: R1, correct: "no", useful: "unset" });
        await userEvent.click(within(region).getByRole("button", { name: "Try again" }));
        await waitFor(() => expect(choice(region, "correct", "No")).toBeEnabled());
        expect(choice(region, "correct", "No")).toHaveAttribute("aria-pressed", "true");
        expect(within(region).queryByText(FEEDBACK_COPY.readFailed, { exact: false })).toBeNull();
        expect(transport.feedbackSetCalls).toEqual([]);
    });

    it("an org switch drops the shown choice and reads the new partition's feedback", async () => {
        const transport = new FakeTransport();
        transport.feedback.set(R1, { resultId: R1, correct: "yes", useful: "yes" });
        const view = renderTwice(transport);
        const region = () => within(screen.getByTestId("first")).getByTestId("ask-dev-feedback");
        await waitFor(() =>
            expect(choice(region(), "correct", "Yes")).toHaveAttribute("aria-pressed", "true"),
        );
        transport.feedback.delete(R1);
        session.org = "org-2";
        view.rerender(
            <AskDevConversationProvider transport={transport}>
                <div data-testid="first">
                    <AskDevFeedback resultId={R1} />
                </div>
                <div data-testid="second">
                    <AskDevFeedback resultId={R1} />
                </div>
            </AskDevConversationProvider>,
        );
        await waitFor(() => expect(transport.feedbackReads).toEqual([R1, R1]));
        await waitFor(() =>
            expect(choice(region(), "correct", "Yes")).toHaveAttribute("aria-pressed", "false"),
        );
    });

    it("a failed write rolls the choice back and says it was not saved; the next choice clears that", async () => {
        const transport = new FakeTransport();
        transport.feedbackSets.push({ fail: new Error("network") });
        renderTwice(transport);
        const region = within(screen.getByTestId("first")).getByTestId("ask-dev-feedback");
        await waitFor(() => expect(choice(region, "correct", "No")).toBeEnabled());
        await userEvent.click(choice(region, "correct", "No"));
        expect(await within(region).findByText(FEEDBACK_COPY.notSaved)).toBeInTheDocument();
        expect(choice(region, "correct", "No")).toHaveAttribute("aria-pressed", "false");
        await userEvent.click(choice(region, "useful", "Yes"));
        expect(within(region).queryByText(FEEDBACK_COPY.notSaved)).toBeNull();
        await waitFor(() => expect(transport.feedbackSetCalls).toHaveLength(2));
        expect(choice(region, "useful", "Yes")).toHaveAttribute("aria-pressed", "true");
    });
});

describe("no free text in telemetry (CHAOS-11958 AC)", () => {
    it("sends no telemetry event and logs no flag, question or answer text", async () => {
        const transport = new FakeTransport();
        transport.feedbackSets.push({}, { fail: new Error("network") });
        await answered(transport);
        const region = await within(panel()).findByRole("region", {
            name: FEEDBACK_COPY.region,
        });
        await waitFor(() => expect(choice(region, "correct", "Yes")).toBeEnabled());
        telemetry.track.mockClear();
        log.debug.mockClear();
        log.info.mockClear();
        log.warn.mockClear();
        log.error.mockClear();
        await userEvent.click(choice(region, "correct", "Yes"));
        await waitFor(() => expect(transport.feedbackSetCalls).toHaveLength(1));
        await userEvent.click(choice(region, "useful", "No"));
        expect(await within(region).findByText(FEEDBACK_COPY.notSaved)).toBeInTheDocument();
        await userEvent.click(choice(region, "useful", "Yes"));
        await waitFor(() => expect(transport.feedbackSetCalls).toHaveLength(3));

        expect(telemetry.track).not.toHaveBeenCalled();
        const calls = [
            ...log.debug.mock.calls,
            ...log.info.mock.calls,
            ...log.warn.mock.calls,
            ...log.error.mock.calls,
        ];
        // saved, not saved, saved
        expect(calls.map(([, message]) => message)).toEqual([
            "ask-dev feedback saved",
            "ask-dev feedback not saved",
            "ask-dev feedback saved",
        ]);
        const serialized = JSON.stringify(calls);
        expect(serialized).not.toContain(QUESTION);
        expect(serialized).not.toContain(PARTIAL.deterministic_answer ?? "no answer text");
        for (const [fields] of calls) {
            expect(Object.keys(fields as object).sort()).toEqual([
                "result_id",
                "revision",
                "status",
            ]);
            for (const value of Object.values(fields as object)) {
                expect(["yes", "no", "unset"]).not.toContain(value);
            }
        }
    });

    it("the feedback modules import no telemetry", () => {
        const root = join(process.cwd(), "src");
        for (const file of [
            "components/ask-dev/conversation/feedbackStore.ts",
            "components/ask-dev/conversation/AskDevFeedback.tsx",
            "lib/acr/feedbackContract.ts",
        ]) {
            const source = readFileSync(join(root, file), "utf8");
            expect(source.length, file).toBeGreaterThan(500);
            expect(source, file).not.toMatch(
                /@\/lib\/telemetry|useTrackEvent|trackTelemetryEvent/u,
            );
        }
    });
});
