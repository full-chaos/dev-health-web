import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { AppShell } from "./AppShell";

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

/** A page that is not migrated: it renders its own navigation and `<main>`. */
function LegacyPage() {
    return (
        <div>
            <PrimaryNav filters={defaultMetricFilter} active="home" />
            <main>
                <h1>Legacy page</h1>
            </main>
        </div>
    );
}

/** A migrated page: content only. */
function ShellPage() {
    return <h1>Shell page</h1>;
}

function renderFrame(page: React.ReactNode) {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell banners={<div data-testid="banners">Banner</div>}>{page}</AppShell>
        </AdminTierProvider>,
    );
}

/**
 * Structure of a subtree without styles: tag, the attributes that carry meaning
 * (names, targets, state), and text. Class names and image internals are left
 * out, so a restyle does not change it and a structural change does.
 */
const STRUCTURAL_ATTRIBUTES = [
    "aria-label",
    "aria-controls",
    "aria-expanded",
    "href",
    "alt",
    "type",
    "id",
];

function structureOf(node: Element, depth = 0): string[] {
    const attributes = STRUCTURAL_ATTRIBUTES.filter((name) => node.hasAttribute(name))
        .map((name) => `${name}="${node.getAttribute(name)}"`)
        .join(" ");
    const ownText = Array.from(node.childNodes)
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    const line = [
        `${"  ".repeat(depth)}${node.tagName.toLowerCase()}`,
        attributes,
        ownText ? `"${ownText}"` : "",
    ]
        .filter(Boolean)
        .join(" ");
    return [line, ...Array.from(node.children).flatMap((child) => structureOf(child, depth + 1))];
}

beforeEach(() => {
    navigationMock.pathname = "/dashboard";
    navigationMock.search = "";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("AppShell — a route in the registry gets the shared shell", () => {
    it("has exactly one main landmark on /dashboard, and the page is inside it", () => {
        renderFrame(<ShellPage />);

        const mains = screen.getAllByRole("main");
        expect(mains).toHaveLength(1);
        expect(mains[0]).toHaveAttribute("id", "main-content");
        expect(mains[0]).toContainElement(screen.getByRole("heading", { name: "Shell page" }));
    });

    it("has one sidebar, one primary navigation and the top bar", () => {
        renderFrame(<ShellPage />);

        expect(document.querySelectorAll("aside")).toHaveLength(1);
        expect(screen.getAllByRole("navigation", { name: "Primary areas" })).toHaveLength(1);
        expect(screen.getByTestId("shell-top-bar")).toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    });

    it("does not render a second navigation when the page still renders PrimaryNav", () => {
        renderFrame(<LegacyPage />);

        expect(document.querySelectorAll("aside")).toHaveLength(1);
        expect(screen.getAllByRole("navigation", { name: "Primary areas" })).toHaveLength(1);
        expect(screen.getAllByRole("button", { name: "Show navigation" })).toHaveLength(1);
        expect(screen.getAllByRole("link", { name: /^Cockpit$/ })).toHaveLength(1);
        expect(document.querySelectorAll("#primary-navigation-panel")).toHaveLength(1);
        // The page content is still there.
        expect(screen.getByRole("heading", { name: "Legacy page" })).toBeInTheDocument();
    });

    it("puts the skip link first in the focus order, and its target exists", async () => {
        const user = userEvent.setup();
        renderFrame(<ShellPage />);

        await user.tab();

        const skipLink = screen.getByRole("link", { name: "Skip to main content" });
        expect(skipLink).toHaveFocus();
        expect(skipLink).toHaveAttribute("href", "#main-content");
        const target = document.getElementById("main-content");
        expect(target?.tagName).toBe("MAIN");
        expect(target).toHaveAttribute("tabindex", "-1");
    });

    it("keeps the banners above the shell chrome", () => {
        renderFrame(<ShellPage />);

        const banners = screen.getByTestId("banners");
        const shell = screen.getByTestId("app-shell");
        expect(
            banners.compareDocumentPosition(shell) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("keeps the account bar for the size below md and the account block in the sidebar, with different menu ids", () => {
        renderFrame(<ShellPage />);

        const accountBar = screen.getByRole("navigation", { name: "Account" });
        expect(accountBar.closest("div.md\\:hidden")).not.toBeNull();
        const controls = screen.getAllByRole("button", { name: "Account options" });
        expect(controls.map((control) => control.getAttribute("aria-controls")).sort()).toEqual([
            "account-options",
            "account-options-sidebar",
        ]);
    });
});

describe("AppShell — the status chip states what the organization card knows", () => {
    function organizationsResponse(active: { has_data: boolean; last_metrics_at?: string | null }) {
        return {
            ok: true,
            json: async () => ({
                active_org_id: "org-1",
                organizations: [
                    { id: "org-1", slug: "test", name: "Test", role: "owner", ...active },
                    { id: "org-2", slug: "other", name: "Other", role: "member", has_data: false },
                ],
            }),
        };
    }

    function chip() {
        return screen.getByTestId("shell-status-chip");
    }

    it("asks for the organizations once: the card and the chip share one request", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                organizationsResponse({ has_data: true, last_metrics_at: "2026-09-30T10:00:00Z" }),
            );
        vi.stubGlobal("fetch", fetchMock);
        renderFrame(<ShellPage />);

        await waitFor(() => expect(chip()).toHaveAttribute("data-status", "synced"));
        expect(chip()).toHaveTextContent(/^Data through /);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("combobox", { name: /organization/i })).toBeInTheDocument();
    });

    it("shows 'No data yet' only when the active organization has no data", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(organizationsResponse({ has_data: false })),
        );
        renderFrame(<ShellPage />);

        await waitFor(() => expect(chip()).toHaveAttribute("data-status", "empty"));
        expect(chip()).toHaveTextContent("No data yet");
    });

    it.each([
        ["the request is refused", () => vi.fn().mockResolvedValue({ ok: false })],
        ["the request throws", () => vi.fn().mockRejectedValue(new Error("network"))],
        [
            "the active organization is not in the list",
            () =>
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: async () => ({
                        active_org_id: "org-9",
                        organizations: [
                            {
                                id: "org-2",
                                slug: "other",
                                name: "Other",
                                role: "member",
                                has_data: true,
                                last_metrics_at: "2026-09-30T10:00:00Z",
                            },
                        ],
                    }),
                }),
        ],
    ])("shows the neutral 'Status unavailable' state when %s", async (_label, makeFetch) => {
        vi.stubGlobal("fetch", makeFetch());
        renderFrame(<ShellPage />);

        await waitFor(() => expect(chip()).toHaveAttribute("data-status", "unknown"));
        expect(chip()).toHaveTextContent("Status unavailable");
        expect(chip()).not.toHaveTextContent("Data through");
        expect(chip()).not.toHaveTextContent("No data yet");
    });

    it("is neutral while the request is open", () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise(() => {})),
        );
        renderFrame(<ShellPage />);

        expect(chip()).toHaveAttribute("data-status", "loading");
        expect(chip()).not.toHaveTextContent("Data through");
    });
});

describe("AppShell — a route outside the registry keeps today's chrome", () => {
    beforeEach(() => {
        navigationMock.pathname = "/diagnose";
    });

    it("renders no shell part: no sidebar, no top bar, no skip link, no shell main", () => {
        renderFrame(<LegacyPage />);

        expect(screen.queryByTestId("app-shell")).toBeNull();
        expect(screen.queryByTestId("shell-sidebar")).toBeNull();
        expect(screen.queryByTestId("shell-top-bar")).toBeNull();
        expect(screen.queryByRole("link", { name: "Skip to main content" })).toBeNull();
        expect(document.getElementById("main-content")).toBeNull();
    });

    it("lets the page render its own navigation and its own main", () => {
        renderFrame(<LegacyPage />);

        expect(screen.getAllByRole("navigation", { name: "Primary areas" })).toHaveLength(1);
        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(
            within(screen.getByRole("main")).getByRole("heading", { name: "Legacy page" }),
        ).toBeInTheDocument();
    });

    it("renders the legacy account bar with the structure it had in the layout", () => {
        const { container } = renderFrame(<ShellPage />);

        // Frame order: banners, account bar, page. Nothing else.
        expect(Array.from(container.children).map((child) => child.tagName)).toEqual([
            "DIV",
            "HEADER",
            "H1",
        ]);
        expect(container.children[0]).toHaveAttribute("data-testid", "banners");

        const header = container.querySelector("header");
        expect(header).not.toBeNull();
        expect(structureOf(header as Element)).toEqual([
            "header",
            '  nav aria-label="Account"',
            '    a aria-label="Full Chaos Dev Health cockpit" href="/dashboard"',
            '      img alt="Full Chaos Dev Health logo"',
            '      span "Full Chaos Dev Health"',
            // The light / dark toggle was mounted next to the account menu after
            // the shell was built; it is part of the legacy bar now.
            "    div",
            '      button aria-label="Light theme" type="button"',
            "        span",
            '        span "Dark"',
            "      div",
            '        button aria-label="Account options" aria-controls="account-options" aria-expanded="false" type="button"',
            '          div "A"',
            '          span "Account"',
            '          span "admin"',
        ]);
    });

    it.each(["/org/admin/users", "/superadmin", "/settings", "/ai/impact", "/dashboards"])(
        "keeps %s on the legacy chrome",
        (pathname) => {
            navigationMock.pathname = pathname;
            renderFrame(<ShellPage />);

            expect(screen.queryByTestId("app-shell")).toBeNull();
            expect(screen.getByRole("navigation", { name: "Account" })).toBeInTheDocument();
        },
    );
});
