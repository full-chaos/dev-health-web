import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    },
}));

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(""),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

type SessionState = {
    data: Session | null;
    status: "authenticated" | "unauthenticated" | "loading";
};
const auth = vi.hoisted(() => ({
    session: null as unknown as SessionState,
    /** The session read behind the ACR token store: Ask Dev must not call it on load or open. */
    getSession: vi.fn(),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => auth.session,
    getSession: auth.getSession,
}));

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { acrBrowserClientOff, acrBrowserClientOn } from "@/test/acrBrowserClient";

import { AskDevFullPage, FULL_PAGE_COPY } from "../AskDevFullPage";
import { AskDevLauncher } from "../AskDevLauncher";
import { AskDevPanel } from "../AskDevPanel";
import { AskDevShellProvider, useAskDevShell } from "../AskDevShellContext";
import { AskDevConversationProvider } from "../conversation/AskDevConversationContext";
import type { AskDevTransport } from "../conversation/transport";
import { FakeTransport } from "../conversation/__tests__/fakeTransport";
import { type AskDevAvailability, useAskDevAvailability } from "../useAskDevAvailability";

/**
 * CHAOS-12306 (c5), decision 6: Ask Dev is hidden while impersonating, because the browser holds no
 * ACR token for an impersonated session. Gated on the browser ACR client: off (prod until the T13
 * roll), every surface is exactly as before.
 */

const ON = { ask_dev: true, agent_context_runtime: true };
const OFF = { ask_dev: true, agent_context_runtime: false };

const ADMIN = { id: "admin-1", org_id: "org-1" };
const PLAIN: SessionState = {
    data: { user: ADMIN, expires: "2099-01-01" } as Session,
    status: "authenticated",
};
/** `user.id` stays the admin's; `org_id` is the target's org (here the same one). */
const IMPERSONATING: SessionState = {
    data: {
        user: { ...ADMIN, is_impersonating: true, impersonated_user_id: "user-9" },
        expires: "2099-01-01",
    } as Session,
    status: "authenticated",
};
/** The first session read of a page load: nothing is known yet. */
const LOADING: SessionState = { data: null, status: "loading" };
/** A refetch (`update()`, a focus refetch): the last session stays while it runs. */
const REFETCH: SessionState = { ...PLAIN, status: "loading" };
const REFETCH_IMPERSONATING: SessionState = { ...IMPERSONATING, status: "loading" };

beforeEach(() => {
    nav.pathname = "/dashboard";
    auth.session = PLAIN;
    auth.getSession.mockReset();
    window.sessionStorage.clear();
    // No real BroadcastChannel in these tests: the token store's channel stays off.
    vi.stubGlobal("BroadcastChannel", undefined);
});

afterEach(() => {
    acrBrowserClientOff();
    vi.unstubAllGlobals();
});

describe("useAskDevAvailability", () => {
    function availability(features: Record<string, boolean>): AskDevAvailability {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AdminTierProvider tier="team" features={features}>
                {children}
            </AdminTierProvider>
        );
        return renderHook(() => useAskDevAvailability(), { wrapper }).result.current;
    }

    const SESSIONS = {
        "signed in": PLAIN,
        impersonating: IMPERSONATING,
        "loading (no session yet)": LOADING,
        refetching: REFETCH,
        "refetching, impersonating": REFETCH_IMPERSONATING,
    } as const;

    const MATRIX: [string, boolean, keyof typeof SESSIONS, AskDevAvailability][] = [];
    for (const name of Object.keys(SESSIONS) as (keyof typeof SESSIONS)[]) {
        // Entitlements off: "off" whatever the client and the session (the rule before c5).
        MATRIX.push(["off", true, name, "off"], ["off", false, name, "off"]);
        // Client off (prod): "on" whatever the session, as before.
        MATRIX.push(["on", false, name, "on"]);
    }
    MATRIX.push(
        ["on", true, "signed in", "on"],
        ["on", true, "impersonating", "impersonating"],
        // Codex r2 on #1680: a normal user's first session read must not hide Ask Dev.
        ["on", true, "loading (no session yet)", "on"],
        ["on", true, "refetching", "on"],
        ["on", true, "refetching, impersonating", "impersonating"],
    );

    it.each(MATRIX)(
        "entitlements %s, client on: %s, session %s → %s",
        (features, client, session, expected) => {
            if (client) acrBrowserClientOn();
            auth.session = SESSIONS[session];
            expect(availability(features === "on" ? ON : OFF)).toBe(expected);
        },
    );
});

/** The open state of the shell, and a way to ask for it that is not the launcher. */
function ShellProbe() {
    const { open, setOpen } = useAskDevShell();
    return (
        <>
            <output data-testid="ask-dev-open">{String(open)}</output>
            <button type="button" onClick={() => setOpen(true)}>
                test-open
            </button>
        </>
    );
}

/** The five surfaces in one shell: launcher, palette, shell state, panel and the full page. */
function renderSurfaces(
    transport: AskDevTransport | null | undefined = new FakeTransport(),
    features: Record<string, boolean> = ON,
) {
    return render(
        <AdminTierProvider tier="team" features={features}>
            <AskDevShellProvider>
                <AskDevConversationProvider transport={transport}>
                    <AskDevLauncher placement="top-bar" />
                    <CommandPalette />
                    <ShellProbe />
                    {nav.pathname === "/dev" ? <AskDevFullPage /> : <AskDevPanel />}
                </AskDevConversationProvider>
            </AskDevShellProvider>
        </AdminTierProvider>,
    );
}

function press(init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    act(() => {
        document.dispatchEvent(event);
    });
    return event;
}

const launcher = () => screen.queryByRole("button", { name: "Open Ask Dev" });
const open = () => screen.getByTestId("ask-dev-open").textContent;

describe.each([
    ["the client on and impersonating: hidden", true, IMPERSONATING, false],
    ["the client on and the session still loading: shown (codex r2 on #1680)", true, LOADING, true],
    ["the client off and impersonating: shown, as before", false, IMPERSONATING, true],
    ["the client on and not impersonating: shown", true, PLAIN, true],
])("the panel surfaces with %s", (_, client, session, shown) => {
    beforeEach(() => {
        if (client) acrBrowserClientOn();
        auth.session = session;
    });

    it("the launcher", () => {
        renderSurfaces();
        expect(launcher() !== null).toBe(shown);
    });

    it("the panel and the shell's open state", async () => {
        renderSurfaces();
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        expect(open()).toBe(String(shown));
        expect(screen.queryByTestId("ask-dev-panel") !== null).toBe(shown);
    });

    it("the shortcut (the shell's eligible gate)", () => {
        renderSurfaces();
        expect(press({ key: "j", ctrlKey: true }).defaultPrevented).toBe(shown);
        expect(open()).toBe(String(shown));
    });

    it("the palette entry", () => {
        renderSurfaces();
        press({ key: "k", metaKey: true });
        const entry = within(screen.getByTestId("command-palette")).queryByRole("option", {
            name: /Open the Ask Dev panel/,
        });
        expect(entry !== null).toBe(shown);
    });
});

describe("the full page /dev (CHAOS-12306)", () => {
    beforeEach(() => {
        nav.pathname = "/dev";
    });

    const page = () => screen.getByTestId("ask-dev-page");

    it("with the client on and impersonating: a notice, and no conversation, history or composer", () => {
        acrBrowserClientOn();
        auth.session = IMPERSONATING;
        renderSurfaces();
        const notice = within(page()).getByTestId("ask-dev-page-impersonating");
        expect(
            within(notice).getByRole("heading", {
                name: "Ask Dev is not available while impersonating",
            }),
        ).toBeVisible();
        expect(notice).toHaveTextContent("Stop impersonating to use Ask Dev.");
        expect(screen.queryByTestId("ask-dev-page-conversation")).toBeNull();
        // Ask-dev's render draws its conversation, its history toggle and its transcript log.
        expect(screen.queryByRole("region", { name: "Ask Dev conversation" })).toBeNull();
        expect(screen.queryByTestId("ask-dev-history-toggle")).toBeNull();
        expect(screen.queryByRole("log", { name: "Conversation" })).toBeNull();
        expect(screen.queryByRole("textbox", { name: "Ask a question" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Minimize to panel" })).toBeNull();
        expect(screen.queryByTestId("ask-dev-page-not-available")).toBeNull();
    });

    it("with the client off and impersonating: the conversation, as before", () => {
        auth.session = IMPERSONATING;
        renderSurfaces();
        expect(within(page()).getByTestId("ask-dev-page-conversation")).toBeInTheDocument();
        expect(
            within(page()).getByRole("region", { name: "Ask Dev conversation" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Ask a question" })).toBeInTheDocument();
        expect(screen.queryByTestId("ask-dev-page-impersonating")).toBeNull();
    });

    it("with the client on and no session yet: the conversation, as before (codex r2 on #1680)", () => {
        acrBrowserClientOn();
        auth.session = LOADING;
        renderSurfaces();
        expect(within(page()).getByTestId("ask-dev-page-conversation")).toBeInTheDocument();
        expect(screen.queryByTestId("ask-dev-page-impersonating")).toBeNull();
        expect(screen.queryByTestId("ask-dev-page-not-available")).toBeNull();
    });

    it("without the entitlements says what it said before, whatever the session", () => {
        acrBrowserClientOn();
        auth.session = IMPERSONATING;
        renderSurfaces(new FakeTransport(), OFF);
        expect(within(page()).getByTestId("ask-dev-page-not-available")).toHaveTextContent(
            FULL_PAGE_COPY.notAvailable,
        );
        expect(screen.queryByTestId("ask-dev-page-impersonating")).toBeNull();
    });
});

// P1-6: nothing here sends a request on page load or panel open. The provider takes the real
// browser ACR transport (the client is on), as in the product.
describe("no request on page load or panel open (P1-6, CHAOS-12306)", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        acrBrowserClientOn();
    });

    it.each([
        ["not impersonating", PLAIN],
        ["impersonating", IMPERSONATING],
    ])("with the client on, %s: a page load and a panel open", async (_, session) => {
        auth.session = session;
        renderSurfaces(undefined);
        await userEvent.click(screen.getByRole("button", { name: "test-open" }));
        await act(async () => {});
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(auth.getSession).not.toHaveBeenCalled();
    });

    it("with the client on and impersonating: a load of /dev", async () => {
        auth.session = IMPERSONATING;
        nav.pathname = "/dev";
        renderSurfaces(undefined);
        await act(async () => {});
        expect(screen.getByTestId("ask-dev-page-impersonating")).toBeInTheDocument();
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(auth.getSession).not.toHaveBeenCalled();
    });
});
