import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import { encodeSecurityFilter } from "@/lib/filters/security";
import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";
import type { NavArea } from "@/lib/navigation/areas";

import { ShellNav } from "./ShellNav";
import { ShellSidebar } from "./ShellSidebar";

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

function renderSidebar(features: Record<string, boolean> = {}) {
    return render(
        <AdminTierProvider tier="community" features={features}>
            <ShellSidebar />
        </AdminTierProvider>,
    );
}

function sidebar() {
    return screen.getByTestId("shell-sidebar");
}

function currentPageLinks() {
    return within(sidebar())
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");
}

function linkParams(name: RegExp) {
    const href = screen.getByRole("link", { name }).getAttribute("href") ?? "";
    return new URL(href, "https://app.example").searchParams;
}

beforeEach(() => {
    navigationMock.pathname = "/dashboard";
    navigationMock.search = "";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("ShellSidebar — landmarks and structure", () => {
    it("is one complementary landmark that holds the brand, both navigations and the account block", () => {
        renderSidebar();

        expect(sidebar().tagName).toBe("ASIDE");
        expect(screen.getAllByRole("complementary")).toHaveLength(1);
        expect(screen.getByRole("navigation", { name: "Primary areas" })).toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "Reports and admin" })).toBeInTheDocument();

        const brand = screen.getByRole("link", { name: "Full Chaos Dev Health home" });
        expect(brand).toHaveAttribute("href", "/dashboard");
        expect(brand).toContainElement(
            screen.getByRole("img", { name: "Full Chaos Dev Health logo" }),
        );
        expect(within(sidebar()).getByRole("button", { name: "Account options" })).toHaveAttribute(
            "aria-controls",
            "account-options-sidebar",
        );
    });

    it("lists the six main areas in the primary navigation and Reports / Admin in the utility navigation", () => {
        renderSidebar();

        const primary = screen.getByRole("navigation", { name: "Primary areas" });
        expect(
            within(primary)
                .getAllByRole("link")
                .map((link) => link.textContent),
        ).toEqual(["Home", "Diagnose", "Plan", "Improve", "Govern", "AI"]);

        const utility = screen.getByRole("navigation", { name: "Reports and admin" });
        expect(
            within(utility)
                .getAllByRole("link")
                .map((link) => link.textContent),
        ).toEqual(["Reports", "Admin"]);
    });
});

/** Stands in for the shell: the menu button lives outside the sidebar and the shell owns the state. */
function SlideOverFrame({ startOpen = false }: { startOpen?: boolean }) {
    const [open, setOpen] = useState(startOpen);
    const controlRef = useRef<HTMLButtonElement>(null);
    return (
        <AdminTierProvider tier="community" features={{}}>
            <button
                type="button"
                ref={controlRef}
                aria-expanded={open}
                aria-controls="primary-navigation-panel"
                onClick={() => setOpen((value) => !value)}
            >
                Menu
            </button>
            <ShellSidebar
                mobileOpen={open}
                onMobileClose={() => setOpen(false)}
                mobileControlRef={controlRef}
            />
        </AdminTierProvider>
    );
}

describe("ShellSidebar — mobile slide-over (CHAOS-7592)", () => {
    it("is off canvas and not focusable while closed, with no dialog role and no backdrop", () => {
        render(<SlideOverFrame />);
        const panel = document.getElementById("primary-navigation-panel");

        expect(panel).toHaveClass("max-md:invisible", "max-md:-translate-x-full");
        expect(panel).not.toHaveClass("max-md:translate-x-0");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByTestId("shell-nav-backdrop")).toBeNull();
    });

    it("opens as a modal dialog over a backdrop, moves focus in and locks page scroll", async () => {
        const user = userEvent.setup();
        render(<SlideOverFrame />);

        await user.click(screen.getByRole("button", { name: "Menu" }));
        const dialog = screen.getByRole("dialog", { name: "Navigation" });

        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveClass("max-md:translate-x-0", "max-md:visible");
        expect(dialog).toHaveFocus();
        expect(screen.getByTestId("shell-nav-backdrop")).toHaveClass("md:hidden");
        expect(document.body.style.overflow).toBe("hidden");
    });

    it("Escape closes it, returns focus to the menu button and restores page scroll", async () => {
        const user = userEvent.setup();
        render(<SlideOverFrame />);
        const control = screen.getByRole("button", { name: "Menu" });

        await user.click(control);
        await user.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(control).toHaveAttribute("aria-expanded", "false");
        expect(control).toHaveFocus();
        expect(document.body.style.overflow).not.toBe("hidden");
    });

    it("a backdrop click closes it", async () => {
        const user = userEvent.setup();
        render(<SlideOverFrame />);

        await user.click(screen.getByRole("button", { name: "Menu" }));
        await user.click(screen.getByTestId("shell-nav-backdrop"));

        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("following a navigation link closes it", async () => {
        const user = userEvent.setup();
        render(<SlideOverFrame />);

        await user.click(screen.getByRole("button", { name: "Menu" }));
        await user.click(
            within(screen.getByRole("dialog")).getByRole("link", { name: "Diagnose" }),
        );

        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps Tab inside while open", async () => {
        const user = userEvent.setup();
        render(<SlideOverFrame />);
        await user.click(screen.getByRole("button", { name: "Menu" }));
        const dialog = screen.getByRole("dialog");
        const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), select"),
        );
        const first = focusable[0];
        const last = focusable.at(-1) as HTMLElement;

        last.focus();
        await user.tab();
        expect(first).toHaveFocus();

        await user.tab({ shift: true });
        expect(last).toHaveFocus();
    });

    it("is the static column from md up: the desktop classes are unchanged and nothing is fixed without max-md", () => {
        render(<SlideOverFrame />);
        const panel = document.getElementById("primary-navigation-panel") as HTMLElement;

        expect(panel).toHaveClass("md:flex", "md:h-full", "md:overflow-visible", "md:border-0");
        expect(sidebar()).toHaveClass("md:sticky", "md:h-dvh", "md:w-60", "md:shrink-0");
        const unprefixedFixed = panel.className
            .split(/\s+/u)
            .filter((c) => c === "fixed" || c === "z-50");
        expect(unprefixedFixed).toEqual([]);
        expect(panel).toHaveClass("max-md:w-60");
    });

    it("has no slide transition for people who ask for reduced motion", () => {
        render(<SlideOverFrame />);
        expect(document.getElementById("primary-navigation-panel")).toHaveClass(
            "motion-reduce:transition-none",
        );
    });
});

describe("ShellSidebar — active area and current page (A1, A10)", () => {
    it("on the Home marks the Home row as the current page and expands nothing", () => {
        renderSidebar();

        expect(screen.getByRole("link", { name: /^Home$/ })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(currentPageLinks()).toHaveLength(1);
        expect(document.querySelectorAll("[data-testid^='nav-children-']")).toHaveLength(0);
    });

    it("expands only the active area and marks its child as the one current page", () => {
        navigationMock.pathname = "/investment";
        renderSidebar();

        const children = screen.getByTestId("nav-children-diagnose");
        expect(within(children).getByRole("link", { name: /^Investment$/ })).toHaveAttribute(
            "aria-current",
            "page",
        );
        const diagnose = screen.getByRole("link", { name: /^Diagnose$/ });
        expect(diagnose).not.toHaveAttribute("aria-current");
        expect(diagnose).toHaveAttribute("data-active", "true");
        expect(currentPageLinks()).toHaveLength(1);

        expect(screen.queryByTestId("nav-children-govern")).toBeNull();
        expect(screen.queryByTestId("nav-children-plan")).toBeNull();
        expect(screen.queryByRole("link", { name: /^Security$/ })).toBeNull();
    });

    it("on an area landing marks the Overview child, not the area row", () => {
        navigationMock.pathname = "/diagnose";
        renderSidebar();

        expect(screen.getByTestId("nav-children-diagnose")).toBeInTheDocument();
        expect(currentPageLinks().map((link) => link.textContent)).toEqual(["Overview"]);
        expect(screen.getByRole("link", { name: /^Diagnose$/ })).not.toHaveAttribute(
            "aria-current",
        );
    });

    it("marks the area row when no listed child owns the route", () => {
        navigationMock.pathname = "/agent-context/context-packet";
        renderSidebar();

        expect(currentPageLinks().map((link) => link.textContent)).toEqual(["Diagnose"]);
    });

    it("does not expand a utility area with one destination, also when it is active (Reports)", () => {
        navigationMock.pathname = "/reports";
        renderSidebar();

        expect(screen.getByRole("link", { name: /^Reports$/ })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.queryByTestId("nav-children-reports")).toBeNull();
        expect(currentPageLinks()).toHaveLength(1);
    });

    it("expands Admin to its four destinations when it is active (AD-1 option A)", () => {
        navigationMock.pathname = "/org/admin/integrations";
        renderSidebar();

        const children = screen.getByTestId("nav-children-admin");
        expect(
            within(children)
                .getAllByRole("link")
                .map((link) => link.textContent),
        ).toEqual(["Organization", "Connections", "Data Confidence", "Settings"]);
        expect(currentPageLinks().map((link) => link.textContent)).toEqual(["Connections"]);
        expect(screen.getByRole("link", { name: /^Admin$/ })).not.toHaveAttribute("aria-current");
    });

    it("keeps Admin collapsed when another area is active", () => {
        navigationMock.pathname = "/plan";
        renderSidebar();

        expect(screen.queryByTestId("nav-children-admin")).toBeNull();
    });
});

describe("ShellSidebar — hidden and entitlement-gated entries", () => {
    it("does not list a navVisible:false child, and keeps its area selected on the hidden route", () => {
        navigationMock.pathname = "/plan";
        const { unmount } = renderSidebar();
        expect(screen.getByTestId("nav-children-plan")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /^Operating Review$/ })).toBeNull();
        unmount();

        navigationMock.pathname = "/operating-review";
        renderSidebar();
        expect(screen.queryByRole("link", { name: /^Operating Review$/ })).toBeNull();
        expect(screen.getByRole("link", { name: /^Plan$/ })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(currentPageLinks()).toHaveLength(1);
    });

    const gatedAreas: readonly NavArea[] = [
        {
            id: "diagnose",
            label: "Diagnose",
            href: "/diagnose",
            placement: "main",
            ownedPathPrefixes: ["/diagnose", "/agent-context"],
            legacyActiveIds: [],
            hubItems: [],
            children: [
                {
                    id: "overview",
                    label: "Overview",
                    path: "/diagnose",
                    navVisible: true,
                    exact: true,
                },
                {
                    id: "context-fabric",
                    label: "Context Fabric",
                    path: "/agent-context",
                    navVisible: true,
                    requiredFeature: "agent_context_runtime",
                },
            ],
        },
    ];

    function renderGated(features: Record<string, boolean>) {
        navigationMock.pathname = "/diagnose";
        return render(
            <AdminTierProvider tier="enterprise" features={features}>
                <ShellNav areas={gatedAreas} />
            </AdminTierProvider>,
        );
    }

    it.each([
        ["the entitlement is missing", {}],
        ["the entitlement is false", { agent_context_runtime: false }],
    ])("hides an entitlement-gated row when %s", (_condition, features) => {
        renderGated(features);

        expect(screen.getByRole("link", { name: /^Overview$/ })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /^Context Fabric$/ })).toBeNull();
    });

    it("lists an entitlement-gated row when the organization has the feature", () => {
        renderGated({ agent_context_runtime: true });

        expect(screen.getByRole("link", { name: /^Context Fabric$/ })).toHaveAttribute(
            "href",
            expect.stringContaining("/agent-context?"),
        );
    });
});

describe("ShellSidebar — filter, role and lens stay in the links", () => {
    const filter: MetricFilter = {
        ...defaultMetricFilter,
        scope: { level: "repo", ids: ["my-repo"] },
    };

    it("carries f, role and lens verbatim on a route without a default role", () => {
        navigationMock.pathname = "/investment";
        navigationMock.search = `f=${encodeFilterParam(filter)}&role=em&lens=pm`;
        renderSidebar();

        for (const name of [/^Home$/, /^Plan$/, /^Flow$/, /^Reports$/, /^Admin$/]) {
            const params = linkParams(name);
            expect(decodeFilter(params.get("f") ?? "")).toEqual(filter);
            expect(params.get("role")).toBe("em");
            expect(params.get("lens")).toBe("pm");
        }
    });

    it("adds no role and no lens when the URL has none, on a route without a default role", () => {
        navigationMock.pathname = "/investment";
        renderSidebar();

        const params = linkParams(/^Plan$/);
        expect(params.has("f")).toBe(true);
        expect(params.has("role")).toBe(false);
        expect(params.has("lens")).toBe(false);
    });

    it("keeps a child path's own query and adds the params to it", () => {
        navigationMock.pathname = "/investment";
        navigationMock.search = "role=pm";
        renderSidebar();

        const href = screen.getByRole("link", { name: /^Flow$/ }).getAttribute("href") ?? "";
        const url = new URL(href, "https://app.example");
        expect(url.pathname).toBe("/metrics");
        expect(url.searchParams.get("tab")).toBe("flow");
        expect(url.searchParams.get("role")).toBe("pm");
    });

    it("the Home entry carries the state the in-page 'Back to Home' link carried", () => {
        // Diagnose pages had `<BackLink href={withFilterParam("/", filters, role)} />`.
        navigationMock.pathname = "/diagnose";
        navigationMock.search = `f=${encodeFilterParam(filter)}&role=em&lens=pm`;
        renderSidebar();

        const backLink = new URL(withFilterParam("/", filter, "em"), "https://app.example");
        const params = linkParams(/^Home$/);
        expect(params.get("f")).toBe(backLink.searchParams.get("f"));
        expect(params.get("role")).toBe(backLink.searchParams.get("role"));
        expect(params.get("lens")).toBe("pm");
        expect(screen.getByRole("link", { name: /^Home$/ })).toHaveAttribute(
            "href",
            expect.stringMatching(/^\/dashboard\?/),
        );
    });

    it("keeps the role context on standalone /investment in every sidebar link", () => {
        navigationMock.pathname = "/investment";
        navigationMock.search = "role=leadership";
        renderSidebar();

        const links = within(sidebar())
            .getAllByRole("link")
            .filter((link) => link.getAttribute("href")?.includes("?"));
        expect(links.length).toBeGreaterThan(10);
        for (const link of links) {
            const url = new URL(link.getAttribute("href") ?? "", "https://app.example");
            expect(url.searchParams.get("role"), link.textContent ?? "").toBe("leadership");
        }
    });

    it("keeps the Home's production behaviour: links carry the default role when the URL has none", () => {
        navigationMock.pathname = "/dashboard";
        renderSidebar();

        expect(linkParams(/^Diagnose$/).get("role")).toBe("ic");
        expect(linkParams(/^Reports$/).get("role")).toBe("ic");
        expect(linkParams(/^Diagnose$/).has("lens")).toBe(false);
    });

    it("on the Home resolves the role from the lens first, then from role", () => {
        navigationMock.pathname = "/dashboard";
        navigationMock.search = "lens=leadership&role=em";
        const { unmount } = renderSidebar();
        expect(linkParams(/^Diagnose$/).get("role")).toBe("leadership");
        expect(linkParams(/^Diagnose$/).get("lens")).toBe("leadership");
        unmount();

        navigationMock.search = "role=em";
        renderSidebar();
        expect(linkParams(/^Diagnose$/).get("role")).toBe("em");
    });
});

describe("ShellSidebar — a route with its own `f` encoding (Security)", () => {
    // The Security pages keep a Security filter in `f`, not a metric filter.
    const SECURITY_F = encodeSecurityFilter({
        openOnly: false,
        severities: ["critical"],
        repoIds: ["repo-1"],
    });
    const DEFAULT_F = encodeFilterParam(defaultMetricFilter);

    it.each(["/security", "/security/repos/repo-1"])(
        "%s: every link carries the default metric filter, as the page-level navigation did",
        (pathname) => {
            navigationMock.pathname = pathname;
            navigationMock.search = `f=${SECURITY_F}`;
            renderSidebar();

            const withFilter = within(sidebar())
                .getAllByRole("link")
                .filter((link) => (link.getAttribute("href") ?? "").includes("f="));
            expect(withFilter.length).toBeGreaterThan(10);
            for (const link of withFilter) {
                const href = link.getAttribute("href") ?? "";
                const params = new URL(href, "https://app.example").searchParams;
                expect(params.get("f"), href).toBe(DEFAULT_F);
            }
        },
    );

    it("carries no Security key to another page", () => {
        navigationMock.pathname = "/security";
        navigationMock.search = `f=${SECURITY_F}`;
        renderSidebar();

        const carried = decodeFilter(linkParams(/^Home$/).get("f")) as Record<string, unknown>;
        expect(Object.keys(carried).sort()).toEqual(Object.keys(defaultMetricFilter).sort());
    });

    it("does not change a route with a metric filter: its links carry the filter of the URL", () => {
        const filters: MetricFilter = {
            ...defaultMetricFilter,
            scope: { level: "team", ids: ["platform"] },
        };
        navigationMock.pathname = "/quality";
        navigationMock.search = `f=${encodeFilterParam(filters)}`;
        renderSidebar();

        expect(decodeFilter(linkParams(/^Home$/).get("f"))).toEqual(filters);
    });

    it("keeps role and lens from the URL", () => {
        navigationMock.pathname = "/security";
        navigationMock.search = `f=${SECURITY_F}&role=em&lens=pm`;
        renderSidebar();

        expect(linkParams(/^Home$/).get("role")).toBe("em");
        expect(linkParams(/^Home$/).get("lens")).toBe("pm");
    });

    it("shows no Beta mark in the brand row", () => {
        navigationMock.pathname = "/dashboard";
        navigationMock.search = "";
        renderSidebar();

        expect(within(sidebar()).queryByText(/^beta$/i)).toBeNull();
        expect(within(sidebar()).getByText("Dev Health")).toBeInTheDocument();
    });

    it("draws an icon on every area row and a chevron only where the area has destinations", () => {
        navigationMock.pathname = "/investment";
        navigationMock.search = "";
        renderSidebar();

        const nav = within(sidebar()).getByRole("navigation", { name: "Primary areas" });
        const links = within(nav).getAllByRole("link", {
            name: /^(Home|Diagnose|Plan|Improve|Govern|AI)/,
        });
        expect(links.length).toBeGreaterThanOrEqual(5);
        for (const link of links) {
            expect(link.querySelector("svg"), link.textContent ?? "").not.toBeNull();
        }
        // Home has no destinations: no chevron. The open area shows down, the others right.
        expect(within(sidebar()).queryByTestId("nav-chevron-cockpit")).toBeNull();
        expect(
            within(sidebar()).getByTestId("nav-chevron-diagnose").getAttribute("class"),
        ).toContain("lucide-chevron-down");
        expect(within(sidebar()).getByTestId("nav-chevron-plan").getAttribute("class")).toContain(
            "lucide-chevron-right",
        );
    });
});
