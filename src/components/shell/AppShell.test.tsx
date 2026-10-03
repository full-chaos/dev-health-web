import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { expectStaticLogo } from "@/test/staticLogo";

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

    it("has the mobile bar below md (menu button, brand, theme toggle, account) and the account block in the sidebar, with different menu ids", () => {
        renderFrame(<ShellPage />);

        const bar = screen.getByTestId("shell-mobile-bar");
        expect(bar).toHaveClass("md:hidden");
        expect(within(bar).getByRole("button", { name: "Show navigation" })).toHaveAttribute(
            "aria-controls",
            "primary-navigation-panel",
        );
        expect(within(bar).getByRole("link", { name: /home/i })).toHaveAttribute(
            "href",
            "/dashboard",
        );
        expect(within(bar).getByTestId("theme-toggle")).toBeInTheDocument();
        const controls = screen.getAllByRole("button", { name: "Account options" });
        expect(controls.map((control) => control.getAttribute("aria-controls")).sort()).toEqual([
            "account-options",
            "account-options-sidebar",
        ]);
        // There is no account bar: the sidebar and top bar carry the account menu.
        expect(screen.queryByRole("navigation", { name: "Account" })).toBeNull();
    });

    it("draws the logo of the sidebar and of the mobile bar from the small static file, in its 35 x 32 box (CHAOS-8545)", () => {
        renderFrame(<ShellPage />);

        const logoName = { name: "Full Chaos Dev Health logo" };
        const logos = [
            within(screen.getByTestId("shell-sidebar")).getByRole("img", logoName),
            within(screen.getByTestId("shell-mobile-bar")).getByRole("img", logoName),
        ];
        expect(screen.getAllByRole("img", logoName)).toHaveLength(2);
        for (const logo of logos) {
            expectStaticLogo(logo, { file: "fc-logo-96.png", width: 35, height: 32 });
            expect(logo).toHaveClass("h-8", "w-auto");
        }
    });

    it("opens the slide-over from the menu button and closes it when the route changes", async () => {
        const user = userEvent.setup();
        const view = renderFrame(<ShellPage />);

        await user.click(screen.getByRole("button", { name: "Show navigation" }));
        expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Hide navigation" })).toHaveAttribute(
            "aria-expanded",
            "true",
        );

        navigationMock.pathname = "/dashboard/other";
        view.rerender(
            <AdminTierProvider tier="community" features={{}}>
                <AppShell banners={<div data-testid="banners">Banner</div>}>
                    <ShellPage />
                </AppShell>
            </AdminTierProvider>,
        );
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole("button", { name: "Show navigation" })).toHaveAttribute(
            "aria-expanded",
            "false",
        );
    });
});

describe("AppShell — the data fact is under the account name, not in the top bar (CHAOS-8432)", () => {
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

    it("asks for the organizations once, shows 'Data through' in the sidebar account block only", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                organizationsResponse({ has_data: true, last_metrics_at: "2026-09-30T10:00:00Z" }),
            );
        vi.stubGlobal("fetch", fetchMock);
        renderFrame(<ShellPage />);

        await waitFor(() =>
            expect(screen.getByTestId("account-detail")).toHaveTextContent(/^Data through /),
        );
        expect(screen.getByTestId("shell-top-bar")).not.toHaveTextContent("Data through");
        expect(screen.queryByTestId("shell-status-chip")).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("combobox", { name: /organization/i })).toBeInTheDocument();
    });

    it("shows 'No data yet' only when the active organization has no data", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(organizationsResponse({ has_data: false })),
        );
        renderFrame(<ShellPage />);

        await waitFor(() =>
            expect(screen.getByTestId("account-detail")).toHaveTextContent("No data yet"),
        );
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
    ])("shows 'Data status unavailable' (not 'No data yet') when %s", async (_label, makeFetch) => {
        vi.stubGlobal("fetch", makeFetch());
        renderFrame(<ShellPage />);

        await waitFor(() =>
            expect(screen.getByTestId("account-detail")).toHaveTextContent(
                "Data status unavailable",
            ),
        );
        expect(screen.getByTestId("account-detail")).not.toHaveTextContent("No data yet");
        expect(screen.getByTestId("account-detail")).not.toHaveTextContent("Data through");
    });

    it("shows no data line while the request is open", () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise(() => {})),
        );
        renderFrame(<ShellPage />);

        expect(screen.getByTestId("shell-top-bar")).not.toHaveTextContent("Data through");
        expect(screen.queryByText(/Data through|No data yet|Data status unavailable/)).toBeNull();
    });
});

describe("AppShell — every authed route renders in the shell", () => {
    it.each(["/demo", "/demo/charts", "/dashboards", "/superadmins", "/not-a-route"])(
        "renders the sidebar, top bar, skip link and one main on %s, with no account bar",
        (pathname) => {
            navigationMock.pathname = pathname;
            renderFrame(<ShellPage />);

            expect(screen.getByTestId("app-shell")).toBeInTheDocument();
            expect(screen.getByTestId("shell-sidebar")).toBeInTheDocument();
            expect(screen.getByTestId("shell-top-bar")).toBeInTheDocument();
            expect(screen.getByRole("link", { name: "Skip to main content" })).toBeInTheDocument();
            expect(screen.getAllByRole("main")).toHaveLength(1);
            expect(screen.queryByRole("navigation", { name: "Account" })).toBeNull();
        },
    );

    it("defines --ribbon once, with the prototype stops, outside the pinned theme blocks", () => {
        const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(
            /\s+/g,
            " ",
        );
        expect(css).toMatch(/--ribbon: linear-gradient\( ?90deg, #f92c00 0%[^;]*#01718d 100% ?\);/);
    });

    it("draws the 2px ribbon along the top edge with the --ribbon token, as the prototype does", () => {
        renderFrame(<ShellPage />);
        const ribbon = screen.getByTestId("shell-ribbon");
        expect(ribbon).toHaveAttribute("aria-hidden", "true");
        expect(ribbon.className).toContain("h-0.5");
        expect(ribbon.className).toContain("fixed");
        // Over the top bar (z-30), under the slide-over, drawers and dialogs (z-40/z-50).
        expect(ribbon.className).toContain("z-35");
        expect(ribbon.className).toContain("bg-(image:--ribbon)");
    });
});
