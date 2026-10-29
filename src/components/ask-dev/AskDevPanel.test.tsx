import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import {
    EvidenceDrawerProvider,
    useEvidenceDrawer,
} from "@/components/evidence/EvidenceDrawerProvider";
import { AppShell } from "@/components/shell/AppShell";
import { EVIDENCE_DRAWER_TITLE } from "@/components/evidence/EvidenceDrawerShell";
import { Drawer } from "@/components/ui/Drawer";
import {
    claimRightDrawer,
    resetRightDrawerForTest,
    rightDrawerOwnerForTest,
} from "@/lib/shell/rightDrawer";

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

/** `matches` answers the `(min-width: 768px)` query: true is a desktop viewport. */
function setViewport(desktop: boolean): void {
    vi.stubGlobal(
        "matchMedia",
        vi.fn().mockImplementation((query: string) => ({
            matches: desktop,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
            onchange: null,
        })),
    );
    // jsdom lays nothing out. The bar of the breakpoint is the one that has a box.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (
        this: HTMLElement,
    ) {
        const visibleBar = desktop ? "top-bar" : "mobile-bar";
        const own = this.getAttribute("data-testid") ?? "";
        return (own === `ask-dev-launcher-${visibleBar}` || !own.startsWith("ask-dev-launcher-")
            ? [{}]
            : []) as unknown as DOMRectList;
    });
}

function EvidenceOpener() {
    const evidence = useEvidenceDrawer();
    return (
        <button
            type="button"
            onClick={() => evidence.open({ title: "Evidence", content: <p>Evidence body</p> })}
        >
            Open evidence
        </button>
    );
}

function shellTree(features: Record<string, boolean> = ON) {
    return (
        <AdminTierProvider tier="team" features={features}>
            <EvidenceDrawerProvider>
                <AppShell>
                    <h1>Page</h1>
                    <EvidenceOpener />
                </AppShell>
            </EvidenceDrawerProvider>
        </AdminTierProvider>
    );
}

function renderShell() {
    return render(shellTree());
}

const visibleLauncherName = { name: "Open Ask Dev" } as const;
const launcher = () => screen.getByTestId("ask-dev-launcher-top-bar");
const mobileLauncher = () => screen.getByTestId("ask-dev-launcher-mobile-bar");

async function axeViolations(node: Element): Promise<string[]> {
    const result = await axe.run(node, {
        // jsdom has no layout or paint: contrast and region checks cannot be measured.
        rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

beforeEach(() => {
    navigationMock.pathname = "/dashboard";
    resetRightDrawerForTest();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("Ask Dev panel — desktop (non-modal right region)", () => {
    beforeEach(() => setViewport(true));

    it("is closed until the launcher opens it, and opening sends no request", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        renderShell();
        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();

        await userEvent.click(launcher());

        const panel = screen.getByRole("complementary", { name: "Ask Dev" });
        expect(panel).toBe(screen.getByTestId("ask-dev-panel"));
        // The shell makes its own reads (the organization card). Ask Dev must make none.
        const urls = fetchSpy.mock.calls.map(([input]) => String(input));
        expect(urls.filter((url) => /ask-dev|context-fabric|\/api\/v1\/dev/u.test(url))).toEqual(
            [],
        );
    });

    it("is not modal: no aria-modal, no backdrop, no scroll lock", async () => {
        renderShell();

        await userEvent.click(launcher());

        const panel = screen.getByTestId("ask-dev-panel");
        expect(panel).not.toHaveAttribute("aria-modal");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByTestId("drawer-backdrop")).toBeNull();
        expect(document.body.style.overflow).not.toBe("hidden");
    });

    it("moves focus into the panel on open, and the launcher points at it", async () => {
        renderShell();

        await userEvent.click(launcher());

        const panel = screen.getByTestId("ask-dev-panel");
        expect(panel).toHaveFocus();
        expect(launcher()).toHaveAttribute("aria-expanded", "true");
        expect(launcher()).toHaveAttribute("aria-controls", panel.id);
    });

    it("closes with Escape and returns focus to the visible launcher", async () => {
        renderShell();
        await userEvent.click(launcher());

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
        await waitFor(() => expect(launcher()).toHaveFocus());
        expect(mobileLauncher()).not.toHaveFocus();
        expect(launcher()).toHaveAttribute("aria-expanded", "false");
    });

    it("closes with the Close button and returns focus to the launcher", async () => {
        renderShell();
        await userEvent.click(launcher());

        await userEvent.click(screen.getByRole("button", { name: "Close" }));

        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
        await waitFor(() => expect(launcher()).toHaveFocus());
    });

    it("leaves Escape to a modal drawer that is on top", async () => {
        renderShell();
        await userEvent.click(launcher());
        const dialog = document.createElement("div");
        dialog.setAttribute("aria-modal", "true");
        document.body.appendChild(dialog);

        await userEvent.keyboard("{Escape}");

        expect(screen.getByTestId("ask-dev-panel")).toBeInTheDocument();
        dialog.remove();
    });

    it("announces the transcript as a polite log", async () => {
        renderShell();
        await userEvent.click(launcher());

        const log = within(screen.getByTestId("ask-dev-panel")).getByRole("log", {
            name: "Conversation",
        });
        expect(log).toHaveAttribute("aria-live", "polite");
    });

    it("has no axe violations", async () => {
        renderShell();
        await userEvent.click(launcher());

        expect(await axeViolations(screen.getByTestId("ask-dev-panel"))).toEqual([]);
    });
});

describe("Ask Dev panel — mobile (modal sheet)", () => {
    beforeEach(() => setViewport(false));

    it("opens a modal dialog and focuses inside it", async () => {
        renderShell();

        await userEvent.click(mobileLauncher());

        const sheet = screen.getByRole("dialog", { name: "Ask Dev" });
        expect(sheet).toHaveAttribute("aria-modal", "true");
        expect(sheet).toContainElement(document.activeElement as HTMLElement);
        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
    });

    it("keeps Tab inside the sheet", async () => {
        renderShell();
        await userEvent.click(mobileLauncher());
        const sheet = screen.getByRole("dialog", { name: "Ask Dev" });

        await userEvent.tab();
        await userEvent.tab();
        await userEvent.tab();

        expect(sheet).toContainElement(document.activeElement as HTMLElement);
    });

    it("closes with Escape and returns focus to the mobile launcher", async () => {
        renderShell();
        await userEvent.click(mobileLauncher());

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog", { name: "Ask Dev" })).toBeNull();
        await waitFor(() => expect(mobileLauncher()).toHaveFocus());
        expect(launcher()).not.toHaveFocus();
    });

    it("closes with the backdrop", async () => {
        renderShell();
        await userEvent.click(mobileLauncher());

        await userEvent.click(screen.getByTestId("drawer-backdrop"));

        expect(screen.queryByRole("dialog", { name: "Ask Dev" })).toBeNull();
    });

    it("has no axe violations", async () => {
        renderShell();
        await userEvent.click(mobileLauncher());

        expect(await axeViolations(screen.getByRole("dialog", { name: "Ask Dev" }))).toEqual([]);
    });
});

describe("one right drawer at a time", () => {
    beforeEach(() => setViewport(true));

    it("opening the evidence drawer closes Ask Dev", async () => {
        renderShell();
        await userEvent.click(launcher());
        expect(screen.getByTestId("ask-dev-panel")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Open evidence" }));

        expect(screen.getByRole("dialog", { name: EVIDENCE_DRAWER_TITLE })).toBeInTheDocument();
        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
        expect(launcher()).toHaveAttribute("aria-expanded", "false");
    });

    it("opening Ask Dev closes the evidence drawer", async () => {
        renderShell();
        await userEvent.click(screen.getByRole("button", { name: "Open evidence" }));
        expect(screen.getByRole("dialog", { name: EVIDENCE_DRAWER_TITLE })).toBeInTheDocument();
        // The modal drawer hides the page from the accessibility tree; reach the launcher directly.
        await act(async () => launcher().click());

        expect(screen.queryByRole("dialog", { name: EVIDENCE_DRAWER_TITLE })).toBeNull();
        expect(screen.getByTestId("ask-dev-panel")).toBeInTheDocument();
    });

    it("closes Ask Dev when the filter drawer claims the edge", async () => {
        renderShell();
        await userEvent.click(launcher());

        act(() => claimRightDrawer("filters", vi.fn()));

        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
    });
});

describe("the surface is off", () => {
    beforeEach(() => setViewport(true));

    it("draws no panel with an entitlement off, even if the flag were set", () => {
        render(
            <AdminTierProvider
                tier="team"
                features={{ ask_dev: true, agent_context_runtime: false }}
            >
                <EvidenceDrawerProvider>
                    <AppShell>
                        <h1>Page</h1>
                    </AppShell>
                </EvidenceDrawerProvider>
            </AdminTierProvider>,
        );

        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
        expect(screen.queryByRole("button", visibleLauncherName)).toBeNull();
    });
});

function DrawerOpener() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Open shared drawer
            </button>
            <Drawer open={open} onCloseAction={() => setOpen(false)} title="Shared drawer">
                <p>Body</p>
            </Drawer>
        </>
    );
}

describe("every shared right drawer takes the edge", () => {
    beforeEach(() => setViewport(true));

    it("opening a `Drawer` (for example the AI evidence drawer) closes Ask Dev", async () => {
        render(
            <AdminTierProvider tier="team" features={ON}>
                <EvidenceDrawerProvider>
                    <AppShell>
                        <DrawerOpener />
                    </AppShell>
                </EvidenceDrawerProvider>
            </AdminTierProvider>,
        );
        await userEvent.click(launcher());
        expect(screen.getByTestId("ask-dev-panel")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Open shared drawer" }));

        expect(screen.getByRole("dialog", { name: "Shared drawer" })).toBeInTheDocument();
        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
    });

    it("a closed `Drawer` gives the edge back", async () => {
        render(
            <AdminTierProvider tier="team" features={ON}>
                <EvidenceDrawerProvider>
                    <AppShell>
                        <DrawerOpener />
                    </AppShell>
                </EvidenceDrawerProvider>
            </AdminTierProvider>,
        );
        await userEvent.click(screen.getByRole("button", { name: "Open shared drawer" }));
        expect(rightDrawerOwnerForTest()).toBe("drawer");

        await userEvent.keyboard("{Escape}");

        expect(rightDrawerOwnerForTest()).toBeNull();
    });
});

describe("Ask Dev state follows where it is allowed", () => {
    beforeEach(() => setViewport(true));

    it("stays closed after a visit to an excluded route", async () => {
        const { rerender } = renderShell();
        await userEvent.click(launcher());
        expect(screen.getByTestId("ask-dev-panel")).toBeInTheDocument();

        navigationMock.pathname = "/superadmin/context-fabric/validation";
        rerender(shellTree());
        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();

        navigationMock.pathname = "/dashboard";
        rerender(shellTree());
        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
        expect(launcher()).toHaveAttribute("aria-expanded", "false");
    });

    it("closes for good when an entitlement turns off, and does not reopen when it returns", async () => {
        const { rerender } = renderShell();
        await userEvent.click(launcher());
        expect(screen.getByTestId("ask-dev-panel")).toBeInTheDocument();

        rerender(shellTree({ ask_dev: false, agent_context_runtime: true }));
        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();

        rerender(shellTree(ON));
        expect(screen.queryByTestId("ask-dev-panel")).toBeNull();
        expect(launcher()).toHaveAttribute("aria-expanded", "false");
    });

    it("drops its claim when the shell unmounts", async () => {
        const { unmount } = renderShell();
        await userEvent.click(launcher());
        expect(rightDrawerOwnerForTest()).toBe("ask-dev");

        unmount();

        expect(rightDrawerOwnerForTest()).toBeNull();
    });
});
