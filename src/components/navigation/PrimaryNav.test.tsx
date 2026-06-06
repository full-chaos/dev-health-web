import { beforeEach, describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@/test/utils";
import { PrimaryNav } from "./PrimaryNav";
import type { MetricFilter } from "@/lib/filters/types";

// Stub usePathname so PrimaryNav (a client component) renders deterministically
const navigationMock = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
    usePathname: () => navigationMock.pathname,
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1" } },
        update: vi.fn(),
    }),
}));

function makeFilter(): MetricFilter {
    return {
        scope: { level: "repo", ids: ["my-repo"] },
        time: {
            range_days: 30,
            compare_days: 0,
            start_date: undefined,
            end_date: undefined,
        },
        who: {},
        what: {},
        why: {},
        how: {},
    };
}

beforeEach(() => {
    navigationMock.pathname = "/dashboard";
});

function currentPageLinks() {
    return screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");
}

describe("PrimaryNav — two-level decision-area surface (CHAOS-2079)", () => {
    it("always renders the eight area rows", () => {
        render(<PrimaryNav filters={makeFilter()} active="home" />);

        for (const name of [
            /^Cockpit$/i,
            /^Diagnose$/i,
            /^Plan$/i,
            /^Improve$/i,
            /^Govern$/i,
            /^AI$/i,
            /^Reports$/i,
            /^Admin$/i,
        ]) {
            expect(screen.getByRole("link", { name })).toBeInTheDocument();
        }
    });

    it("on a childless area (Cockpit) renders only the eight area rows", () => {
        // Cockpit has no expandable children, so the sidebar shows exactly the areas.
        navigationMock.pathname = "/dashboard";
        render(<PrimaryNav filters={makeFilter()} active="home" />);

        const linkNames = screen
            .getAllByRole("link")
            .map((link) => (link.textContent ?? "").replace(/\s+/g, " ").trim());

        expect(linkNames).toEqual([
            "Cockpit",
            "Diagnose",
            "Plan",
            "Improve",
            "Govern",
            "AI",
            "Reports",
            "Admin",
        ]);
    });

    it("renders no expand/collapse buttons — rows are links, not toggles", () => {
        render(<PrimaryNav filters={makeFilter()} active="home" />);
        expect(screen.queryAllByRole("button")).toHaveLength(0);
    });

    it("expands ONLY the active area's children; inactive areas stay collapsed", () => {
        navigationMock.pathname = "/work";
        render(<PrimaryNav filters={makeFilter()} active="work" />);

        // Diagnose is active → its children render as indented rows.
        expect(screen.getByTestId("nav-children-diagnose")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Flow$/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Bottlenecks$/i })).toBeInTheDocument();

        // Govern is NOT active → none of its children appear.
        expect(screen.queryByTestId("nav-children-govern")).toBeNull();
        expect(screen.queryByRole("link", { name: /^Pipelines$/i })).toBeNull();
        expect(screen.queryByRole("link", { name: /^Security$/i })).toBeNull();
    });

    it("never renders preview (navVisible:false) children — verified via Improve", () => {
        // Improve's only navVisible child is Opportunities; Experiments and
        // Automations are preview routes (J5) and must never render in the sidebar.
        navigationMock.pathname = "/opportunities";
        render(<PrimaryNav filters={makeFilter()} active="opportunities" />);

        expect(screen.getByRole("link", { name: /^Opportunities$/i })).toBeInTheDocument();
        // No phantom/preview rows ever rendered.
        expect(screen.queryByRole("link", { name: /^Experiments$/i })).toBeNull();
        expect(screen.queryByRole("link", { name: /^Automations$/i })).toBeNull();
    });

    it("renders real AI children and hides preview-only AI routes", () => {
        navigationMock.pathname = "/ai/review-load";
        render(<PrimaryNav filters={makeFilter()} active="ai" />);

        expect(screen.getByRole("link", { name: /^Overview$/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Impact$/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Review Load$/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Governance Risk$/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Automations$/i })).toBeInTheDocument();

        for (const tab of [/^Attribution$/i, /^Test Gaps$/i, /^Evidence$/i]) {
            expect(screen.queryByRole("link", { name: tab })).toBeNull();
        }
    });

    it("fans out Tests / Quality / Coverage as separate Govern rows (no cluster)", () => {
        navigationMock.pathname = "/testops/tests";
        render(<PrimaryNav filters={makeFilter()} active="tests" />);

        // CHAOS-2079: the Tests · Quality · Coverage cluster is gone — each is a row.
        expect(screen.queryByRole("link", { name: /Tests · Quality · Coverage/i })).toBeNull();
        expect(screen.getByRole("link", { name: /^Tests$/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Quality$/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Coverage$/i })).toBeInTheDocument();
        // Pipelines stays its own row.
        expect(screen.getByRole("link", { name: /^Pipelines$/i })).toBeInTheDocument();
    });

    it("links each area to its landing route", () => {
        render(<PrimaryNav filters={makeFilter()} active="home" />);

        const expectations: Array<[RegExp, string]> = [
            [/^Cockpit$/i, "/dashboard"],
            [/^Diagnose$/i, "/work"],
            [/^Plan$/i, "/plan"],
            [/^Improve$/i, "/opportunities"],
            [/^Govern$/i, "/testops"],
            [/^AI$/i, "/ai"],
            [/^Reports$/i, "/reports"],
            [/^Admin$/i, "/admin"],
        ];

        for (const [name, href] of expectations) {
            expect(screen.getByRole("link", { name })).toHaveAttribute(
                "href",
                expect.stringContaining(href),
            );
        }
    });
});

describe("PrimaryNav — active child highlight (A10: one selected, distinct hover)", () => {
    it.each([
        { pathname: "/metrics", active: "metrics", child: /^Flow$/i },
        { pathname: "/ai/review-load", active: "ai", child: /^Review Load$/i },
        {
            pathname: "/plan/capacity",
            active: "capacity",
            child: /^Capacity Forecast$/i,
        },
        { pathname: "/testops/coverage", active: "coverage", child: /^Coverage$/i },
        { pathname: "/quality", active: "quality", child: /^Quality$/i },
        { pathname: "/testops/tests", active: "tests", child: /^Tests$/i },
    ])("marks exactly the child $child current for $pathname", ({ pathname, active, child }) => {
        navigationMock.pathname = pathname;
        render(<PrimaryNav filters={makeFilter()} active={active} />);

        expect(screen.getByRole("link", { name: child })).toHaveAttribute("aria-current", "page");
        // A10: exactly one selected destination across the whole sidebar.
        expect(currentPageLinks()).toHaveLength(1);
    });

    it("highlights the area row (not a child) on the area landing route", () => {
        // /dashboard → Cockpit (no children); the area row itself is current.
        navigationMock.pathname = "/dashboard";
        render(<PrimaryNav filters={makeFilter()} active="home" />);

        expect(screen.getByRole("link", { name: /^Cockpit$/i })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(currentPageLinks()).toHaveLength(1);
    });

    it("does not mark the area row current when one of its children is active", () => {
        // On /metrics the active destination is the Flow CHILD, so the Diagnose
        // AREA row must NOT also carry aria-current (no double-selection, A10).
        navigationMock.pathname = "/metrics";
        render(<PrimaryNav filters={makeFilter()} active="metrics" />);

        expect(screen.getByRole("link", { name: /^Diagnose$/i })).not.toHaveAttribute(
            "aria-current",
        );
        expect(screen.getByRole("link", { name: /^Flow$/i })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });
});

describe("PrimaryNav — active-area resolution (A10: one selected at a time)", () => {
    // Each row resolves to its owning area, and exactly one destination is
    // selected sidebar-wide (A10). On an area-LANDING route the area row is the
    // selection; on a CHILD route a child row inside that area is. `landing`
    // flags whether the area row itself should carry aria-current.
    it.each([
        {
            pathname: "/dashboard",
            active: "home",
            area: /^Cockpit$/i,
            landing: true,
        },
        {
            pathname: "/operating-review",
            active: "operating-review",
            area: /^Plan$/i,
            landing: true,
        },
        { pathname: "/work", active: "work", area: /^Diagnose$/i, landing: true },
        {
            pathname: "/metrics",
            active: "metrics",
            area: /^Diagnose$/i,
            landing: false,
        },
        {
            pathname: "/people",
            active: "people",
            area: /^Diagnose$/i,
            landing: false,
        },
        {
            pathname: "/complexity",
            active: "complexity",
            area: /^Diagnose$/i,
            landing: false,
        },
        {
            pathname: "/bottleneck",
            active: "bottleneck",
            area: /^Diagnose$/i,
            landing: false,
        },
        {
            pathname: "/landscape",
            active: "landscape",
            area: /^Diagnose$/i,
            landing: false,
        },
        {
            pathname: "/opportunities",
            active: "opportunities",
            area: /^Improve$/i,
            landing: true,
        },
        {
            pathname: "/plan/capacity",
            active: "capacity",
            area: /^Plan$/i,
            landing: false,
        },
        {
            pathname: "/ai/review-load",
            active: "ai",
            area: /^AI$/i,
            landing: false,
        },
        {
            pathname: "/testops",
            active: "testops",
            area: /^Govern$/i,
            landing: true,
        },
        {
            pathname: "/testops/risk",
            active: "risk",
            area: /^Govern$/i,
            landing: false,
        },
        {
            pathname: "/quality",
            active: "quality",
            area: /^Govern$/i,
            landing: false,
        },
        {
            pathname: "/security",
            active: "security",
            area: /^Govern$/i,
            landing: false,
        },
        {
            pathname: "/risk/compounding",
            active: "risk-compounding",
            area: /^Govern$/i,
            landing: false,
        },
        {
            pathname: "/reports",
            active: "reports",
            area: /^Reports$/i,
            landing: true,
        },
        { pathname: "/admin", active: "admin", area: /^Admin$/i, landing: true },
    ])(
        "resolves route $pathname to its owning area with exactly one selection",
        ({ pathname, active, area, landing }) => {
            navigationMock.pathname = pathname;
            render(<PrimaryNav filters={makeFilter()} active={active} />);

            // The owning area row is always rendered.
            const areaRow = screen.getByRole("link", { name: area });
            expect(areaRow).toBeInTheDocument();
            // The area row carries aria-current only on its own landing route.
            if (landing) {
                expect(areaRow).toHaveAttribute("aria-current", "page");
            } else {
                expect(areaRow).not.toHaveAttribute("aria-current");
            }
            // A10: exactly one selected destination across the whole sidebar.
            expect(currentPageLinks()).toHaveLength(1);
        },
    );

    it("uses the longest pathname match and ignores a stale active prop", () => {
        // /testops/risk belongs to Govern; the stale active="people" (Diagnose) must lose.
        navigationMock.pathname = "/testops/risk";
        render(<PrimaryNav filters={makeFilter()} active="people" />);

        // Govern is the active area (its Delivery Risk child is the selection).
        expect(screen.getByTestId("nav-children-govern")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /^Delivery Risk$/i })).toHaveAttribute(
            "aria-current",
            "page",
        );
        // Diagnose lost: not selected and not expanded.
        expect(screen.getByRole("link", { name: /^Diagnose$/i })).not.toHaveAttribute(
            "aria-current",
        );
        expect(screen.queryByTestId("nav-children-diagnose")).toBeNull();
        expect(currentPageLinks()).toHaveLength(1);
    });

    it("falls back to the active prop's area when no pathname prefix matches", () => {
        // Evidence/detail routes (e.g. /prs/[id]) are not owned by any area prefix.
        navigationMock.pathname = "/prs/123";
        render(<PrimaryNav filters={makeFilter()} active="people" />);

        expect(screen.getByRole("link", { name: /^Diagnose$/i })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(currentPageLinks()).toHaveLength(1);
    });

    // REVIEW W1: /testops → Govern row active; Overview child rendered but NOT active.
    it("pathname /testops → Govern area row active, Overview child rendered but not active (W1)", () => {
        navigationMock.pathname = "/testops";
        render(<PrimaryNav filters={makeFilter()} active="testops" />);

        // Govern area row is the current page (area landing).
        expect(screen.getByRole("link", { name: /^Govern$/i })).toHaveAttribute(
            "aria-current",
            "page",
        );
        // Overview child is rendered (Govern is a main area and is active).
        expect(screen.getByRole("link", { name: /^Overview$/i })).toBeInTheDocument();
        // Overview child is NOT marked current (the area row owns the highlight).
        expect(screen.getByRole("link", { name: /^Overview$/i })).not.toHaveAttribute(
            "aria-current",
        );
        // A10: exactly one current-page link.
        expect(currentPageLinks()).toHaveLength(1);
    });

    // REVIEW W2: /testops/pipelines → Pipelines child active; Tests + Overview NOT active.
    it("pathname /testops/pipelines → Pipelines child active, not Tests or Overview (W2)", () => {
        navigationMock.pathname = "/testops/pipelines";
        render(<PrimaryNav filters={makeFilter()} active="pipelines" />);

        // Pipelines child is the current page.
        expect(screen.getByRole("link", { name: /^Pipelines$/i })).toHaveAttribute(
            "aria-current",
            "page",
        );
        // Sibling rows are rendered but NOT active.
        expect(screen.getByRole("link", { name: /^Tests$/i })).not.toHaveAttribute("aria-current");
        expect(screen.getByRole("link", { name: /^Overview$/i })).not.toHaveAttribute(
            "aria-current",
        );
        // A10: exactly one current-page link.
        expect(currentPageLinks()).toHaveLength(1);
    });
});

describe("PrimaryNav — utility-area gate (owner directive)", () => {
    // Utility-placement areas (Reports, Admin) must render as plain rows with NO
    // child expansion even when active. Only main-placement areas expand.

    it("Reports area renders NO child rows when active at /reports", () => {
        navigationMock.pathname = "/reports";
        render(<PrimaryNav filters={makeFilter()} active="reports" />);

        // Reports row is rendered and marked current (it's the area landing).
        expect(screen.getByRole("link", { name: /^Reports$/i })).toHaveAttribute(
            "aria-current",
            "page",
        );
        // NO child container rendered for Reports.
        expect(screen.queryByTestId("nav-children-reports")).toBeNull();
        // Report Center (a navVisible child) must NOT appear in the sidebar.
        expect(screen.queryByRole("link", { name: /^Report Center$/i })).toBeNull();
        // Preview rows also absent (they were already suppressed, still absent).
        expect(screen.queryByRole("link", { name: /^Weekly Review$/i })).toBeNull();
        // A10: exactly one current-page link.
        expect(currentPageLinks()).toHaveLength(1);
    });

    it("Admin area renders NO child rows when active at /admin/settings", () => {
        navigationMock.pathname = "/admin/settings";
        render(<PrimaryNav filters={makeFilter()} active="settings" />);

        // Admin row is active (but the child Settings would have been current if expanded).
        // Under the utility gate, no children render at all.
        expect(screen.queryByTestId("nav-children-admin")).toBeNull();
        expect(screen.queryByRole("link", { name: /^Settings$/i })).toBeNull();
        expect(screen.queryByRole("link", { name: /^Connections$/i })).toBeNull();
        // The Admin area row itself is the sole current-page link (no child selection).
        expect(screen.getByRole("link", { name: /^Admin$/i })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(currentPageLinks()).toHaveLength(1);
    });
});
