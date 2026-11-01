import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { ShellMobileBar } from "@/components/shell/ShellMobileBar";
import { ShellTopBar } from "@/components/shell/ShellTopBar";
import { expectStaticLogo } from "@/test/staticLogo";

import { AskDevLauncher } from "./AskDevLauncher";
import { AskDevShellProvider, useAskDevShell } from "./AskDevShellContext";

const navigationMock = vi.hoisted(() => ({ pathname: "/dashboard", search: "" }));

vi.mock("next/navigation", () => ({
    usePathname: () => navigationMock.pathname,
    useSearchParams: () => new URLSearchParams(navigationMock.search),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));

const ON = { ask_dev: true, agent_context_runtime: true };

function withFeatures(features: Record<string, boolean>, ui: React.ReactNode) {
    return (
        <AdminTierProvider tier="team" features={features}>
            {ui}
        </AdminTierProvider>
    );
}

/** Every launcher in the document, hidden or not (jsdom does not apply the responsive classes). */
const launchers = () => document.querySelectorAll("[data-ask-dev-launcher]");

beforeEach(() => {
    navigationMock.pathname = "/dashboard";
    navigationMock.search = "";
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AskDevLauncher", () => {
    it("is a button named Open Ask Dev that draws the Full Chaos logo and no AI glyph", () => {
        render(withFeatures(ON, <AskDevLauncher placement="top-bar" />));

        const button = screen.getByRole("button", { name: "Open Ask Dev" });
        const image = button.querySelector("img");
        expect(image).not.toBeNull();
        expectStaticLogo(image as HTMLElement, { file: "fc-logo.svg", width: 22, height: 21 });
        // No inline icon (sparkle, diamond, ...) beside the logo.
        expect(button.querySelector("svg")).toBeNull();
    });

    it.each([
        ["ask_dev off", { ask_dev: false, agent_context_runtime: true }],
        ["agent_context_runtime off", { ask_dev: true, agent_context_runtime: false }],
        ["both missing", {}],
    ])("draws nothing with %s", (_name, features) => {
        render(withFeatures(features, <AskDevLauncher placement="top-bar" />));

        expect(launchers()).toHaveLength(0);
    });

    it.each([
        "/auth/signin",
        "/pricing",
        "/superadmin/context-fabric/validation",
        "/agent-context/context-packet",
    ])("draws nothing on the excluded route %s", (path) => {
        navigationMock.pathname = path;
        render(withFeatures(ON, <AskDevLauncher placement="top-bar" />));

        expect(launchers()).toHaveLength(0);
    });

    it("sends no request when it opens, and only flips the open flag", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        const beacon = vi.fn();
        vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
        function Probe() {
            return <output data-testid="open">{String(useAskDevShell().open)}</output>;
        }
        render(
            withFeatures(
                ON,
                <AskDevShellProvider>
                    <AskDevLauncher placement="top-bar" />
                    <Probe />
                </AskDevShellProvider>,
            ),
        );
        const button = screen.getByRole("button", { name: "Open Ask Dev" });
        expect(button).toHaveAttribute("aria-expanded", "false");

        await userEvent.click(button);

        expect(screen.getByTestId("open")).toHaveTextContent("true");
        expect(button).toHaveAttribute("aria-expanded", "true");
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(beacon).not.toHaveBeenCalled();
    });
});

describe("one launcher per bar, one visible", () => {
    it("the top bar and the mobile bar each draw exactly one", () => {
        render(
            withFeatures(
                ON,
                <>
                    <ShellMobileBar
                        open={false}
                        onToggle={vi.fn()}
                        controlRef={{ current: null }}
                    />
                    <ShellTopBar />
                </>,
            ),
        );

        const mobile = screen.getByTestId("shell-mobile-bar");
        const top = screen.getByTestId("shell-top-bar");
        expect(within(mobile).getAllByRole("button", { name: "Open Ask Dev" })).toHaveLength(1);
        expect(within(top).getAllByRole("button", { name: "Open Ask Dev" })).toHaveLength(1);
        // The two bars show at opposite breakpoints, so the launcher in each is the only visible one.
        expect(top).toHaveClass("hidden", "md:flex");
        expect(mobile).toHaveClass("md:hidden");
    });

    it("the whole shell holds exactly two launchers, one in each bar, and none elsewhere", () => {
        render(
            withFeatures(
                ON,
                <AppShell>
                    <h1>Page</h1>
                </AppShell>,
            ),
        );

        const all = Array.from(launchers());
        expect(all).toHaveLength(2);
        const homes = all.map((node) =>
            node.closest("[data-testid=shell-top-bar]")
                ? "top-bar"
                : node.closest("[data-testid=shell-mobile-bar]")
                  ? "mobile-bar"
                  : "elsewhere",
        );
        expect(homes.sort()).toEqual(["mobile-bar", "top-bar"]);
    });

    it("draws none in the shell with a flag off", () => {
        render(
            withFeatures(
                { ask_dev: true, agent_context_runtime: false },
                <AppShell>
                    <h1>Page</h1>
                </AppShell>,
            ),
        );

        expect(launchers()).toHaveLength(0);
    });
});

/** CHAOS-12422: a click before hydration has no handler, so it would be lost with no sign. */
describe("AskDevLauncher before and after hydration", () => {
    const tree = withFeatures(
        ON,
        <AskDevShellProvider>
            <AskDevLauncher placement="top-bar" />
        </AskDevShellProvider>,
    );

    it("is disabled in the server's HTML: it cannot take a click that nothing would handle", () => {
        const host = document.createElement("div");
        host.innerHTML = renderToString(tree);
        expect(host.querySelector("button")).toBeDisabled();
    });

    it("is enabled once the client has it", () => {
        render(tree);
        expect(screen.getByRole("button", { name: "Open Ask Dev" })).toBeEnabled();
    });
});
