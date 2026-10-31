import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No canvas in jsdom: the Ask Dev charts draw through a stub that keeps ECharts' event order.
vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../render/__tests__/echartsStub")).echartsStubModule,
);
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

/** A router that changes the route the way Next does: the shell stays mounted, the page changes. */
const nav = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    return {
        pathname: "/dashboard",
        search: "",
        pushes: [] as string[],
        /** A navigation that has not finished yet: `push` records the route and stays put. */
        hold: false,
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
        useSearchParams: () => new URLSearchParams(nav.search),
        useRouter: () => ({
            push: (href: string) => {
                nav.pushes.push(href);
                if (!nav.hold) nav.go(href);
            },
            replace: vi.fn(),
            refresh: vi.fn(),
        }),
    };
});
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { id: "user-1", org_id: "org-1" }, expires: "2099-01-01" },
        status: "authenticated",
    }),
}));

import { useSyncExternalStore } from "react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { resetRightDrawerForTest, rightDrawerOwnerForTest } from "@/lib/shell/rightDrawer";

import { AskDevFullPage, FULL_PAGE_COPY } from "../AskDevFullPage";
import { AskDevLauncher } from "../AskDevLauncher";
import { AskDevPanel } from "../AskDevPanel";
import { TRANSCRIPT_COPY } from "../AskDevConversationView";
import { AskDevShellProvider, useAskDevShell } from "../AskDevShellContext";
import {
    AskDevConversationProvider,
    partitionTag,
    UNSAVED_CONVERSATION_KEY,
    useAskDevNotSaved,
} from "../conversation/AskDevConversationContext";
import { COMPOSER_COPY } from "../conversation/AskDevComposer";
import type { AskDevTransport } from "../conversation/transport";
import {
    accepted,
    captureResult,
    deferred,
    FakeTransport,
    resultEvent,
} from "../conversation/__tests__/fakeTransport";

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const ON = { ask_dev: true, agent_context_runtime: true };
const TAG = partitionTag(["org-1", "user-1", ""].join("\u0000"));

const subscribe = (listener: () => void) => {
    nav.listeners.add(listener);
    return () => nav.listeners.delete(listener);
};

/** What `useAskDevNotSaved` says, for the hook's own contract. */
function NotSavedProbe() {
    return <output data-testid="not-saved-probe">{String(useAskDevNotSaved())}</output>;
}

/** The page the route shows: `/dev`, or another page with a launcher-like opener. */
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

function renderShell(transport: AskDevTransport | null, features: Record<string, boolean> = ON) {
    return render(
        <AdminTierProvider tier="team" features={features}>
            <AskDevShellProvider>
                <AskDevConversationProvider transport={transport}>
                    <AskDevLauncher placement="top-bar" />
                    <Page />
                    <AskDevPanel />
                    <NotSavedProbe />
                </AskDevConversationProvider>
            </AskDevShellProvider>
        </AdminTierProvider>,
    );
}

const panel = () => screen.getByRole("complementary", { name: "Ask Dev" });
const page = () => screen.getByTestId("ask-dev-page");

async function askInPanel(question = "Which projects are at risk?") {
    await userEvent.click(screen.getByRole("button", { name: "test-open" }));
    await userEvent.type(
        within(panel()).getByRole("textbox", { name: COMPOSER_COPY.label }),
        `${question}{Enter}`,
    );
}

beforeEach(() => {
    nav.hold = false;
    nav.pushes.length = 0;
    nav.go("/dashboard?f=team");
    window.sessionStorage.clear();
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

describe("Expand: the full page shows the same run, and nothing is sent again", () => {
    it("mid-stream: the running turn moves to /dev, then its answer arrives there", async () => {
        const transport = new FakeTransport();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        renderShell(transport);
        await askInPanel();
        expect(await within(panel()).findByTestId("ask-dev-stages")).toBeInTheDocument();

        await userEvent.click(within(panel()).getByRole("button", { name: "Open full page" }));
        expect(nav.pushes).toEqual(["/dev"]);
        expect(screen.queryByRole("complementary", { name: "Ask Dev" })).toBeNull();
        expect(within(page()).getByTestId("ask-dev-stages")).toBeInTheDocument();
        expect(within(page()).getByText("Which projects are at risk?")).toBeInTheDocument();
        expect(transport.calls).toHaveLength(1);
        expect(transport.calls[0]!.signal.aborted).toBe(false);

        gate.resolve();
        expect(await within(page()).findByTestId("ask-dev-answer")).toBeInTheDocument();
        expect(transport.calls).toHaveLength(1);
    });

    it("closes the panel at once, before the route has changed", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(transport);
        await askInPanel();
        await within(panel()).findByTestId("ask-dev-answer");
        nav.hold = true;
        await userEvent.click(within(panel()).getByRole("button", { name: "Open full page" }));
        expect(nav.pushes).toEqual(["/dev"]);
        expect(nav.pathname).toBe("/dashboard");
        expect(screen.queryByRole("complementary", { name: "Ask Dev" })).toBeNull();
    });

    it("after the answer: /dev shows it, with no new request", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(transport);
        await askInPanel();
        expect(await within(panel()).findByTestId("ask-dev-answer")).toBeInTheDocument();

        await userEvent.click(within(panel()).getByRole("button", { name: "Open full page" }));
        expect(within(page()).getByTestId("ask-dev-answer")).toBeInTheDocument();
        expect(transport.calls).toHaveLength(1);
    });
});

describe("Minimize: back to the page it came from, with the panel open on the same thread", () => {
    it("returns to the page and query the panel was expanded from", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)], [resultEvent(PARTIAL)]);
        renderShell(transport);
        await askInPanel();
        await within(panel()).findByTestId("ask-dev-answer");
        await userEvent.click(within(panel()).getByRole("button", { name: "Open full page" }));

        await userEvent.click(within(page()).getByRole("button", { name: "Minimize to panel" }));
        expect(nav.pushes).toEqual(["/dev", "/dashboard?f=team"]);
        expect(await screen.findByRole("complementary", { name: "Ask Dev" })).toBeInTheDocument();
        expect(within(panel()).getByTestId("ask-dev-answer")).toBeInTheDocument();
        expect(transport.calls).toHaveLength(1);

        // The next question goes on in the same conversation.
        await userEvent.type(
            within(panel()).getByRole("textbox", { name: COMPOSER_COPY.label }),
            "Why?{Enter}",
        );
        await waitFor(() => expect(transport.calls).toHaveLength(2));
        expect(transport.calls[1]!.threadId).toBe(transport.calls[0]!.threadId);
    });

    it("the panel it opens holds the right edge (CHAOS-12207)", async () => {
        resetRightDrawerForTest();
        nav.go("/dev");
        renderShell(new FakeTransport());
        expect(rightDrawerOwnerForTest()).toBeNull();
        await userEvent.click(within(page()).getByRole("button", { name: "Minimize to panel" }));
        expect(await screen.findByRole("complementary", { name: "Ask Dev" })).toBeInTheDocument();
        expect(rightDrawerOwnerForTest()).toBe("ask-dev");
    });

    it("goes to the dashboard when the page was not opened from the panel", async () => {
        const transport = new FakeTransport();
        nav.go("/dev");
        renderShell(transport);
        await userEvent.click(within(page()).getByRole("button", { name: "Minimize to panel" }));
        expect(nav.pushes).toEqual(["/dashboard"]);
        expect(await screen.findByRole("complementary", { name: "Ask Dev" })).toBeInTheDocument();
    });
});

describe("a reload loses the conversation, and says so (plan §2.5)", () => {
    it("writes a marker of this (org, principal) once a turn exists: a tag, no question", async () => {
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(transport);
        expect(window.sessionStorage.getItem(UNSAVED_CONVERSATION_KEY)).toBeNull();
        await askInPanel();
        await within(panel()).findByTestId("ask-dev-answer");
        expect(window.sessionStorage.getItem(UNSAVED_CONVERSATION_KEY)).toBe(TAG);
        expect(TAG).toMatch(/^[0-9a-f]{8}$/u);
    });

    it("shows the notice on the page and in the panel after a reload of this (org, principal)", async () => {
        window.sessionStorage.setItem(UNSAVED_CONVERSATION_KEY, TAG);
        nav.go("/dev");
        renderShell(new FakeTransport());
        expect(within(page()).getByTestId("ask-dev-not-saved")).toHaveTextContent(
            TRANSCRIPT_COPY.notSaved,
        );
    });

    it("shows no notice for another (org, principal), or with no marker", () => {
        window.sessionStorage.setItem(
            UNSAVED_CONVERSATION_KEY,
            partitionTag("org-2\u0000user-1\u0000"),
        );
        nav.go("/dev");
        const { unmount } = renderShell(new FakeTransport());
        expect(screen.queryByTestId("ask-dev-not-saved")).toBeNull();
        expect(within(page()).getByText(TRANSCRIPT_COPY.empty)).toBeInTheDocument();
        unmount();
        window.sessionStorage.clear();
        renderShell(new FakeTransport());
        expect(screen.queryByTestId("ask-dev-not-saved")).toBeNull();
    });

    it("drops the notice once a new question is asked", async () => {
        window.sessionStorage.setItem(UNSAVED_CONVERSATION_KEY, TAG);
        const transport = new FakeTransport();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        renderShell(transport);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(within(panel()).getByTestId("ask-dev-not-saved")).toBeInTheDocument();
        await userEvent.type(
            within(panel()).getByRole("textbox", { name: COMPOSER_COPY.label }),
            "Which projects are at risk?{Enter}",
        );
        await within(panel()).findByTestId("ask-dev-answer");
        expect(within(panel()).queryByTestId("ask-dev-not-saved")).toBeNull();
        // The hook itself says so too: the lost conversation is no longer the tab's state.
        expect(screen.getByTestId("not-saved-probe")).toHaveTextContent("false");
    });
});

describe("/dev is the surface: no panel, launcher or shortcut there", () => {
    it("draws no launcher on /dev, and Ctrl+J opens no panel", async () => {
        nav.go("/dev");
        renderShell(new FakeTransport());
        expect(screen.queryByRole("button", { name: "Open Ask Dev" })).toBeNull();
        await userEvent.keyboard("{Control>}j{/Control}");
        expect(screen.queryByRole("complementary", { name: "Ask Dev" })).toBeNull();
    });

    it("draws the launcher on other pages", () => {
        renderShell(new FakeTransport());
        expect(screen.getByRole("button", { name: "Open Ask Dev" })).toBeInTheDocument();
    });
});

describe("the full page without Ask Dev", () => {
    it("says Ask Dev is not available and draws no conversation", () => {
        nav.go("/dev");
        renderShell(new FakeTransport(), { ask_dev: true, agent_context_runtime: false });
        expect(within(page()).getByTestId("ask-dev-page-not-available")).toHaveTextContent(
            FULL_PAGE_COPY.notAvailable,
        );
        expect(screen.queryByTestId("ask-dev-transcript")).toBeNull();
        expect(screen.queryByRole("button", { name: "Minimize to panel" })).toBeNull();
    });

    it("draws no composer without a transport (T14 not wired), and sends nothing", () => {
        nav.go("/dev");
        renderShell(null);
        expect(within(page()).getByTestId("ask-dev-transcript")).toBeInTheDocument();
        expect(screen.queryByTestId("ask-dev-composer")).toBeNull();
    });
});
