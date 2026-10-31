import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No canvas in jsdom: the Ask Dev charts draw through a stub that keeps ECharts' event order.
vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../../render/__tests__/echartsStub")).echartsStubModule,
);
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

const nav = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    return {
        pathname: "/investment",
        listeners,
        go(pathname: string) {
            nav.pathname = pathname;
            for (const listener of listeners) listener();
        },
    };
});
vi.mock("next/navigation", async () => {
    const { useSyncExternalStore: useStore } = await import("react");
    const subscribe = (listener: () => void) => {
        nav.listeners.add(listener);
        return () => nav.listeners.delete(listener);
    };
    return {
        usePathname: () => useStore(subscribe, () => nav.pathname),
        useSearchParams: () => new URLSearchParams(),
        useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    };
});
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { id: "user-1", org_id: "org-1" }, expires: "2099-01-01" },
        status: "authenticated",
    }),
}));

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import type { PageEntityInput } from "@/lib/ask-dev/page-context";

import { AskDevPanel } from "../../AskDevPanel";
import { AskDevShellProvider, useAskDevShell } from "../../AskDevShellContext";
import { AskDevConversationProvider } from "../../conversation/AskDevConversationContext";
import { COMPOSER_COPY } from "../../conversation/AskDevComposer";
import {
    accepted,
    captureResult,
    FakeTransport,
    resultEvent,
} from "../../conversation/__tests__/fakeTransport";
import refusalScopeAnchor from "../../answer/__tests__/captures/acr_encoder_budget_refusal_scope_anchor.event.json";
import { CONTEXT_CHIPS_COPY } from "../AskDevContextChips";
import { AskDevPageContextProvider, useAskDevPageContext } from "../AskDevPageContext";

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const CLARIFICATION = captureResult("kiac_project_status_clarification.event.json");
const ON = { ask_dev: true, agent_context_runtime: true, ask_dev_contextual_entrypoints: true };

const ORG: PageEntityInput = { kind: "organization", id: "org-1", label: "E2E Organization" };
const REPO: PageEntityInput = {
    kind: "repository",
    id: "repo:full-chaos/dev-health-web",
    label: "full-chaos/dev-health-web",
};
const TEAM: PageEntityInput = { kind: "team", id: "team:platform", label: "Platform" };

const subscribe = (listener: () => void) => {
    nav.listeners.add(listener);
    return () => nav.listeners.delete(listener);
};

/** The page on the current route: it registers the entities it shows, as a page would. */
function Page({ refs }: { refs: Record<string, readonly PageEntityInput[]> }) {
    const pathname = useSyncExternalStore(subscribe, () => nav.pathname);
    return <Registers key={pathname} refs={refs[pathname] ?? []} />;
}
function Registers({ refs }: { refs: readonly PageEntityInput[] }) {
    useAskDevPageContext(refs);
    return null;
}
function Opener() {
    const { setOpen } = useAskDevShell();
    return (
        <button type="button" onClick={() => setOpen(true)}>
            test-open
        </button>
    );
}

function renderShell(
    transport: FakeTransport,
    refs: Record<string, readonly PageEntityInput[]>,
    features: Record<string, boolean> = ON,
) {
    return render(
        <AdminTierProvider tier="team" features={features}>
            <AskDevShellProvider>
                <AskDevPageContextProvider>
                    <AskDevConversationProvider transport={transport}>
                        <Page refs={refs} />
                        <Opener />
                        <AskDevPanel />
                    </AskDevConversationProvider>
                </AskDevPageContextProvider>
            </AskDevShellProvider>
        </AdminTierProvider>,
    );
}

const panel = () => screen.getByRole("complementary", { name: "Ask Dev" });
const chips = () => within(panel()).queryAllByTestId("ask-dev-context-chip");
const chipText = () => chips().map((chip) => chip.textContent);

async function ask(question = "Which teams are overloaded?") {
    await userEvent.type(
        within(panel()).getByRole("textbox", { name: COMPOSER_COPY.label }),
        `${question}{Enter}`,
    );
}

const sentHints = (transport: FakeTransport, index = 0) =>
    transport.calls[index]?.request.requested_scope?.subject_hints;

beforeEach(() => {
    // CHAOS-11956: a run's `accepted` writes the restore hint; each test starts with none.
    window.sessionStorage.clear();
    nav.pathname = "/investment";
    vi.clearAllMocks();
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

describe("the proposal: chips before submit, and nothing sent by opening", () => {
    it("shows the page's entities as chips, in order, and sends nothing on open", async () => {
        const transport = new FakeTransport();
        renderShell(transport, { "/investment": [ORG, REPO, TEAM] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        const group = within(panel()).getByRole("group", { name: CONTEXT_CHIPS_COPY.title });
        expect(group).toBeInTheDocument();
        expect(chipText()).toEqual([
            "Organization:E2E Organization",
            "Repository:full-chaos/dev-health-web",
            "Team:Platform",
        ]);
        // No id is drawn.
        expect(group.textContent).not.toContain("repo:full-chaos");
        expect(transport.calls).toEqual([]);
    });

    it("keeps out what this route may not propose, and logs kinds and reasons only", async () => {
        renderShell(new FakeTransport(), {
            "/investment": [
                ORG,
                { kind: "pull_request", id: "pr:1", label: "Fix the build" },
                { kind: "deployment", id: "dep:1", label: "Deploy 1" },
                // codex r2 opinion on #1645: an unknown kind is free text, so it is never logged.
                { kind: "spaceship named Ada", id: "x", label: "y" },
            ],
        });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(chipText()).toEqual(["Organization:E2E Organization"]);
        expect(log.warn).toHaveBeenCalledWith(
            {
                route_id: "investment",
                dropped: [
                    { kind: "pull_request", reason: "not_for_route" },
                    { kind: "deployment", reason: "evidence_only" },
                    { kind: "unknown", reason: "unknown_kind" },
                ],
            },
            "Ask Dev page context entities dropped",
        );
        expect(JSON.stringify(log.warn.mock.calls)).not.toMatch(
            /Fix the build|pr:1|dep:1|spaceship/u,
        );
    });

    it("draws a hostile label as inert text", async () => {
        renderShell(new FakeTransport(), {
            "/investment": [
                { kind: "team", id: "team:x", label: '<img src=x onerror="alert(1)">' },
            ],
        });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(chipText()).toEqual(['Team:<img src=x onerror="alert(1)">']);
        expect(panel().querySelector("img")).toBeNull();
    });
});

describe("sending: the chips left in place go as subject hints", () => {
    it("sends the page's entities as hints: kind, id, label and the page-context source", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(transport, { "/investment": [ORG, REPO] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await ask();
        await waitFor(() => expect(transport.calls).toHaveLength(1));
        expect(sentHints(transport)).toEqual([
            {
                kind: "organization",
                id: "org-1",
                label: "E2E Organization",
                source: "ask_dev_page_context",
            },
            {
                kind: "repository",
                id: "repo:full-chaos/dev-health-web",
                label: "full-chaos/dev-health-web",
                source: "ask_dev_page_context",
            },
        ]);
    });

    it("leaves out a chip the user removed", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(transport, { "/investment": [ORG, REPO, TEAM] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.click(
            within(panel()).getByRole("button", {
                name: "Remove Repository full-chaos/dev-health-web",
            }),
        );
        expect(chipText()).toEqual(["Organization:E2E Organization", "Team:Platform"]);
        await ask();
        await waitFor(() => expect(transport.calls).toHaveLength(1));
        expect(sentHints(transport)?.map((hint) => hint.kind)).toEqual(["organization", "team"]);
    });

    it("sends no hint and draws no chip when every chip was removed", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(transport, { "/investment": [ORG] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.click(
            within(panel()).getByRole("button", { name: "Remove Organization E2E Organization" }),
        );
        expect(within(panel()).queryByTestId("ask-dev-context")).toBeNull();
        await ask();
        await waitFor(() => expect(transport.calls).toHaveLength(1));
        expect(transport.calls[0]!.request).not.toHaveProperty("requested_scope");
    });

    it("puts page hints first on a follow-up, then the previous answer's subjects, each once", async () => {
        nav.pathname = "/bottleneck";
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)], [resultEvent(PARTIAL)]);
        const committed = PARTIAL.subject_resolution.committed[0]!;
        // The page shows the project the previous answer committed: it is sent once, as page context.
        const sameProject: PageEntityInput = {
            kind: committed.kind,
            id: committed.canonical_id,
            label: committed.label,
        };
        renderShell(transport, { "/bottleneck": [ORG, sameProject] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await ask();
        await within(panel()).findByTestId("ask-dev-answer");
        await ask("Why?");
        await waitFor(() => expect(transport.calls).toHaveLength(2));
        expect(sentHints(transport, 1)).toEqual([
            {
                kind: "organization",
                id: "org-1",
                label: "E2E Organization",
                source: "ask_dev_page_context",
            },
            {
                kind: committed.kind,
                id: committed.canonical_id,
                label: committed.label,
                source: "ask_dev_page_context",
            },
        ]);
    });

    it("keeps the previous answer's subjects after the page hints", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)], [resultEvent(PARTIAL)]);
        const committed = PARTIAL.subject_resolution.committed[0]!;
        renderShell(transport, { "/investment": [ORG] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await ask();
        await within(panel()).findByTestId("ask-dev-answer");
        await ask("Why?");
        await waitFor(() => expect(transport.calls).toHaveLength(2));
        expect(sentHints(transport, 1)?.map((hint) => [hint.kind, hint.id])).toEqual([
            ["organization", "org-1"],
            [committed.kind, committed.canonical_id],
        ]);
    });
});

// codex r2 on #1645: the chips say they go with the next question, so every next question from the
// live turn carries them: a clarification choice and a narrower re-ask too, not only the composer.
describe("every next question carries the page context", () => {
    const pageHint = {
        kind: "organization",
        id: "org-1",
        label: "E2E Organization",
        source: "ask_dev_page_context",
    };

    it("a clarification choice asked again carries the page hints", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(CLARIFICATION)], [resultEvent(PARTIAL)]);
        renderShell(transport, { "/investment": [ORG] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await ask("What is the status of the project?");
        await within(panel()).findByTestId("ask-dev-clarification");
        await userEvent.click(within(panel()).getAllByTestId("ask-dev-clarification-chip")[0]!);
        await userEvent.click(within(panel()).getByTestId("ask-dev-clarification-ask-again"));
        await waitFor(() => expect(transport.calls).toHaveLength(2));
        expect(sentHints(transport, 1)?.[0]).toEqual(pageHint);
    });

    it("a narrower re-ask carries the page hints", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), refusalScopeAnchor as never], [resultEvent(PARTIAL)]);
        renderShell(transport, { "/investment": [ORG] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await ask("Compare every team's flow over the year");
        await userEvent.click(await within(panel()).findByTestId("ask-dev-refusal-reask"));
        await waitFor(() => expect(transport.calls).toHaveLength(2));
        expect(sentHints(transport, 1)?.[0]).toEqual(pageHint);
    });
});

describe("navigation changes the proposal, not the committed scope", () => {
    it("shows the new page's chips, forgets removals, and leaves a sent turn as it was", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(transport, {
            "/investment": [ORG, REPO],
            "/metrics": [TEAM, ORG],
        });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await userEvent.click(
            within(panel()).getByRole("button", { name: "Remove Organization E2E Organization" }),
        );
        await ask();
        await waitFor(() => expect(transport.calls).toHaveLength(1));
        const sent = structuredClone(sentHints(transport));

        act(() => nav.go("/metrics"));
        // The organization removed on the last page is proposed again: removals belong to a proposal.
        await waitFor(() =>
            expect(chipText()).toEqual(["Team:Platform", "Organization:E2E Organization"]),
        );
        expect(sentHints(transport)).toEqual(sent);
        expect(transport.calls).toHaveLength(1);
    });

    it("a page that is not an approved surface proposes nothing", async () => {
        nav.pathname = "/dashboard";
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(transport, { "/dashboard": [ORG] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(within(panel()).queryByTestId("ask-dev-context")).toBeNull();
        await ask();
        await waitFor(() => expect(transport.calls).toHaveLength(1));
        expect(transport.calls[0]!.request).not.toHaveProperty("requested_scope");
    });
});

describe("the ask_dev_contextual_entrypoints gate", () => {
    it("without it: no chip and no page hint", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(
            transport,
            { "/investment": [ORG, REPO] },
            { ask_dev: true, agent_context_runtime: true, ask_dev_contextual_entrypoints: false },
        );
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(within(panel()).queryByTestId("ask-dev-context")).toBeNull();
        await ask();
        await waitFor(() => expect(transport.calls).toHaveLength(1));
        expect(transport.calls[0]!.request).not.toHaveProperty("requested_scope");
    });
});

describe("a tampered id is a hint, never a scope (plan §2.4)", () => {
    it("is sent as the page stated it, with nothing widened, and the answer's clarification is drawn", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(CLARIFICATION)]);
        const forged: PageEntityInput = {
            kind: "repository",
            id: "repo:another-org/secret",
            label: "full-chaos/dev-health-web",
        };
        renderShell(transport, { "/investment": [forged] });
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await ask();
        await waitFor(() => expect(transport.calls).toHaveLength(1));
        const request = transport.calls[0]!.request;
        expect(request.requested_scope).toEqual({
            subject_hints: [
                {
                    kind: "repository",
                    id: "repo:another-org/secret",
                    label: "full-chaos/dev-health-web",
                    source: "ask_dev_page_context",
                },
            ],
        });
        expect(Object.keys(request.requested_scope ?? {})).toEqual(["subject_hints"]);
        expect(await within(panel()).findByTestId("ask-dev-clarification")).toBeInTheDocument();
    });
});

describe("registration ends with the page", () => {
    it("drops the page's chips when it unmounts", async () => {
        function Toggle({ on }: { on: boolean }) {
            return on ? <Registers refs={[ORG]} /> : null;
        }
        const transport = new FakeTransport();
        const tree = (on: boolean) => (
            <AdminTierProvider tier="team" features={ON}>
                <AskDevShellProvider>
                    <AskDevPageContextProvider>
                        <AskDevConversationProvider transport={transport}>
                            <Toggle on={on} />
                            <Opener />
                            <AskDevPanel />
                        </AskDevConversationProvider>
                    </AskDevPageContextProvider>
                </AskDevShellProvider>
            </AdminTierProvider>
        );
        const view = render(tree(true));
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(chipText()).toEqual(["Organization:E2E Organization"]);
        view.rerender(tree(false));
        expect(within(panel()).queryByTestId("ask-dev-context")).toBeNull();
    });
});
