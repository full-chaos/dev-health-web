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

    it("keeps the inline navigation control below the md breakpoint: closed by default, Escape closes and returns focus", async () => {
        const user = userEvent.setup();
        renderSidebar();

        const control = screen.getByRole("button", { name: "Show navigation" });
        const panel = document.getElementById("primary-navigation-panel");
        expect(control).toHaveAttribute("aria-controls", "primary-navigation-panel");
        expect(control).toHaveAttribute("aria-expanded", "false");
        expect(panel).toHaveClass("hidden");

        await user.click(control);
        expect(control).toHaveAttribute("aria-expanded", "true");
        expect(control).toHaveTextContent("Hide navigation");
        expect(panel).not.toHaveClass("hidden");

        await user.keyboard("{Escape}");
        expect(control).toHaveAttribute("aria-expanded", "false");
        expect(control).toHaveFocus();
        expect(panel).toHaveClass("hidden");
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

    it("never expands a utility area, also when it is active", () => {
        navigationMock.pathname = "/reports";
        renderSidebar();

        expect(screen.getByRole("link", { name: /^Reports$/ })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.queryByTestId("nav-children-reports")).toBeNull();
        expect(currentPageLinks()).toHaveLength(1);
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
});
