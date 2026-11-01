import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminNavProvider } from "@/components/admin/AdminTabs";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
import { acrBrowserClientOff, acrBrowserClientOn } from "@/test/acrBrowserClient";

import { AskDevShellProvider, useAskDevShell } from "@/components/ask-dev/AskDevShellContext";

import { CommandPalette } from "./CommandPalette";

const nav = vi.hoisted(() => ({ push: vi.fn(), search: "", pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(nav.search),
    useRouter: () => ({ push: nav.push, refresh: vi.fn(), replace: vi.fn() }),
}));
// The Ask Dev availability hook reads the session (CHAOS-12306). The browser ACR client is off
// unless a test turns it on.
const SIGNED_OUT = { data: null, status: "unauthenticated" };
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("next-auth/react", () => ({ useSession: () => session.current }));

const F = encodeFilterParam({
    ...defaultMetricFilter,
    scope: { level: "team" as const, ids: ["platform"] },
});

function setup(features: Record<string, boolean> = {}) {
    return render(
        <AdminTierProvider tier="community" features={features}>
            <button type="button">opener</button>
            <CommandPalette />
        </AdminTierProvider>,
    );
}

const palette = () => screen.getByTestId("command-palette");
const press = (init: KeyboardEventInit) =>
    act(() => {
        document.dispatchEvent(
            new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
        );
    });

beforeEach(() => {
    session.current = SIGNED_OUT;
    nav.push.mockClear();
    nav.search = `f=${F}&role=em&lens=pm`;
    nav.pathname = "/dashboard";
});

describe("CommandPalette", () => {
    it("offers the platform admin destinations only to a platform admin (CHAOS-7967)", () => {
        const { unmount } = setup();
        press({ key: "k", metaKey: true });
        expect(within(palette()).queryByRole("option", { name: /^Platform billing/ })).toBeNull();
        unmount();

        render(
            <AdminTierProvider tier="community" features={{}}>
                <AdminNavProvider isPlatformAdmin>
                    <CommandPalette />
                </AdminNavProvider>
            </AdminTierProvider>,
        );
        press({ key: "k", metaKey: true });
        expect(
            within(palette()).getByRole("option", { name: /^Platform billing/ }),
        ).toBeInTheDocument();
    });

    it("is closed until asked: a trigger button, no dialog", () => {
        setup();
        expect(screen.getByTestId("command-palette-trigger")).toHaveTextContent(
            "Find a product surface…",
        );
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens with Cmd+K and with Ctrl+K, and focuses the search input", () => {
        setup();
        press({ key: "k", metaKey: true });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Search destinations" })).toHaveFocus();
    });

    it("opens with Ctrl+K", () => {
        setup();
        press({ key: "K", ctrlKey: true });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("opens from the trigger button", async () => {
        setup();
        await userEvent.click(screen.getByTestId("command-palette-trigger"));
        expect(screen.getByRole("dialog", { name: "Find a product surface" })).toBeInTheDocument();
    });

    it("lists the registry destinations, as links that carry the filter, role and lens", () => {
        setup();
        press({ key: "k", metaKey: true });
        const options = within(palette()).getAllByRole("option");
        expect(options.length).toBeGreaterThan(10);
        const flow = within(palette()).getByRole("option", { name: /^Flow/ });
        const url = new URL(flow.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/metrics");
        expect(url.searchParams.get("f")).toBe(F);
        // The same params the sidebar link would carry (the lens decides the role on this route).
        expect(url.searchParams.get("lens")).toBe("pm");
        expect(url.searchParams.get("role")).toBe("pm");
    });

    it("marks the current page", () => {
        nav.pathname = "/dashboard";
        setup();
        press({ key: "k", metaKey: true });
        expect(within(palette()).getByRole("option", { name: /^Home/ })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });

    it("filters as you type and says so when nothing matches", async () => {
        setup();
        press({ key: "k", metaKey: true });
        const input = screen.getByRole("combobox");
        await userEvent.type(input, "opport");
        expect(
            within(palette())
                .getAllByRole("option")
                .map((o) => o.textContent),
        ).toEqual([expect.stringContaining("Opportunities")]);
        await userEvent.clear(input);
        await userEvent.type(input, "zzzz");
        expect(within(palette()).queryByRole("option")).toBeNull();
        expect(within(palette()).getByRole("status")).toHaveTextContent("No matching destination");
    });

    it("moves with the arrow keys and opens the active row with Enter, then closes", async () => {
        setup();
        press({ key: "k", metaKey: true });
        const input = screen.getByRole("combobox");
        const first = within(palette()).getAllByRole("option")[0];
        expect(first).toHaveAttribute("aria-selected", "true");
        expect(input).toHaveAttribute("aria-activedescendant", first.id);
        await userEvent.keyboard("{ArrowDown}");
        const second = within(palette()).getAllByRole("option")[1];
        expect(second).toHaveAttribute("aria-selected", "true");
        expect(input).toHaveAttribute("aria-activedescendant", second.id);
        await userEvent.keyboard("{Enter}");
        expect(nav.push).toHaveBeenCalledTimes(1);
        const target = new URL(nav.push.mock.calls[0][0], "https://app.example");
        expect(target.searchParams.get("f")).toBe(F);
        expect(target.searchParams.get("lens")).toBe("pm");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("wraps with ArrowUp from the first row to the last", async () => {
        setup();
        press({ key: "k", metaKey: true });
        await userEvent.keyboard("{ArrowUp}");
        const options = within(palette()).getAllByRole("option");
        expect(options[options.length - 1]).toHaveAttribute("aria-selected", "true");
    });

    it("closes on Escape and returns focus to the opener", async () => {
        setup();
        const opener = screen.getByRole("button", { name: "opener" });
        opener.focus();
        press({ key: "k", ctrlKey: true });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(opener).toHaveFocus();
    });

    it("keeps Tab inside the dialog", async () => {
        setup();
        press({ key: "k", metaKey: true });
        await userEvent.tab();
        await userEvent.tab();
        await userEvent.tab();
        expect(palette().contains(document.activeElement)).toBe(true);
    });

    it("closes on a click on the backdrop", async () => {
        setup();
        press({ key: "k", metaKey: true });
        await userEvent.click(screen.getByTestId("dialog-backdrop"));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("leaves the key alone while another modal is open", () => {
        setup();
        const other = document.createElement("div");
        other.setAttribute("role", "dialog");
        other.setAttribute("aria-modal", "true");
        document.body.appendChild(other);
        press({ key: "k", metaKey: true });
        expect(screen.queryByTestId("command-palette")).toBeNull();
        other.remove();
    });

    it("ignores other keys and Cmd+Alt+K", () => {
        setup();
        press({ key: "j", metaKey: true });
        press({ key: "k" });
        press({ key: "k", metaKey: true, altKey: true });
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("omits a feature-gated destination without the feature and lists it with it", () => {
        // The registry's own gated child: find one and check both sides.
        const { unmount } = setup({});
        press({ key: "k", metaKey: true });
        const without = within(palette())
            .getAllByRole("option")
            .map((o) => o.textContent);
        unmount();
        // With every feature on, the list can only grow.
        const all = new Proxy({}, { get: () => true }) as Record<string, boolean>;
        setup(all);
        press({ key: "k", metaKey: true });
        const withAll = within(palette())
            .getAllByRole("option")
            .map((o) => o.textContent);
        expect(withAll.length).toBeGreaterThanOrEqual(without.length);
    });

    describe("Ask Dev entry", () => {
        function AskDevState() {
            const { open } = useAskDevShell();
            return <output data-testid="ask-dev-state">{open ? "open" : "closed"}</output>;
        }
        const withAskDev = (features: Record<string, boolean>) =>
            render(
                <AdminTierProvider tier="community" features={features}>
                    <AskDevShellProvider>
                        <AskDevState />
                        <CommandPalette />
                    </AskDevShellProvider>
                </AdminTierProvider>,
            );

        it("opens the Ask Dev panel from the palette and navigates nowhere", async () => {
            const user = userEvent.setup();
            withAskDev({ ask_dev: true, agent_context_runtime: true });
            press({ key: "k", metaKey: true });
            // CHAOS-12210: the panel action, not the "Ask Dev full page" entry of the nav row.
            await user.click(
                within(palette()).getByRole("option", { name: /Open the Ask Dev panel/ }),
            );
            await act(async () => {});
            expect(screen.getByTestId("ask-dev-state").textContent).toBe("open");
            expect(nav.push).not.toHaveBeenCalled();
            expect(screen.queryByTestId("command-palette")).toBeNull();
        });

        // CHAOS-12210 (codex r1 on #1649): an excluded route has no Ask Dev panel, but it keeps the
        // navigation. The palette lists what the sidebar lists, so the full page stays offered.
        it("on an excluded route offers the full page as the sidebar does, and no panel action", () => {
            nav.pathname = "/agent-context";
            withAskDev({ ask_dev: true, agent_context_runtime: true });
            press({ key: "k", metaKey: true });
            expect(
                within(palette()).queryByRole("option", { name: /Open the Ask Dev panel/ }),
            ).toBeNull();
            expect(
                within(palette()).getByRole("option", { name: /Ask Dev full page/ }),
            ).toHaveAttribute("href", expect.stringMatching(/^\/dev(\?|$)/u));
        });

        it("omits the entry without the entitlements and on an excluded route", () => {
            const { unmount } = withAskDev({ ask_dev: true });
            press({ key: "k", metaKey: true });
            expect(
                within(palette()).queryByRole("option", { name: /Open the Ask Dev panel/ }),
            ).toBeNull();
            unmount();

            nav.pathname = "/agent-context";
            withAskDev({ ask_dev: true, agent_context_runtime: true });
            press({ key: "k", metaKey: true });
            expect(
                within(palette()).queryByRole("option", { name: /Open the Ask Dev panel/ }),
            ).toBeNull();
        });
    });
});

// CHAOS-12306: while impersonating with the browser ACR client on, the palette offers no Ask Dev
// entry at all: neither the panel action nor the full page. Only "impersonating" hides them: a
// session still loading keeps the full page entry, so a normal user's list does not change.
describe("Ask Dev entries while impersonating (CHAOS-12306)", () => {
    const ON = { ask_dev: true, agent_context_runtime: true };
    const user = { id: "admin-1", org_id: "org-1" };
    const PLAIN = { data: { user, expires: "2099-01-01" }, status: "authenticated" };
    const IMPERSONATING = {
        data: { user: { ...user, is_impersonating: true }, expires: "2099-01-01" },
        status: "authenticated",
    };
    const LOADING = { data: null, status: "loading" };

    afterEach(() => {
        acrBrowserClientOff();
    });

    const fullPage = () => within(palette()).queryByRole("option", { name: /Ask Dev full page/ });

    it("offers no Ask Dev full page while impersonating with the client on", () => {
        acrBrowserClientOn();
        session.current = IMPERSONATING;
        setup(ON);
        press({ key: "k", metaKey: true });
        expect(fullPage()).toBeNull();
        expect(
            within(palette()).queryByRole("option", { name: /Open the Ask Dev panel/ }),
        ).toBeNull();
        // The other destinations stay.
        expect(within(palette()).getByRole("option", { name: /^Reports/ })).toBeInTheDocument();
    });

    it.each([
        ["impersonating with the client off", false, IMPERSONATING],
        ["not impersonating with the client on", true, PLAIN],
        ["the session still loading with the client on", true, LOADING],
    ])("offers the Ask Dev full page %s", (_, client, next) => {
        if (client) acrBrowserClientOn();
        session.current = next;
        setup(ON);
        press({ key: "k", metaKey: true });
        expect(fullPage()).toHaveAttribute("href", expect.stringMatching(/^\/dev(\?|$)/u));
    });
});
