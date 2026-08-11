import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevApiClient, DevConversationList } from "@/lib/dev/client";
import { DevApiError } from "@/lib/dev/client";
import type {
    DevAnswer,
    DevConversation,
    DevConversationTranscript,
    DevScope,
    DevStreamEvent,
} from "@/lib/dev/generated";

import { AskDevContextRegistration } from "./AskDevContextRegistration";
import { AskDevProvider, useAskDev } from "./AskDevProvider";
import { AskDevWorkspace } from "./AskDevWorkspace";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard", query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => ({ replace: navigation.replace }),
    useSearchParams: () => new URLSearchParams(navigation.query),
}));

const scope: DevScope = {
    schema_version: "dev_scope.v1",
    organization_id: "org-1",
    direct_scope: "organization",
    entity_refs: [],
    repositories: [],
    team_ids: [],
    time_range: {
        start: "2026-06-29T00:00:00Z",
        end: "2026-07-29T00:00:00Z",
        timezone: "UTC",
    },
    surface_context: null,
};

const answer = {
    answer_id: "answer-1",
    as_of: "2026-07-29T00:00:00Z",
    conversation_id: "conversation-1",
    direct_summary: "The evidence suggests delivery remains on track.",
    status: "complete",
    claims: [],
    evidence: [],
    metrics: [],
    warnings: [],
} as unknown as DevAnswer;

const conversation = {
    conversation_id: "conversation-1",
    created_at: "2026-07-29T00:00:00Z",
    current_scope: scope,
    message_count: 0,
    retention_days: 30,
    schema_version: "dev_conversation.v1",
    state: "active",
    title: "Delivery status",
    updated_at: "2026-07-29T00:00:00Z",
} as unknown as DevConversation;

function makeClient(): DevApiClient {
    return {
        getCapabilities: vi.fn().mockResolvedValue({
            schema_version: "dev_capabilities.v1",
            ask_dev: true,
            can_read: true,
            readiness: "ready",
        }),
        listConversations: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
        createConversation: vi.fn().mockResolvedValue(conversation),
        getConversation: vi.fn().mockResolvedValue(conversation),
        getConversationTranscript: vi.fn().mockResolvedValue({
            conversation_id: "conversation-1",
            items: [],
            next_cursor: null,
            schema_version: "dev_conversation_transcript.v1",
        } satisfies DevConversationTranscript),
        renameConversation: vi.fn().mockResolvedValue(conversation),
        deleteConversation: vi.fn().mockResolvedValue(undefined),
        streamMessage: vi.fn().mockImplementation(async (_conversationId, _request, options) => {
            options?.onEvent?.({
                event: "run.started",
                run_id: "run-1",
                sequence: 0,
            } as DevStreamEvent);
            options?.onEvent?.({
                event: "progress",
                progress: "checking_evidence",
                run_id: "run-1",
                sequence: 1,
            } as DevStreamEvent);
            options?.onEvent?.({
                event: "answer.completed",
                answer,
                run_id: "run-1",
                sequence: 2,
            } as DevStreamEvent);
            return answer;
        }),
        resumeRun: vi.fn(),
        expandEvidence: vi.fn(),
        submitFeedback: vi.fn(),
    };
}

/**
 * Fires a `useLayoutEffect`, which always runs before any passive
 * `useEffect` in the same commit (regardless of tree position). This lets a
 * test observe the DOM exactly as of commit — before any `useEffect`
 * (including AskDevProvider's own post-commit cleanup effect) has run — which
 * is what actually distinguishes "cleared synchronously during render" from
 * "cleared by a passive effect that RTL's `act()`-wrapped `rerender()` would
 * flush before assertions run anyway" (CHAOS-3215 H1).
 */
function LayoutProbe({ onLayout }: { onLayout: () => void }) {
    useLayoutEffect(() => {
        onLayout();
    });
    return null;
}

describe("AskDevProvider permanent window", () => {
    beforeAll(() => {
        Element.prototype.scrollIntoView = vi.fn();
    });

    beforeEach(() => {
        navigation.pathname = "/dashboard";
        navigation.query = "";
        navigation.replace.mockClear();
        window.localStorage.clear();
    });

    afterEach(() => {
        // jsdom does not implement matchMedia by default; remove any per-test stub.
        // @ts-expect-error test cleanup
        delete window.matchMedia;
        window.localStorage.clear();
    });

    it("opens without creating a conversation or submitting a run", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        expect(screen.getByRole("region", { name: "Ask Dev" })).toHaveFocus();
        // CHAOS-3524: the persistent scope bar (which used to echo the
        // default "Organization" label here) is gone — the load-bearing
        // claim is just that opening the launcher doesn't itself create a
        // conversation or run, checked below.
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();
    });

    it("shows the route's suggested questions when the plain launcher opens on an approved ambient route without an explicit contextual-entry click (CHAOS-3410)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        navigation.pathname = "/data-health";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Data Health</main>
            </AskDevProvider>,
        );

        // No entity-scoped "Ask Dev about this" trigger exists on this route
        // (it is an organization-wide admin page, not tied to one entity) --
        // the only way in is the permanent floating launcher.
        expect(
            screen.queryByRole("button", { name: "Ask Dev about this" }),
        ).not.toBeInTheDocument();
        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        const permanentWindow = screen.getByRole("region", { name: "Ask Dev" });
        // CHAOS-3524: this used to also assert the (now-removed) persistent
        // scope bar displayed "Data Confidence" for this ambient route —
        // display-only, and the bar is gone. What this test actually pins
        // is the suggested-question buttons below, driven by that same
        // implicit context.
        expect(permanentWindow).toBeVisible();
        expect(
            screen.getByRole("button", {
                name: "What changed in this scope during the selected time range?",
            }),
        ).toBeVisible();
        expect(client.createConversation).not.toHaveBeenCalled();
    });

    it("shows the ambient route's suggested questions on a real descendant path (CHAOS-3410 codex round)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        navigation.pathname = "/data-health/connectors";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Connectors</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        expect(
            screen.getByRole("button", {
                name: "What changed in this scope during the selected time range?",
            }),
        ).toBeVisible();
        expect(
            screen.getByRole("button", {
                name: "How complete and fresh is the evidence for this scope?",
            }),
        ).toBeVisible();
    });

    it("does not show suggested questions on a sibling route that merely shares the /data-health prefix (CHAOS-3410 codex round)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        navigation.pathname = "/data-health-legacy";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Legacy</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        // CHAOS-3524: the removed persistent bar used to also echo the
        // "Organization" fallback label here — display-only, now gone. The
        // load-bearing claim (this route gets no ambient treatment) is
        // fully proven by the suggested-questions absence below.
        expect(
            screen.queryByRole("button", {
                name: "What changed in this scope during the selected time range?",
            }),
        ).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Suggested questions")).not.toBeInTheDocument();
    });

    it("does not show suggested questions on an unrelated, non-approved route (CHAOS-3410 codex round)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        navigation.pathname = "/dashboard";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        expect(screen.queryByLabelText("Suggested questions")).not.toBeInTheDocument();
    });

    it("lets an explicit contextual-entry proposal on an ambient route override that route's ambient suggested questions (CHAOS-3410 codex round)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        navigation.pathname = "/data-health";
        render(
            <AskDevProvider client={client} orgId="org-1" contextualEntrypointsEnabled>
                <AskDevContextRegistration
                    context={{
                        routeId: "data_health",
                        entityRefs: [
                            {
                                entity_type: "repository",
                                entity_id: "repo-1",
                                display_label: "dev-health-web",
                            },
                        ],
                        suggestedQuestionIds: ["data_trust"],
                    }}
                />
                <main>Data Health</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        const permanentWindow = screen.getByRole("region", { name: "Ask Dev" });
        expect(permanentWindow).toHaveTextContent("Data Confidence · dev-health-web");
        expect(
            screen.getByRole("button", {
                name: "How complete and fresh is the evidence for this scope?",
            }),
        ).toBeVisible();
        // The ambient route's other default question must not also appear --
        // the explicit proposal replaces the ambient list, it does not merge
        // with it.
        expect(
            screen.queryByRole("button", {
                name: "What changed in this scope during the selected time range?",
            }),
        ).not.toBeInTheDocument();
    });

    it("preserves one conversation and run across expand, minimize, navigation, and the /dev workspace", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const view = (workspace = false) => (
            <AskDevProvider client={client} orgId="org-1">
                {workspace ? <AskDevWorkspace /> : <main>Dashboard</main>}
            </AskDevProvider>
        );
        const rendered = render(view());

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What remains?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(await screen.findByText(answer.direct_summary)).toBeVisible();
        expect(client.createConversation).toHaveBeenCalledOnce();
        expect(client.streamMessage).toHaveBeenCalledOnce();
        expect(client.streamMessage).toHaveBeenCalledWith(
            "conversation-1",
            expect.objectContaining({
                conversation_id: "conversation-1",
                question: "What remains?",
                scope: expect.objectContaining({ surface_context: null }),
            }),
            expect.objectContaining({ onEvent: expect.any(Function) }),
        );

        await user.click(screen.getByRole("button", { name: "Expand Ask Dev panel" }));
        await user.click(screen.getByRole("button", { name: "Reduce Ask Dev panel" }));
        await user.click(screen.getByRole("button", { name: "Close panel" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Open Ask Dev" })).toHaveFocus(),
        );
        await user.click(screen.getByRole("button", { name: "Open Ask Dev" }));
        expect(screen.getByText(answer.direct_summary)).toBeVisible();

        navigation.pathname = "/metrics";
        navigation.query = "tab=flow";
        rendered.rerender(view());
        // CHAOS-3524: previously also asserted the removed persistent bar's
        // "Proposed context: Flow" / "Committed scope: Organization" —
        // display-only. What actually proves the conversation/run survived
        // this navigation (not silently re-scoped or re-run) is that the
        // SAME answer is still showing and streamMessage was never called
        // again — both checked here and again after the /dev round trip
        // below.
        expect(screen.getByText(answer.direct_summary)).toBeVisible();
        expect(client.streamMessage).toHaveBeenCalledOnce();
        // CHAOS-3524: previously asserted "/dev" — a raw href that silently
        // dropped the current page's filter scope (web AGENTS.md's
        // withFilterParam rule). Fixed to carry it across, symmetric with
        // `returnLink` below (the /dev workspace's link back to this page),
        // which already preserved it in the other direction.
        await waitFor(() =>
            expect(screen.getByRole("link", { name: "Ask Dev workspace" })).toHaveAttribute(
                "href",
                "/dev?tab=flow",
            ),
        );

        navigation.pathname = "/dev";
        rendered.rerender(view(true));
        expect(screen.getByRole("region", { name: "Ask Dev workspace" })).toBeVisible();
        expect(screen.getByText(answer.direct_summary)).toBeVisible();
        expect(screen.queryByRole("button", { name: "Open Ask Dev" })).not.toBeInTheDocument();
        const returnLink = screen.getByRole("link", { name: "Return to Ask Dev window" });
        await waitFor(() => expect(returnLink).toHaveAttribute("href", "/metrics?tab=flow"));

        returnLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
        fireEvent.click(returnLink);
        navigation.pathname = "/metrics";
        rendered.rerender(view());

        expect(screen.getByRole("region", { name: "Ask Dev" })).toBeVisible();
        expect(screen.getByText(answer.direct_summary)).toBeVisible();
        expect(client.streamMessage).toHaveBeenCalledOnce();
    });

    it("is absent from the independent Context Fabric validation route", () => {
        const client = makeClient();
        navigation.pathname = "/superadmin/context-fabric/validation";

        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Context Fabric Validation</main>
            </AskDevProvider>,
        );

        expect(screen.getByText("Context Fabric Validation")).toBeVisible();
        expect(screen.queryByRole("button", { name: "Open Ask Dev" })).not.toBeInTheDocument();
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();
    });

    it("removes the permanent launcher and shows a controlled /dev state when disabled", async () => {
        const client = makeClient();
        vi.mocked(client.getCapabilities).mockResolvedValue({
            schema_version: "dev_capabilities.v1",
            ask_dev: false,
            can_read: false,
            readiness: "disabled",
        });
        const view = (workspace = false) => (
            <AskDevProvider client={client} orgId="org-1">
                {workspace ? <AskDevWorkspace /> : <main>Dashboard</main>}
            </AskDevProvider>
        );
        const rendered = render(view());

        await waitFor(() => expect(client.getCapabilities).toHaveBeenCalledOnce());
        expect(screen.queryByRole("button", { name: "Open Ask Dev" })).not.toBeInTheDocument();

        navigation.pathname = "/dev";
        rendered.rerender(view(true));
        expect(await screen.findByText("Ask Dev is currently unavailable")).toBeVisible();
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();
    });

    it("hides the permanent launcher after switching from an available organization to a genuinely disabled one (CHAOS-3215)", async () => {
        const client = makeClient();
        // First call (org-1, on mount) resolves ready; second call (org-2,
        // after the org switch) resolves disabled. `everAvailable` latching
        // permanently `true` from org-1's "ready" state must not survive
        // org-2's resolved "disabled" capabilities — the launcher is a
        // control surface, not just conversation content, and must be fully
        // absent once we know org-2 was never actually available.
        vi.mocked(client.getCapabilities)
            .mockResolvedValueOnce({
                schema_version: "dev_capabilities.v1",
                ask_dev: true,
                can_read: true,
                readiness: "ready",
            })
            .mockResolvedValueOnce({
                schema_version: "dev_capabilities.v1",
                ask_dev: false,
                can_read: false,
                readiness: "disabled",
            });
        const rendered = render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        // Confirm org-1 actually reached "ready" (and not just "loading"),
        // which is what latches `everAvailable` to true in the first place.
        expect(await screen.findByRole("button", { name: "Open Ask Dev" })).toBeVisible();

        // The provider is mounted once in the app shell layout; switching
        // organizations updates the `orgId` prop on this already-mounted
        // instance rather than remounting it.
        rendered.rerender(
            <AskDevProvider client={client} orgId="org-2">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await waitFor(() => expect(client.getCapabilities).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(screen.queryByRole("button", { name: "Open Ask Dev" })).not.toBeInTheDocument(),
        );
    });

    it("shows the same controlled remediation in the window and /dev when not ready", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.getCapabilities).mockResolvedValue({
            schema_version: "dev_capabilities.v1",
            administrator_safe_failure_reason: "Ask an administrator to configure credentials.",
            ask_dev: true,
            can_read: false,
            readiness: "missing_credentials",
        });
        const view = (workspace = false) => (
            <AskDevProvider client={client} orgId="org-1">
                {workspace ? <AskDevWorkspace /> : <main>Dashboard</main>}
            </AskDevProvider>
        );
        const rendered = render(view());

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        expect(screen.getByText("Ask Dev needs administrator attention")).toBeVisible();
        expect(screen.getByText("Ask an administrator to configure credentials.")).toBeVisible();

        navigation.pathname = "/dev";
        rendered.rerender(view(true));
        expect(screen.getByText("Ask Dev needs administrator attention")).toBeVisible();
        expect(screen.getByText("Ask an administrator to configure credentials.")).toBeVisible();
        expect(client.getCapabilities).toHaveBeenCalledOnce();
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();
    });

    it("submits with the keyboard while preserving multiline composition", async () => {
        const client = makeClient();
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );
        fireEvent.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        const composer = screen.getByRole("textbox", { name: "Ask Dev question" });
        fireEvent.change(composer, { target: { value: "First line" } });
        fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
        expect(client.streamMessage).not.toHaveBeenCalled();
        fireEvent.keyDown(composer, { key: "Enter" });

        await waitFor(() => expect(client.streamMessage).toHaveBeenCalledOnce());
    });

    it("declares the pinned stream contract on the production message path", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What changed?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        await waitFor(() => expect(client.streamMessage).toHaveBeenCalledOnce());
        expect(vi.mocked(client.streamMessage).mock.calls[0]?.[1]).toMatchObject({
            client_contract_version: "dev_stream_event.v1",
        });
    });

    it("aborts the active stream and retries in the same conversation", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const streamMessage = vi.mocked(client.streamMessage);
        streamMessage.mockImplementationOnce(
            async (_conversationId, _request, options) =>
                new Promise<DevAnswer>((_resolve, reject) => {
                    options?.onEvent?.({
                        event: "run.started",
                        run_id: "run-cancelled",
                        sequence: 0,
                    } as DevStreamEvent);
                    options?.signal?.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError")),
                    );
                }),
        );
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "Check risk");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        await user.click(await screen.findByRole("button", { name: "Cancel" }));

        expect(await screen.findByText("The investigation was cancelled.")).toBeVisible();
        expect(streamMessage.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);

        streamMessage.mockResolvedValueOnce(answer);
        await user.click(screen.getByRole("button", { name: "Retry" }));
        expect(await screen.findByText(answer.direct_summary)).toBeVisible();
        expect(client.createConversation).toHaveBeenCalledOnce();
        expect(streamMessage).toHaveBeenCalledTimes(2);
        expect(streamMessage.mock.calls[1]?.[0]).toBe("conversation-1");
        expect(streamMessage.mock.calls[1]?.[1]).toMatchObject({
            question: "Check risk",
            retry_of_run_id: "run-cancelled",
        });
        expect(streamMessage.mock.calls[1]?.[1].client_message_id).not.toBe(
            streamMessage.mock.calls[0]?.[1].client_message_id,
        );
        expect(streamMessage.mock.calls[1]?.[1].request_id).not.toBe(
            streamMessage.mock.calls[0]?.[1].request_id,
        );
    });

    it("rejoins a dropped stream without creating a second run or changing scope", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const streamMessage = vi.mocked(client.streamMessage);
        const resumeRun = vi.mocked(client.resumeRun);
        streamMessage.mockImplementationOnce(async (_conversationId, _request, options) => {
            options?.onEvent?.({
                event: "run.started",
                run_id: "run-rejoin",
                sequence: 0,
            } as DevStreamEvent);
            options?.onEvent?.({
                event: "progress",
                progress: "checking_evidence",
                run_id: "run-rejoin",
                sequence: 1,
            } as DevStreamEvent);
            throw new Error("The live stream disconnected.");
        });
        resumeRun.mockImplementationOnce(async (runId, input, options) => {
            expect(runId).toBe("run-rejoin");
            expect(input.conversation_id).toBe("conversation-1");
            expect(input.last_sequence).toBe(1);
            options?.onEvent?.({
                event: "answer.completed",
                answer,
                run_id: "run-rejoin",
                sequence: 2,
            } as DevStreamEvent);
            options?.onEvent?.({
                event: "done",
                run_id: "run-rejoin",
                sequence: 3,
                terminal_kind: "answer",
            } as DevStreamEvent);
            return answer;
        });
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "Check risk");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(await screen.findByText(answer.direct_summary)).toBeVisible();
        expect(streamMessage).toHaveBeenCalledOnce();
        expect(resumeRun).toHaveBeenCalledOnce();
        expect(resumeRun.mock.calls[0]?.[1].scope).toEqual(streamMessage.mock.calls[0]?.[1].scope);
        expect(screen.getAllByText("Check risk")).toHaveLength(1);
        expect(screen.getAllByText(answer.direct_summary)).toHaveLength(1);
    });

    it("does not retry a resume scope mismatch", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.streamMessage).mockImplementationOnce(async (_id, _request, options) => {
            options?.onEvent?.({
                event: "run.started",
                run_id: "run-scope-mismatch",
                sequence: 0,
            } as DevStreamEvent);
            throw new TypeError("The live stream disconnected.");
        });
        vi.mocked(client.resumeRun).mockRejectedValueOnce(
            new DevApiError(409, {
                schema_version: "dev_web_error.v1",
                code: "resume_scope_mismatch",
                safe_message: "The resume scope does not match the accepted run.",
                retryable: false,
            }),
        );
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "Check risk");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(
            await screen.findByText("The resume scope does not match the accepted run."),
        ).toBeVisible();
        expect(client.streamMessage).toHaveBeenCalledOnce();
        expect(client.resumeRun).toHaveBeenCalledOnce();
    });

    it("aborts resume polling when the user cancels", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.streamMessage).mockImplementationOnce(async (_id, _request, options) => {
            options?.onEvent?.({
                event: "run.started",
                run_id: "run-polling",
                sequence: 0,
            } as DevStreamEvent);
            throw new TypeError("The live stream disconnected.");
        });
        vi.mocked(client.resumeRun).mockRejectedValue(
            new DevApiError(409, {
                schema_version: "dev_web_error.v1",
                code: "resume_unavailable",
                safe_message: "The live run has no durable event after this cursor.",
                retryable: true,
            }),
        );
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "Check risk");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        await waitFor(() => expect(client.resumeRun).toHaveBeenCalledOnce());
        const resumeSignal = vi.mocked(client.resumeRun).mock.calls[0]?.[2]?.signal;

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(await screen.findByText("The investigation was cancelled.")).toBeVisible();
        expect(resumeSignal?.aborted).toBe(true);
        expect(client.resumeRun).toHaveBeenCalledOnce();
    });

    it("aborts resume polling when the organization changes", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.streamMessage).mockImplementationOnce(async (_id, _request, options) => {
            options?.onEvent?.({
                event: "run.started",
                run_id: "run-org-switch",
                sequence: 0,
            } as DevStreamEvent);
            throw new TypeError("The live stream disconnected.");
        });
        vi.mocked(client.resumeRun).mockRejectedValue(
            new DevApiError(409, {
                schema_version: "dev_web_error.v1",
                code: "resume_unavailable",
                safe_message: "The live run has no durable event after this cursor.",
                retryable: true,
            }),
        );
        const rendered = render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "Check risk");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        await waitFor(() => expect(client.resumeRun).toHaveBeenCalledOnce());
        const resumeSignal = vi.mocked(client.resumeRun).mock.calls[0]?.[2]?.signal;

        rendered.rerender(
            <AskDevProvider client={client} orgId="org-2">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await waitFor(() => expect(resumeSignal?.aborted).toBe(true));
        expect(client.resumeRun).toHaveBeenCalledOnce();
        expect(screen.queryByText("Check risk")).not.toBeInTheDocument();
    });

    it("resumes a stored live run after reload using its original transcript scope", async () => {
        const client = makeClient();
        const resumeRun = vi.mocked(client.resumeRun);
        const storedScope = { ...scope, repositories: ["repo-original"] } as DevScope;
        window.localStorage.setItem(
            "dev-health.ask-dev.active-run.v1:org-1",
            JSON.stringify({
                conversationId: "conversation-1",
                runId: "run-reload",
                question: "Check the original scope",
                scope: storedScope,
                scopeLabel: "Organization",
                lastSequence: 4,
            }),
        );
        vi.mocked(client.getConversationTranscript).mockResolvedValue({
            conversation_id: "conversation-1",
            items: [
                {
                    answer: null,
                    created_at: "2026-07-29T00:00:00Z",
                    message_id: "message-reload",
                    question: "Check the original scope",
                    retry_of_run_id: null,
                    role: "user",
                    run_id: "run-reload",
                    run_state: "accepted",
                    schema_version: "dev_transcript_entry.v1",
                    scope: storedScope,
                },
            ],
            next_cursor: null,
            schema_version: "dev_conversation_transcript.v1",
        });
        resumeRun.mockImplementationOnce(async (runId, input, options) => {
            options?.onEvent?.({
                event: "answer.completed",
                answer,
                run_id: runId,
                sequence: 5,
            } as DevStreamEvent);
            options?.onEvent?.({
                event: "done",
                run_id: runId,
                sequence: 6,
                terminal_kind: "answer",
            } as DevStreamEvent);
            expect(input).toMatchObject({
                conversation_id: "conversation-1",
                last_sequence: 4,
                scope: storedScope,
            });
            return answer;
        });

        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        expect(await screen.findByText(answer.direct_summary)).toBeVisible();
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();
        expect(resumeRun).toHaveBeenCalledOnce();
        expect(screen.getAllByText("Check the original scope")).toHaveLength(1);
    });

    it("keeps polling the same stored run when no durable event is available yet", async () => {
        const client = makeClient();
        const resumeRun = vi.mocked(client.resumeRun);
        window.localStorage.setItem(
            "dev-health.ask-dev.active-run.v1:org-1",
            JSON.stringify({
                conversationId: "conversation-1",
                runId: "run-reload",
                question: "Wait for the running answer",
                scope,
                scopeLabel: "Organization",
                lastSequence: 4,
            }),
        );
        vi.mocked(client.getConversationTranscript).mockResolvedValue({
            conversation_id: "conversation-1",
            items: [
                {
                    answer: null,
                    created_at: "2026-07-29T00:00:00Z",
                    message_id: "message-reload",
                    question: "Wait for the running answer",
                    retry_of_run_id: null,
                    role: "user",
                    run_id: "run-reload",
                    run_state: "accepted",
                    schema_version: "dev_transcript_entry.v1",
                    scope,
                },
            ],
            next_cursor: null,
            schema_version: "dev_conversation_transcript.v1",
        });
        resumeRun
            .mockRejectedValueOnce(
                new DevApiError(409, {
                    schema_version: "dev_web_error.v1",
                    code: "resume_unavailable",
                    safe_message: "The live run has no durable event after this cursor.",
                    retryable: true,
                }),
            )
            .mockImplementationOnce(async (runId, _input, options) => {
                options?.onEvent?.({
                    event: "progress",
                    progress: "checking_evidence",
                    run_id: runId,
                    sequence: 5,
                } as DevStreamEvent);
                return null;
            })
            .mockImplementationOnce(async (runId, _input, options) => {
                options?.onEvent?.({
                    event: "answer.completed",
                    answer,
                    run_id: runId,
                    sequence: 6,
                } as DevStreamEvent);
                options?.onEvent?.({
                    event: "done",
                    run_id: runId,
                    sequence: 7,
                    terminal_kind: "answer",
                } as DevStreamEvent);
                return answer;
            });

        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        expect(await screen.findByText(answer.direct_summary)).toBeVisible();
        expect(resumeRun).toHaveBeenCalledTimes(3);
        expect(resumeRun.mock.calls[0]?.[1].last_sequence).toBe(4);
        expect(resumeRun.mock.calls[1]?.[1].last_sequence).toBe(4);
        expect(resumeRun.mock.calls[2]?.[1].last_sequence).toBe(5);
        expect(resumeRun.mock.calls[2]?.[1].request_id).not.toBe(
            resumeRun.mock.calls[0]?.[1].request_id,
        );
        expect(client.streamMessage).not.toHaveBeenCalled();
    });

    it("finds the stored run on a later bounded transcript page before resuming", async () => {
        const client = makeClient();
        window.localStorage.setItem(
            "dev-health.ask-dev.active-run.v1:org-1",
            JSON.stringify({
                conversationId: "conversation-1",
                runId: "run-page-2",
                question: "Resume the newest investigation",
                scope,
                scopeLabel: "Organization",
                lastSequence: 4,
            }),
        );
        vi.mocked(client.getConversationTranscript)
            .mockResolvedValueOnce({
                conversation_id: "conversation-1",
                items: [],
                next_cursor: "page-2",
                schema_version: "dev_conversation_transcript.v1",
            })
            .mockResolvedValueOnce({
                conversation_id: "conversation-1",
                items: [
                    {
                        answer: null,
                        created_at: "2026-07-29T00:00:00Z",
                        message_id: "message-page-2",
                        question: "Resume the newest investigation",
                        retry_of_run_id: null,
                        role: "user",
                        run_id: "run-page-2",
                        run_state: "accepted",
                        schema_version: "dev_transcript_entry.v1",
                        scope,
                    },
                ],
                next_cursor: null,
                schema_version: "dev_conversation_transcript.v1",
            });
        vi.mocked(client.resumeRun).mockImplementationOnce(async (runId, _input, options) => {
            options?.onEvent?.({
                event: "answer.completed",
                answer,
                run_id: runId,
                sequence: 5,
            } as DevStreamEvent);
            options?.onEvent?.({
                event: "done",
                run_id: runId,
                sequence: 6,
                terminal_kind: "answer",
            } as DevStreamEvent);
            return answer;
        });

        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        expect(await screen.findByText(answer.direct_summary)).toBeVisible();
        expect(client.getConversationTranscript).toHaveBeenNthCalledWith(1, "conversation-1", {
            signal: expect.any(AbortSignal),
            cursor: undefined,
            limit: 100,
        });
        expect(client.getConversationTranscript).toHaveBeenNthCalledWith(2, "conversation-1", {
            signal: expect.any(AbortSignal),
            cursor: "page-2",
            limit: 100,
        });
        expect(client.resumeRun).toHaveBeenCalledOnce();
    });

    it.each([
        ["failed", "Ask Dev could not complete the investigation."],
        ["cancelled", "The investigation was cancelled."],
    ] as const)("restores a terminal %s run without polling forever", async (runState, message) => {
        const client = makeClient();
        window.localStorage.setItem(
            "dev-health.ask-dev.active-run.v1:org-1",
            JSON.stringify({
                conversationId: "conversation-1",
                runId: "run-terminal",
                question: "Restore the terminal investigation",
                scope,
                scopeLabel: "Organization",
                lastSequence: 5,
            }),
        );
        vi.mocked(client.getConversationTranscript).mockResolvedValue({
            conversation_id: "conversation-1",
            items: [
                {
                    answer: null,
                    created_at: "2026-07-29T00:00:00Z",
                    message_id: "message-terminal",
                    question: "Restore the terminal investigation",
                    retry_of_run_id: null,
                    role: "user",
                    run_id: "run-terminal",
                    run_state: runState,
                    schema_version: "dev_transcript_entry.v1",
                    scope,
                },
            ],
            next_cursor: null,
            schema_version: "dev_conversation_transcript.v1",
        });

        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        expect(await screen.findByText(message)).toBeVisible();
        expect(client.resumeRun).not.toHaveBeenCalled();
        expect(window.localStorage.getItem("dev-health.ask-dev.active-run.v1:org-1")).toBeNull();
    });

    it("retries the latest question when it fails before a run identifier is issued", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const streamMessage = vi.mocked(client.streamMessage);
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        const composer = screen.getByRole("textbox", { name: "Ask Dev question" });
        await user.type(composer, "First question");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        expect(await screen.findByText(answer.direct_summary)).toBeVisible();

        streamMessage.mockRejectedValueOnce(new Error("The provider is unavailable."));
        await user.type(composer, "Latest question");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        expect(await screen.findByText("The provider is unavailable.")).toBeVisible();

        await user.click(screen.getByRole("button", { name: "Retry" }));
        expect(streamMessage).toHaveBeenCalledTimes(3);
        expect(streamMessage.mock.calls[2]?.[1]).toMatchObject({ question: "Latest question" });
        expect(streamMessage.mock.calls[2]?.[1]).not.toHaveProperty("retry_of_run_id");
    });

    it.each([
        { code: "rate_limited", workspace: false, surface: "permanent window" },
        { code: "cost_limit_reached", workspace: true, surface: "/dev workspace" },
    ])(
        "shows reset guidance without an immediate retry on the $surface",
        async ({ code, workspace }) => {
            const user = userEvent.setup();
            const client = makeClient();
            vi.mocked(client.streamMessage).mockRejectedValue({
                detail: {
                    schema_version: "dev_web_error.v1",
                    code,
                    safe_message: "This organization has reached its platform allowance.",
                    retryable: false,
                    limit_reset_at: "2026-08-01T00:00:00Z",
                },
            });
            navigation.pathname = workspace ? "/dev" : "/dashboard";
            render(
                <AskDevProvider client={client} orgId="org-1">
                    {workspace ? <AskDevWorkspace /> : <main>Dashboard</main>}
                </AskDevProvider>,
            );

            if (!workspace) {
                await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
            }
            await user.type(
                await screen.findByRole("textbox", { name: "Ask Dev question" }),
                "What changed?",
            );
            await user.click(screen.getByRole("button", { name: "Ask" }));

            expect(
                await screen.findByText("This organization has reached its platform allowance."),
            ).toBeVisible();
            expect(screen.getByText(/retrying before aug 1, 2026/i)).toBeVisible();
            expect(
                screen.getByText(/new platform-backed runs resume at that reset/i),
            ).toBeVisible();
            expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
        },
    );

    it("renames and deletes retained history through the supported client methods", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.listConversations).mockResolvedValue({
            items: [
                {
                    conversation_id: "conversation-1",
                    direct_scope: "organization",
                    message_count: 2,
                    schema_version: "dev_conversation_summary.v1",
                    state: "active",
                    title: "Delivery status",
                    updated_at: "2026-07-29T00:00:00Z",
                },
            ],
            next_cursor: null,
        });
        navigation.pathname = "/dev";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        expect(await screen.findByRole("button", { name: /Delivery status/i })).toBeVisible();
        await user.click(screen.getByRole("button", { name: "Edit" }));
        const title = screen.getByRole("textbox", { name: "Conversation title" });
        await user.clear(title);
        await user.type(title, "Weekly delivery review");
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(client.renameConversation).toHaveBeenCalledWith("conversation-1", {
            title: "Weekly delivery review",
        });

        await user.click(screen.getByRole("button", { name: "Delete" }));
        await user.click(screen.getByRole("button", { name: "Confirm delete?" }));
        expect(client.deleteConversation).toHaveBeenCalledWith("conversation-1");
    });

    it("rebuilds retained history across bounded transcript pages", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.listConversations).mockResolvedValue({
            items: [
                {
                    conversation_id: "conversation-1",
                    direct_scope: "organization",
                    message_count: 2,
                    schema_version: "dev_conversation_summary.v1",
                    state: "active",
                    title: "Retained investigation",
                    updated_at: "2026-07-29T00:00:00Z",
                },
            ],
            next_cursor: null,
        });
        vi.mocked(client.getConversationTranscript)
            .mockResolvedValueOnce({
                conversation_id: "conversation-1",
                items: [
                    {
                        answer: null,
                        created_at: "2026-07-29T00:00:00Z",
                        message_id: "message-1",
                        question: "What remains?",
                        retry_of_run_id: null,
                        role: "user",
                        run_id: "run-original",
                        run_state: "failed",
                        schema_version: "dev_transcript_entry.v1",
                        scope: scope as unknown as DevConversation["current_scope"],
                    },
                ],
                next_cursor: "page-2",
                schema_version: "dev_conversation_transcript.v1",
            })
            .mockResolvedValueOnce({
                conversation_id: "conversation-1",
                items: [
                    {
                        answer,
                        created_at: "2026-07-29T00:00:01Z",
                        message_id: "message-2",
                        question: null,
                        retry_of_run_id: null,
                        role: "assistant",
                        run_id: "run-original",
                        run_state: "completed",
                        schema_version: "dev_transcript_entry.v1",
                        scope: null,
                    },
                ],
                next_cursor: null,
                schema_version: "dev_conversation_transcript.v1",
            });
        navigation.pathname = "/dev";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: /Retained investigation/i }));

        expect(await screen.findByText("What remains?")).toBeVisible();
        expect(screen.getByText(answer.direct_summary)).toBeVisible();
        expect(client.getConversationTranscript).toHaveBeenNthCalledWith(1, "conversation-1", {
            cursor: undefined,
            limit: 100,
        });
        expect(client.getConversationTranscript).toHaveBeenNthCalledWith(2, "conversation-1", {
            cursor: "page-2",
            limit: 100,
        });

        expect(client.streamMessage).not.toHaveBeenCalled();
        expect(client.createConversation).not.toHaveBeenCalled();
    });

    it("preserves the safe server error when retained transcript content has expired", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.listConversations).mockResolvedValue({
            items: [
                {
                    conversation_id: "conversation-1",
                    direct_scope: "organization",
                    message_count: 0,
                    schema_version: "dev_conversation_summary.v1",
                    state: "expired",
                    title: "Expired investigation",
                    updated_at: "2026-07-29T00:00:00Z",
                },
            ],
            next_cursor: null,
        });
        vi.mocked(client.getConversationTranscript).mockRejectedValue({
            detail: {
                schema_version: "dev_web_error.v1",
                code: "conversation_not_retained",
                safe_message: "This conversation is no longer retained.",
                retryable: false,
            },
        });
        navigation.pathname = "/dev";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: /Expired investigation/i }));

        expect(await screen.findByText("This conversation is no longer retained.")).toBeVisible();
        expect(client.streamMessage).not.toHaveBeenCalled();
    });

    it("keeps the newest history selection when an earlier request resolves last", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const firstConversation = {
            ...conversation,
            conversation_id: "conversation-first",
            title: "First investigation",
        };
        const secondConversation = {
            ...conversation,
            conversation_id: "conversation-second",
            title: "Second investigation",
        };
        let resolveFirst!: (value: DevConversation) => void;
        const slowFirst = new Promise<DevConversation>((resolve) => {
            resolveFirst = resolve;
        });
        vi.mocked(client.listConversations).mockResolvedValue({
            items: [
                {
                    conversation_id: "conversation-first",
                    direct_scope: "organization",
                    message_count: 1,
                    schema_version: "dev_conversation_summary.v1",
                    state: "active",
                    title: "First investigation",
                    updated_at: "2026-07-29T00:00:00Z",
                },
                {
                    conversation_id: "conversation-second",
                    direct_scope: "organization",
                    message_count: 1,
                    schema_version: "dev_conversation_summary.v1",
                    state: "active",
                    title: "Second investigation",
                    updated_at: "2026-07-29T00:00:01Z",
                },
            ],
            next_cursor: null,
        });
        vi.mocked(client.getConversation).mockImplementation((conversationId) =>
            conversationId === "conversation-first"
                ? slowFirst
                : Promise.resolve(secondConversation),
        );
        vi.mocked(client.getConversationTranscript).mockImplementation(async (conversationId) => ({
            conversation_id: conversationId,
            items: [
                {
                    answer: null,
                    created_at: "2026-07-29T00:00:01Z",
                    message_id: `message-${conversationId}`,
                    question:
                        conversationId === "conversation-first"
                            ? "First retained question"
                            : "Second retained question",
                    retry_of_run_id: null,
                    role: "user",
                    run_id: `run-${conversationId}`,
                    run_state: "completed",
                    schema_version: "dev_transcript_entry.v1",
                    scope: scope as unknown as DevConversation["current_scope"],
                },
            ],
            next_cursor: null,
            schema_version: "dev_conversation_transcript.v1",
        }));
        navigation.pathname = "/dev";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: /First investigation/i }));
        expect(client.getConversation).toHaveBeenCalledWith("conversation-first");
        await user.click(screen.getByRole("button", { name: /Second investigation/i }));
        expect(await screen.findByText("Second retained question")).toBeVisible();

        resolveFirst(firstConversation);
        await waitFor(() => {
            expect(screen.getByText("Second retained question")).toBeVisible();
            expect(screen.queryByText("First retained question")).not.toBeInTheDocument();
        });
        expect(client.getConversationTranscript).not.toHaveBeenCalledWith(
            "conversation-first",
            expect.anything(),
        );
    });

    it("resets conversation, transcript, and history when the active organization changes (CHAOS-3215 H1)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const rendered = render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What remains?");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        expect(await screen.findByText(answer.direct_summary)).toBeVisible();
        expect(client.createConversation).toHaveBeenCalledOnce();

        // The provider is mounted once in the app shell layout; switching
        // organizations updates the `orgId` prop on this already-mounted
        // instance (via router.refresh()) rather than remounting it.
        rendered.rerender(
            <AskDevProvider client={client} orgId="org-2">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        // The window itself (UI-only state) stays open, but every
        // conversation-scoped piece of state must be gone. Availability also
        // fails closed to a loading state until the new organization's
        // capabilities are (re)fetched (CHAOS-3215 M-capabilities), so the
        // conversation UI itself only reappears once that resolves.
        expect(screen.getByRole("region", { name: "Ask Dev" })).toBeVisible();
        expect(screen.queryByText(answer.direct_summary)).not.toBeInTheDocument();
        expect(screen.getByText("Checking Ask Dev availability…")).toBeVisible();

        // CHAOS-3524: previously asserted the removed persistent bar's
        // "Committed scope: Commits when you ask" — this was really a
        // wait-for-ready gate (an async `findByText`) disguised as a scope
        // check, since the composer doesn't exist at all while availability
        // is still "loading" (see the early-return guards in
        // AskDevConversation). The composer reappearing, empty, IS the
        // fresh-state proof now: a stale value here would mean the old
        // org's draft or a stale committed run leaked across the switch.
        const composer = await screen.findByRole("textbox", { name: "Ask Dev question" });
        expect(composer).toHaveValue("");

        await user.type(composer, "New org question");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        await waitFor(() => expect(client.createConversation).toHaveBeenCalledTimes(2));
    });

    it("does not let a superseded conversation-creation response overwrite a reset conversation (CHAOS-3215 H2)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        let resolveStaleCreate!: (value: DevConversation) => void;
        const staleCreate = new Promise<DevConversation>((resolve) => {
            resolveStaleCreate = resolve;
        });
        const staleConversation = { ...conversation, conversation_id: "conversation-stale" };
        const freshConversation = { ...conversation, conversation_id: "conversation-fresh" };
        vi.mocked(client.createConversation)
            .mockImplementationOnce(() => staleCreate)
            .mockResolvedValueOnce(freshConversation);
        navigation.pathname = "/dev";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        await user.type(
            await screen.findByRole("textbox", { name: "Ask Dev question" }),
            "First question",
        );
        await user.click(screen.getByRole("button", { name: "Ask" }));

        // Reset while the first conversation-creation request is still in flight.
        await user.click(await screen.findByRole("button", { name: "New conversation" }));
        resolveStaleCreate(staleConversation);
        await waitFor(() => expect(client.createConversation).toHaveBeenCalledTimes(1));

        await user.type(
            screen.getByRole("textbox", { name: "Ask Dev question" }),
            "Second question",
        );
        await user.click(screen.getByRole("button", { name: "Ask" }));

        await waitFor(() => expect(client.createConversation).toHaveBeenCalledTimes(2));
        expect(client.streamMessage).toHaveBeenCalledWith(
            "conversation-fresh",
            expect.objectContaining({ question: "Second question" }),
            expect.anything(),
        );
        expect(client.streamMessage).not.toHaveBeenCalledWith(
            "conversation-stale",
            expect.anything(),
            expect.anything(),
        );
    });

    it("moves focus to the newly-completed answer when a run finishes (CHAOS-3215 L2)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What remains?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        await waitFor(() =>
            expect(document.getElementById(`ask-dev-answer-${answer.answer_id}`)).toHaveFocus(),
        );
    });

    it("keeps streamed answer deltas out of the announced live region (CHAOS-3215 M3)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.streamMessage).mockImplementationOnce(
            (_conversationId, _request, options) =>
                new Promise<DevAnswer>(() => {
                    options?.onEvent?.({
                        event: "run.started",
                        run_id: "run-delta",
                        sequence: 0,
                    } as DevStreamEvent);
                    options?.onEvent?.({
                        event: "answer.delta",
                        delta: "Partial ",
                        run_id: "run-delta",
                        sequence: 1,
                    } as DevStreamEvent);
                    options?.onEvent?.({
                        event: "answer.delta",
                        delta: "streamed text",
                        run_id: "run-delta",
                        sequence: 2,
                    } as DevStreamEvent);
                    // Intentionally never resolves: keeps the run "running" so the
                    // transcript still shows the streamed delta.
                }),
        );
        const { container } = render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What changed?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        const deltaText = await screen.findByText("Partial streamed text");
        const transcriptRegion = container.querySelector('[aria-label="Ask Dev transcript"]');
        expect(transcriptRegion).not.toBeNull();
        expect(transcriptRegion).not.toHaveAttribute("aria-live");
        expect(deltaText.closest('[aria-hidden="true"]')).not.toBeNull();
    });

    it("disables the thinking pulse animation under prefers-reduced-motion (CHAOS-3215 L1)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.streamMessage).mockImplementationOnce(
            (_conversationId, _request, options) =>
                new Promise<DevAnswer>(() => {
                    options?.onEvent?.({
                        event: "run.started",
                        run_id: "run-pulse",
                        sequence: 0,
                    } as DevStreamEvent);
                }),
        );
        const { container } = render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What changed?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        const pulse = await waitFor(() => {
            const found = container.querySelector(".animate-pulse");
            expect(found).not.toBeNull();
            return found!;
        });
        expect(pulse).toHaveClass("motion-reduce:animate-none");
    });

    it("exposes a togglable history panel instead of hard-hiding controls below `lg` (CHAOS-3215 M4)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.listConversations).mockResolvedValue({
            items: [
                {
                    conversation_id: "conversation-1",
                    direct_scope: "organization",
                    message_count: 1,
                    schema_version: "dev_conversation_summary.v1",
                    state: "active",
                    title: "Delivery status",
                    updated_at: "2026-07-29T00:00:00Z",
                },
            ],
            next_cursor: null,
        });
        navigation.pathname = "/dev";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        const toggle = await screen.findByRole("button", { name: "Show conversations" });
        expect(toggle).toHaveAttribute("aria-expanded", "false");

        await user.click(toggle);

        expect(await screen.findByRole("button", { name: "Hide conversations" })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
        expect(await screen.findByRole("button", { name: /Delivery status/i })).toBeVisible();
    });

    it("applies modal dialog semantics and traps Tab focus only when the window renders full-screen on mobile (CHAOS-3215 M5)", async () => {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            configurable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: true,
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        });
        const user = userEvent.setup();
        const client = makeClient();
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        const dialog = screen.getByRole("dialog", { name: "Ask Dev" });
        expect(dialog).toHaveAttribute("aria-modal", "true");

        const workspaceLink = screen.getByRole("link", { name: "Ask Dev workspace" });
        const composer = screen.getByRole("textbox", { name: "Ask Dev question" });

        workspaceLink.focus();
        fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
        expect(composer).toHaveFocus();

        composer.focus();
        fireEvent.keyDown(dialog, { key: "Tab" });
        expect(workspaceLink).toHaveFocus();
    });

    it("does not apply modal dialog semantics to the docked desktop panel (CHAOS-3215 M5)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        expect(screen.queryByRole("dialog", { name: "Ask Dev" })).not.toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Ask Dev" })).toBeInTheDocument();
    });

    it("removes the per-conversation retention selector (CHAOS-3215 M7)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        expect(screen.queryByLabelText("Conversation retention")).not.toBeInTheDocument();
        expect(screen.queryByText("Do not retain")).not.toBeInTheDocument();

        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What remains?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(await screen.findByText(answer.direct_summary)).toBeVisible();
        expect(client.createConversation).toHaveBeenCalledWith(
            expect.not.objectContaining({ retention_days: expect.anything() }),
            expect.anything(),
        );
    });

    it("clears the previous organization's transcript synchronously at render time, before any passive effect can run (CHAOS-3215 H1)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const probe = { org2: false, sawStaleAnswerAtLayoutTime: null as boolean | null };
        const onLayout = () => {
            if (!probe.org2) return;
            probe.sawStaleAnswerAtLayoutTime =
                document.body.textContent?.includes(answer.direct_summary) ?? false;
        };
        const rendered = render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
                <LayoutProbe onLayout={onLayout} />
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What remains?");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        expect(await screen.findByText(answer.direct_summary)).toBeVisible();

        probe.org2 = true;
        rendered.rerender(
            <AskDevProvider client={client} orgId="org-2">
                <main>Dashboard</main>
                <LayoutProbe onLayout={onLayout} />
            </AskDevProvider>,
        );

        // A `useLayoutEffect` in this same commit already observed the DOM
        // with the previous organization's answer gone — proving the reset
        // did not depend on any `useEffect` having fired yet.
        expect(probe.sawStaleAnswerAtLayoutTime).toBe(false);
    });

    it("clears an unsent composer draft when the active organization changes (CHAOS-3215 H1)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const rendered = render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        const composer = screen.getByRole("textbox", { name: "Ask Dev question" });
        await user.type(composer, "Unsent draft under org 1");
        expect(composer).toHaveValue("Unsent draft under org 1");

        rendered.rerender(
            <AskDevProvider client={client} orgId="org-2">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        // Availability fails closed to a loading state until the new
        // organization's capabilities resolve (CHAOS-3215 M-capabilities); the
        // composer only reappears once that settles, and it must come back
        // empty.
        expect(await screen.findByRole("textbox", { name: "Ask Dev question" })).toHaveValue("");
    });

    it("does not let a delayed history response from the previous organization repopulate conversation titles after an org switch (CHAOS-3215 H2)", async () => {
        const client = makeClient();
        let resolveOrg1History!: (value: DevConversationList) => void;
        const org1History = new Promise<DevConversationList>((resolve) => {
            resolveOrg1History = resolve;
        });
        vi.mocked(client.listConversations).mockReturnValueOnce(org1History);
        navigation.pathname = "/dev";
        const rendered = render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        await waitFor(() => expect(client.listConversations).toHaveBeenCalledTimes(1));

        rendered.rerender(
            <AskDevProvider client={client} orgId="org-2">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        vi.mocked(client.listConversations).mockResolvedValueOnce({
            items: [
                {
                    conversation_id: "org-2-conv",
                    direct_scope: "organization",
                    message_count: 1,
                    schema_version: "dev_conversation_summary.v1",
                    state: "active",
                    title: "Org 2 investigation",
                    updated_at: "2026-07-29T00:00:00Z",
                },
            ],
            next_cursor: null,
        });

        // The org-1 request resolves *after* the switch to org-2.
        resolveOrg1History({
            items: [
                {
                    conversation_id: "org-1-conv",
                    direct_scope: "organization",
                    message_count: 1,
                    schema_version: "dev_conversation_summary.v1",
                    state: "active",
                    title: "Org 1 investigation",
                    updated_at: "2026-07-29T00:00:00Z",
                },
            ],
            next_cursor: null,
        });

        await waitFor(() => expect(client.listConversations).toHaveBeenCalledTimes(2));
        expect(await screen.findByText(/Org 2 investigation/i)).toBeVisible();
        expect(screen.queryByText(/Org 1 investigation/i)).not.toBeInTheDocument();
    });

    it("refetches capabilities for the newly active organization and fails closed until they resolve (CHAOS-3215 M-capabilities)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const rendered = render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        expect(screen.getByRole("textbox", { name: "Ask Dev question" })).toBeVisible();

        let resolveOrg2!: (value: Awaited<ReturnType<DevApiClient["getCapabilities"]>>) => void;
        const org2Capabilities = new Promise<Awaited<ReturnType<DevApiClient["getCapabilities"]>>>(
            (resolve) => {
                resolveOrg2 = resolve;
            },
        );
        vi.mocked(client.getCapabilities).mockReturnValueOnce(org2Capabilities);

        rendered.rerender(
            <AskDevProvider client={client} orgId="org-2">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        // Fails closed the instant the org changes: the previous
        // organization's "ready" composer must not still be shown while the
        // new organization's capabilities are pending.
        expect(screen.queryByRole("textbox", { name: "Ask Dev question" })).not.toBeInTheDocument();
        expect(screen.getByText("Checking Ask Dev availability…")).toBeVisible();

        resolveOrg2({
            schema_version: "dev_capabilities.v1",
            ask_dev: true,
            can_read: true,
            readiness: "ready",
        });

        expect(await screen.findByRole("textbox", { name: "Ask Dev question" })).toBeVisible();
        expect(client.getCapabilities).toHaveBeenCalledTimes(2);
    });

    it("renders an error-status answer through the failed-run alert treatment instead of as ordinary completed output (CHAOS-3215 M-error-status)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const errorAnswer = {
            ...answer,
            answer_id: "answer-error-1",
            status: "error",
            direct_summary: "Ask Dev could not validate the retrieved evidence safely.",
        } as unknown as DevAnswer;
        vi.mocked(client.streamMessage).mockImplementationOnce(
            async (_conversationId, _request, options) => {
                options?.onEvent?.({
                    event: "run.started",
                    run_id: "run-error",
                    sequence: 0,
                } as DevStreamEvent);
                options?.onEvent?.({
                    event: "answer.completed",
                    answer: errorAnswer,
                    run_id: "run-error",
                    sequence: 1,
                } as DevStreamEvent);
                return errorAnswer;
            },
        );
        render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What failed?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(errorAnswer.direct_summary);
        expect(screen.queryByText("AI-generated")).not.toBeInTheDocument();
    });

    it("does not let a superseded run steal focus from a later-opened saved conversation (CHAOS-3215 M-runInProgress)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.streamMessage).mockImplementationOnce(
            (_conversationId, _request, options) =>
                new Promise<DevAnswer>(() => {
                    options?.onEvent?.({
                        event: "run.started",
                        run_id: "run-superseded",
                        sequence: 0,
                    } as DevStreamEvent);
                    // Intentionally never resolves: the run stays "running"
                    // until "New conversation" supersedes it.
                }),
        );
        vi.mocked(client.listConversations).mockResolvedValue({
            items: [
                {
                    conversation_id: "conversation-1",
                    direct_scope: "organization",
                    message_count: 1,
                    schema_version: "dev_conversation_summary.v1",
                    state: "active",
                    title: "Delivery status",
                    updated_at: "2026-07-29T00:00:00Z",
                },
            ],
            next_cursor: null,
        });
        vi.mocked(client.getConversation).mockResolvedValue(conversation);
        vi.mocked(client.getConversationTranscript).mockResolvedValue({
            conversation_id: "conversation-1",
            items: [
                {
                    answer,
                    created_at: "2026-07-29T00:00:00Z",
                    message_id: "message-1",
                    question: null,
                    retry_of_run_id: null,
                    role: "assistant",
                    run_id: "run-original",
                    run_state: "completed",
                    schema_version: "dev_transcript_entry.v1",
                    scope: null,
                },
            ],
            next_cursor: null,
            schema_version: "dev_conversation_transcript.v1",
        });
        navigation.pathname = "/dev";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        await user.type(
            await screen.findByRole("textbox", { name: "Ask Dev question" }),
            "What remains?",
        );
        await user.click(screen.getByRole("button", { name: "Ask" }));
        await waitFor(() => expect(client.streamMessage).toHaveBeenCalledOnce());

        await user.click(await screen.findByRole("button", { name: "New conversation" }));
        await user.click(await screen.findByRole("button", { name: /Delivery status/i }));

        expect(await screen.findByText(answer.direct_summary)).toBeVisible();
        expect(document.getElementById(`ask-dev-answer-${answer.answer_id}`)).not.toHaveFocus();
    });

    it("does not let a delayed delete-conversation completion from the previous organization clear the new organization's active state (CHAOS-3215 M-delete)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        vi.mocked(client.listConversations).mockResolvedValue({
            items: [
                {
                    conversation_id: "conversation-1",
                    direct_scope: "organization",
                    message_count: 1,
                    schema_version: "dev_conversation_summary.v1",
                    state: "active",
                    title: "Delivery status",
                    updated_at: "2026-07-29T00:00:00Z",
                },
            ],
            next_cursor: null,
        });
        let resolveDelete!: () => void;
        vi.mocked(client.deleteConversation).mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    resolveDelete = resolve;
                }),
        );
        navigation.pathname = "/dev";
        const rendered = render(
            <AskDevProvider client={client} orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        await screen.findByRole("button", { name: /Delivery status/i });
        await user.click(screen.getByRole("button", { name: "Delete" }));
        await user.click(screen.getByRole("button", { name: "Confirm delete?" }));
        expect(client.deleteConversation).toHaveBeenCalledOnce();

        rendered.rerender(
            <AskDevProvider client={client} orgId="org-2">
                <AskDevWorkspace />
            </AskDevProvider>,
        );

        // Give org-2 an active, completed answer before the stale org-1
        // delete resolves.
        await user.type(
            await screen.findByRole("textbox", { name: "Ask Dev question" }),
            "Org 2 question",
        );
        await user.click(screen.getByRole("button", { name: "Ask" }));
        expect(await screen.findByText(answer.direct_summary)).toBeVisible();

        resolveDelete();
        await waitFor(() => expect(client.deleteConversation).toHaveBeenCalledOnce());

        // The stale org-1 delete completion must not have cleared org-2's
        // freshly-completed answer.
        expect(screen.getByText(answer.direct_summary)).toBeVisible();
    });

    it("aborts the active request when the provider unmounts (CHAOS-3215 M-unmount)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        let capturedSignal: AbortSignal | undefined;
        vi.mocked(client.streamMessage).mockImplementationOnce(
            (_conversationId, _request, options) =>
                new Promise<DevAnswer>(() => {
                    capturedSignal = options?.signal;
                    options?.onEvent?.({
                        event: "run.started",
                        run_id: "run-unmount",
                        sequence: 0,
                    } as DevStreamEvent);
                    // Intentionally never resolves.
                }),
        );
        const rendered = render(
            <AskDevProvider client={client} orgId="org-1">
                <main>Dashboard</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What remains?");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        await waitFor(() => expect(capturedSignal).toBeDefined());
        expect(capturedSignal?.aborted).toBe(false);

        rendered.unmount();

        expect(capturedSignal?.aborted).toBe(true);
    });

    it("moves focus into the panel when a desktop-open window becomes mobile-modal on resize (CHAOS-3215 M5)", async () => {
        // Held on an object (rather than bare `let`s) so TypeScript's control
        // flow analysis doesn't narrow these to `never` at the point they are
        // read below — they are only ever reassigned from inside a nested
        // closure that TS cannot prove runs before that read.
        const media: {
            query: { matches: boolean } | null;
            changeListener: (() => void) | null;
        } = { query: null, changeListener: null };
        // Cast the target to a loosely-typed object so `Object.defineProperty`'s
        // generic inference doesn't contextually type `value` against the real
        // `Window["matchMedia"]`/`MediaQueryList` DOM signatures — this stub
        // intentionally implements only the subset `AskDevWindow` reads.
        Object.defineProperty(window as unknown as Record<string, unknown>, "matchMedia", {
            writable: true,
            configurable: true,
            value: vi.fn().mockImplementation((query: string) => {
                const mediaQueryList = {
                    matches: false,
                    media: query,
                    addEventListener: (_event: string, listener: () => void) => {
                        media.changeListener = listener;
                    },
                    removeEventListener: () => {
                        media.changeListener = null;
                    },
                };
                media.query = mediaQueryList;
                return mediaQueryList;
            }),
        });
        const user = userEvent.setup();
        const client = makeClient();
        render(
            <div>
                <button type="button">Somewhere else</button>
                <AskDevProvider client={client} orgId="org-1">
                    <main>Dashboard</main>
                </AskDevProvider>
            </div>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        expect(screen.queryByRole("dialog", { name: "Ask Dev" })).not.toBeInTheDocument();

        // While the panel is still docked/non-modal on desktop, focus can
        // legitimately be elsewhere in the app — the desktop panel is
        // intentionally non-modal.
        const elsewhere = screen.getByRole("button", { name: "Somewhere else" });
        elsewhere.focus();
        expect(elsewhere).toHaveFocus();

        if (media.query) media.query.matches = true;
        media.changeListener?.();

        const dialog = await screen.findByRole("dialog", { name: "Ask Dev" });
        await waitFor(() => expect(dialog).toHaveFocus());

        // The close/restore-focus path still works once modal: Escape closes
        // the panel and returns focus to the launcher.
        fireEvent.keyDown(dialog, { key: "Escape" });
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Open Ask Dev" })).toHaveFocus(),
        );
    });
});

// CHAOS-3470. `ask_dev_contextual_entrypoints` gates SURFACE entry points —
// the launchers and typed context a route offers. A clarification candidate
// is not one: it arrives inside an answer the organization was fully
// entitled to receive, so committing one is answer semantics, not an entry
// point. Before this fix `selectProposedEntity` went through the same
// flag-gated path as surface proposals, so for an org with `ask_dev` on and
// contextual entry points off the "Use this scope" button rendered and did
// nothing at all — no state change, no error — leaving a clarification turn
// with no in-product resolution.
describe("AskDev candidate selection vs contextual-entrypoint gating (CHAOS-3470)", () => {
    beforeAll(() => {
        Element.prototype.scrollIntoView = vi.fn();
    });

    beforeEach(() => {
        navigation.pathname = "/dashboard";
        navigation.query = "";
        navigation.replace.mockClear();
    });

    function SetSurfaceContext() {
        const { setProposedContext } = useAskDev();
        return (
            <button
                type="button"
                onClick={() =>
                    setProposedContext({
                        routeId: "data_health",
                        entityRefs: [
                            {
                                entity_type: "repository",
                                entity_id: "repo-1",
                                display_label: "dev-health-web",
                            },
                        ],
                    })
                }
            >
                Register surface context
            </button>
        );
    }

    function SelectCandidate() {
        const { selectProposedEntity } = useAskDev();
        return (
            <button
                type="button"
                onClick={() =>
                    selectProposedEntity({
                        entity_type: "repository",
                        entity_id: "repo-1",
                        display_label: "dev-health-web",
                    })
                }
            >
                Use this scope
            </button>
        );
    }

    it("commits an answer's candidate even when contextual entry points are disabled", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        navigation.pathname = "/data-health";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <SelectCandidate />
                <main>Data Health</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.click(screen.getByRole("button", { name: "Use this scope" }));

        // CHAOS-3524: the persistent scope bar is gone; a real proposal now
        // surfaces as the "Scoped to ..." chip above the composer.
        await waitFor(() =>
            expect(screen.getByText("Scoped to")).toHaveTextContent("dev-health-web"),
        );
    });

    it("still ignores a SURFACE proposal when contextual entry points are disabled", async () => {
        // The other half of the ruling: ungating candidate selection must not
        // ungate entry points. Same flag state, same target entity — only the
        // origin differs, and only the answer-driven origin is exempt.
        //
        // This calls the provider's `setProposedContext` DIRECTLY rather than
        // going through AskDevContextRegistration. That component carries its
        // own `contextualEntrypointsEnabled` early return
        // (AskDevContextRegistration.tsx:53), so a registration-based test
        // passes on the component's guard and stays green even if the
        // provider's guard is deleted — it would prove the wrong layer
        // (codex adversarial review round 3, MEDIUM). Probing the provider is
        // the only way to assert the split this change actually made.
        const user = userEvent.setup();
        const client = makeClient();
        navigation.pathname = "/data-health";
        render(
            <AskDevProvider client={client} orgId="org-1">
                <SetSurfaceContext />
                <main>Data Health</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.click(screen.getByRole("button", { name: "Register surface context" }));

        // CHAOS-3524: an ignored proposal never sets proposedContext, so
        // there's no "Scoped to" chip at all now — stronger than the old
        // "doesn't contain the label" check, since it proves the whole
        // chip is absent, not just its wording.
        expect(screen.queryByText("Scoped to")).not.toBeInTheDocument();
    });

    it("accepts the same SURFACE proposal once contextual entry points are enabled", async () => {
        // Positive control for the guard above: without this, the negative
        // test could pass because the probe never worked at all.
        const user = userEvent.setup();
        const client = makeClient();
        navigation.pathname = "/data-health";
        render(
            <AskDevProvider client={client} orgId="org-1" contextualEntrypointsEnabled>
                <SetSurfaceContext />
                <main>Data Health</main>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        await user.click(screen.getByRole("button", { name: "Register surface context" }));

        await waitFor(() =>
            expect(screen.getByText("Scoped to")).toHaveTextContent("dev-health-web"),
        );
    });
});
