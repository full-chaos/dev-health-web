import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevApiClient } from "@/lib/dev/client";
import type { DevAnswer, DevConversation } from "@/lib/dev/generated";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilter } from "@/lib/filters/encode";
import { fingerprintAskDevFilter } from "@/lib/dev/contextualEntryPoints";

import { AskDevProvider } from "./AskDevProvider";
import { AskDevContextRegistration } from "./AskDevContextRegistration";
import { AskDevWorkspace } from "./AskDevWorkspace";

const navigation = vi.hoisted(() => ({
    pathname: "/issues/CHAOS-3216",
    filter: null as string | null,
    query: "",
    replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => ({ replace: navigation.replace }),
    useSearchParams: () =>
        new URLSearchParams(
            navigation.query || (navigation.filter ? { f: navigation.filter } : {}),
        ),
}));

const answer = {
    answer_id: "answer-1",
    conversation_id: "conversation-1",
    direct_summary: "The evidence suggests work remains.",
    status: "complete",
    claims: [],
    evidence: [],
    metrics: [],
    warnings: [],
} as unknown as DevAnswer;

function makeClient(): DevApiClient {
    const conversation = {
        conversation_id: "conversation-1",
        current_scope: {
            schema_version: "dev_scope.v1",
            organization_id: "org-1",
            direct_scope: "issue",
            repositories: [],
            entity_refs: [],
            team_ids: [],
            time_range: {
                start: "2026-06-29T00:00:00Z",
                end: "2026-07-29T00:00:00Z",
                timezone: "UTC",
            },
        },
        created_at: "2026-07-29T00:00:00Z",
        message_count: 0,
        retention_days: 30,
        schema_version: "dev_conversation.v1",
        state: "active",
        title: "Remaining work",
        updated_at: "2026-07-29T00:00:00Z",
    } as DevConversation;

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
        }),
        renameConversation: vi.fn(),
        deleteConversation: vi.fn(),
        streamMessage: vi.fn().mockResolvedValue(answer),
        resumeRun: vi.fn(),
        expandEvidence: vi.fn(),
        submitFeedback: vi.fn(),
    };
}

const issueContext = {
    routeId: "issue_detail" as const,
    entityRefs: [
        {
            entity_type: "issue" as const,
            entity_id: "CHAOS-3216",
            display_label: "CHAOS-3216",
        },
    ],
    suggestedQuestionIds: ["remaining_work" as const, "data_trust" as const],
};

const approvedSurfaceCases = [
    {
        name: "flow metrics",
        context: {
            routeId: "flow_metrics" as const,
            entityRefs: [],
            filterFingerprint: "filter-v1-00000001",
        },
        label: "Flow metrics · current filters",
    },
    {
        name: "investment",
        context: {
            routeId: "investment" as const,
            entityRefs: [],
            filterFingerprint: "filter-v1-00000002",
        },
        label: "Investment · current filters",
    },
    {
        name: "complexity",
        context: {
            routeId: "complexity" as const,
            entityRefs: [
                {
                    entity_type: "repository" as const,
                    entity_id: "repo-1",
                    display_label: "Selected repository",
                },
            ],
            filterFingerprint: "filter-v1-00000003",
        },
        label: "Complexity · Selected repository",
    },
    {
        name: "cognitive load",
        context: {
            routeId: "cognitive_load" as const,
            entityRefs: [],
            filterFingerprint: "filter-v1-00000004",
        },
        label: "Cognitive Load · current filters",
    },
    {
        name: "bottlenecks",
        context: {
            routeId: "bottlenecks" as const,
            entityRefs: [],
            filterFingerprint: "filter-v1-00000005",
        },
        label: "Bottlenecks · current filters",
    },
    {
        name: "Work Graph issue selection",
        context: {
            routeId: "work_graph" as const,
            entityRefs: [
                {
                    entity_type: "issue" as const,
                    entity_id: "ISS-1",
                    display_label: "Selected issue",
                },
            ],
        },
        label: "Work Graph · Selected issue",
    },
    {
        name: "repository detail",
        context: {
            routeId: "repository_detail" as const,
            entityRefs: [
                {
                    entity_type: "repository" as const,
                    entity_id: "repo-1",
                    display_label: "Selected repository",
                },
            ],
        },
        label: "Repository · Selected repository",
    },
    {
        name: "work-unit detail",
        context: {
            routeId: "work_unit_detail" as const,
            entityRefs: [
                {
                    entity_type: "work_unit" as const,
                    entity_id: "work-unit-1",
                    display_label: "Selected work unit",
                },
            ],
        },
        label: "Work unit · Selected work unit",
    },
    {
        name: "data health",
        context: {
            routeId: "data_health" as const,
            entityRefs: [],
        },
        label: "Data Confidence",
    },
] as const;

describe("Ask Dev registered context handoff", () => {
    beforeAll(() => {
        Element.prototype.scrollIntoView = vi.fn();
    });

    beforeEach(() => {
        navigation.pathname = "/issues/CHAOS-3216";
        navigation.filter = null;
        navigation.query = "";
        navigation.replace.mockClear();
    });

    it.each(approvedSurfaceCases)(
        "opens $name with typed proposed scope and never auto-submits",
        async ({ context, label }) => {
            const user = userEvent.setup();
            const client = makeClient();
            render(
                <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                    <AskDevContextRegistration context={context} />
                </AskDevProvider>,
            );

            expect(
                screen.queryByRole("button", { name: "Ask Dev about this" }),
            ).not.toBeInTheDocument();
            await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

            // CHAOS-3524: the persistent scope bar is gone (display-only —
            // the request payload this proves lower in the file is
            // unaffected); a real typed proposal (this is one, via
            // AskDevContextRegistration) now surfaces as the small
            // "Scoped to ..." chip above the composer instead.
            expect(screen.getByText("Scoped to")).toHaveTextContent(label);
            expect(client.createConversation).not.toHaveBeenCalled();
            expect(client.streamMessage).not.toHaveBeenCalled();
        },
    );

    it("shows typed proposed scope, sends nothing on open, and preserves it in /dev", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const view = (workspace = false) => (
            <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                {workspace ? (
                    <AskDevWorkspace />
                ) : (
                    <>
                        <p>Private rendered page prose must never become context.</p>
                        <AskDevContextRegistration context={issueContext} />
                    </>
                )}
            </AskDevProvider>
        );
        const rendered = render(view());

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));

        expect(screen.getByRole("region", { name: "Ask Dev" })).toHaveFocus();
        // CHAOS-3524: the persistent scope bar is gone; a real typed
        // proposal (this one, via AskDevContextRegistration) now surfaces
        // as the "Scoped to ..." chip above the composer instead.
        expect(screen.getByText("Scoped to")).toHaveTextContent("Issue · CHAOS-3216");
        expect(
            screen.getByRole("button", {
                name: "What work appears to remain in this scope?",
            }),
        ).toBeInTheDocument();
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();

        navigation.pathname = "/dev";
        rendered.rerender(view(true));
        expect(screen.getByText("Scoped to")).toHaveTextContent("Issue · CHAOS-3216");
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();

        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What remains?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(client.createConversation).toHaveBeenCalledWith(
            expect.objectContaining({
                current_scope: expect.objectContaining({
                    direct_scope: "issue",
                    entity_refs: issueContext.entityRefs,
                    surface_context: {
                        route_id: "issue_detail",
                        entity_refs: issueContext.entityRefs,
                    },
                }),
            }),
            expect.anything(),
        );
        expect(JSON.stringify(vi.mocked(client.createConversation).mock.calls)).not.toContain(
            "Private rendered page prose",
        );
        expect(JSON.stringify(vi.mocked(client.streamMessage).mock.calls)).not.toContain(
            "Private rendered page prose",
        );
    });

    it("does not leak registered entity context into an unrelated route", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const rendered = render(
            <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                <AskDevContextRegistration context={issueContext} />
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        expect(screen.getByText("Scoped to")).toHaveTextContent("Issue · CHAOS-3216");

        navigation.pathname = "/metrics";
        rendered.rerender(
            <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                <p>Flow metrics</p>
            </AskDevProvider>,
        );

        // CHAOS-3524: the persistent scope bar (which used to show the
        // fallback ambient label, e.g. "Flow") is gone — an ambient
        // pathname-derived label with no explicit registered proposal has
        // no display affordance anymore, only a genuine typed proposal
        // does (checked above). What must still hold is the actual leak
        // guard: nothing on the page references the issue that was
        // registered on the page just navigated away from, and a
        // submitted question doesn't carry its scope either.
        expect(screen.queryByText(/CHAOS-3216/u)).not.toBeInTheDocument();
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();

        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What changed?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(client.createConversation).toHaveBeenCalledOnce();
        const [createArgs] = vi.mocked(client.createConversation).mock.calls[0]!;
        expect(createArgs.current_scope.direct_scope).not.toBe("issue");
        expect(createArgs.current_scope.entity_refs).toEqual([]);
        expect(JSON.stringify(createArgs)).not.toContain("CHAOS-3216");
    });

    it("does not resurrect a cleared contextual scope when later opening /dev from an unrelated route (CHAOS-3215 M1)", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const rendered = render(
            <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                <AskDevContextRegistration context={issueContext} />
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        expect(screen.getByText("Scoped to")).toHaveTextContent("Issue · CHAOS-3216");

        // Navigate away to an unrelated route — the proposal correctly clears here.
        navigation.pathname = "/metrics";
        rendered.rerender(
            <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                <p>Flow metrics</p>
            </AskDevProvider>,
        );
        // CHAOS-3524: no chip for an ambient-only label anymore (see the
        // sibling "does not leak..." test) — the load-bearing check is
        // that the issue reference is gone, proven below on /dev too.
        expect(screen.queryByText("Scoped to")).not.toBeInTheDocument();

        // Now land on /dev from that unrelated route (not directly from the page
        // that registered the context). Because the scope was never actually
        // cleared — only hidden by the derived visibility check — it used to
        // resurface here even though the user had moved on from that page.
        navigation.pathname = "/dev";
        rendered.rerender(
            <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                <AskDevWorkspace />
            </AskDevProvider>,
        );
        expect(screen.queryByText("Scoped to")).not.toBeInTheDocument();
        expect(screen.queryByText(/CHAOS-3216/u)).not.toBeInTheDocument();
    });

    it("ignores registered context when contextual entry points are disabled", async () => {
        const client = makeClient();
        render(
            <AskDevProvider client={client} contextualEntrypointsEnabled={false} orgId="org-1">
                <AskDevContextRegistration context={issueContext} />
            </AskDevProvider>,
        );

        expect(
            screen.queryByRole("button", { name: "Ask Dev about this" }),
        ).not.toBeInTheDocument();
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        // CHAOS-3524: disabled entry points means no proposal was ever
        // registered, so there's no "Scoped to" chip to show at all — that
        // absence, plus the request payload below carrying no trace of the
        // issue, is what proves the registered context was truly ignored
        // (not merely hidden from a display that no longer exists).
        expect(screen.queryByText("Scoped to")).not.toBeInTheDocument();
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();

        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What changed?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(client.createConversation).toHaveBeenCalledOnce();
        const [createArgs] = vi.mocked(client.createConversation).mock.calls[0]!;
        expect(createArgs.current_scope.direct_scope).not.toBe("issue");
        expect(createArgs.current_scope.surface_context).toBeNull();
        expect(JSON.stringify(createArgs)).not.toContain("CHAOS-3216");
    });

    it("lets the user remove proposed context before asking", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        render(
            <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                <AskDevContextRegistration context={issueContext} />
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        expect(screen.getByText("Scoped to")).toHaveTextContent("Issue · CHAOS-3216");

        // CHAOS-3524: "Clear context" now lives inside the "Scoped to" chip
        // rather than the removed persistent bar — same action, same
        // accessible name, new home.
        await user.click(screen.getByRole("button", { name: "Clear context" }));

        expect(screen.queryByText("Scoped to")).not.toBeInTheDocument();

        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What changed?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(client.createConversation).toHaveBeenCalledOnce();
        const [createArgs] = vi.mocked(client.createConversation).mock.calls[0]!;
        expect(createArgs.current_scope.direct_scope).not.toBe("issue");
        expect(createArgs.current_scope.surface_context).toBeNull();
        expect(JSON.stringify(createArgs)).not.toContain("CHAOS-3216");
    });

    it("does not turn deferred supporting-evidence routes into direct context", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        navigation.pathname = "/deployments/deployment-1";
        navigation.filter = encodeFilter({
            ...defaultMetricFilter,
            scope: { level: "repo", ids: ["private-repository"] },
        });

        render(
            <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                <p>Deployment supporting evidence</p>
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        // CHAOS-3524: a deferred route never registers a proposal, so
        // there's no chip — proven properly below via the actual request
        // payload (direct_scope: organization, surface_context: null),
        // which is the stronger, load-bearing form of this claim anyway.
        expect(screen.queryByText("Scoped to")).not.toBeInTheDocument();
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();

        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What changed?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(client.createConversation).toHaveBeenCalledWith(
            expect.objectContaining({
                current_scope: expect.objectContaining({
                    direct_scope: "organization",
                    entity_refs: [],
                    repositories: [],
                    team_ids: [],
                    surface_context: null,
                }),
            }),
            expect.anything(),
        );
        expect(JSON.stringify(vi.mocked(client.createConversation).mock.calls)).not.toContain(
            "private-repository",
        );
    });

    it("commits approved legacy filters consistently with the visible proposal", async () => {
        const user = userEvent.setup();
        const client = makeClient();
        const filters = {
            ...defaultMetricFilter,
            time: { ...defaultMetricFilter.time, range_days: 14 },
            scope: { level: "team" as const, ids: ["team-a"] },
        };
        navigation.pathname = "/diagnose";
        navigation.query = "scope_type=team&scope_id=team-a&range_days=14";

        render(
            <AskDevProvider client={client} contextualEntrypointsEnabled orgId="org-1">
                <AskDevContextRegistration
                    context={{
                        routeId: "diagnose_overview",
                        entityRefs: [],
                        filterFingerprint: fingerprintAskDevFilter(encodeFilter(filters)),
                    }}
                />
            </AskDevProvider>,
        );

        await user.click(await screen.findByRole("button", { name: "Open Ask Dev" }));
        // CHAOS-3524: the persistent bar's "Teams: 1 selected" readout is
        // gone; the team-scoping claim this test makes ("consistently with
        // the visible proposal") is proven properly below via the actual
        // request payload (team_ids: ["team-a"]) instead — that was always
        // the real assertion, this was a redundant pre-submit echo of it.
        expect(client.createConversation).not.toHaveBeenCalled();
        expect(client.streamMessage).not.toHaveBeenCalled();

        await user.type(screen.getByRole("textbox", { name: "Ask Dev question" }), "What changed?");
        await user.click(screen.getByRole("button", { name: "Ask" }));

        expect(client.createConversation).toHaveBeenCalledWith(
            expect.objectContaining({
                current_scope: expect.objectContaining({
                    direct_scope: "organization",
                    team_ids: ["team-a"],
                    surface_context: expect.objectContaining({
                        route_id: "diagnose_overview",
                        filter_fingerprint: fingerprintAskDevFilter(encodeFilter(filters)),
                    }),
                }),
            }),
            expect.anything(),
        );
    });
});
