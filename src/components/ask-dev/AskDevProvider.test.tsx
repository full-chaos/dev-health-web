import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevApiClient } from "@/lib/dev/client";
import type {
    DevAnswer,
    DevConversation,
    DevConversationTranscript,
    DevScope,
    DevStreamEvent,
} from "@/lib/dev/generated";

import { AskDevProvider } from "./AskDevProvider";
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
        expandEvidence: vi.fn(),
        submitFeedback: vi.fn(),
    };
}

describe("AskDevProvider permanent window", () => {
    beforeAll(() => {
        Element.prototype.scrollIntoView = vi.fn();
    });

    beforeEach(() => {
        navigation.pathname = "/dashboard";
        navigation.query = "";
        navigation.replace.mockClear();
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
        expect(screen.getByText("Proposed context:")).toHaveTextContent("Organization");
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();
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
        expect(screen.getByText("Proposed context:")).toHaveTextContent("Flow");
        expect(screen.getByText("Committed scope:")).toHaveTextContent("Organization");
        expect(client.streamMessage).toHaveBeenCalledOnce();
        await waitFor(() =>
            expect(screen.getByRole("link", { name: "Ask Dev workspace" })).toHaveAttribute(
                "href",
                "/dev",
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
});
