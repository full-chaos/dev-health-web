import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { AIGovernanceRiskTabs, governanceRiskViewFromParam } from "./AIGovernanceRiskTabs";
import type { MetricFilter } from "@/lib/filters/types";
import { getTabSet } from "@/lib/navigation/tabs";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: React.ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const filters: MetricFilter = {
    scope: { level: "org", ids: [] },
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

describe("governanceRiskViewFromParam", () => {
    it("accepts the two known subviews and falls back to overview", () => {
        expect(governanceRiskViewFromParam("test-gaps")).toBe("test-gaps");
        expect(governanceRiskViewFromParam("evidence")).toBe("evidence");
        expect(governanceRiskViewFromParam("nonsense")).toBe("overview");
        expect(governanceRiskViewFromParam(undefined)).toBe("overview");
    });
});

describe("governanceRiskViewFromParam over the registry", () => {
    it("accepts exactly the registry's tab ids and nothing else", () => {
        for (const tab of getTabSet("ai-governance-risk").tabs) {
            expect(governanceRiskViewFromParam(tab.id), tab.id).toBe(tab.id);
        }
        expect(governanceRiskViewFromParam("")).toBe("overview");
        expect(governanceRiskViewFromParam("tab")).toBe("overview");
    });
});

describe("AIGovernanceRiskTabs", () => {
    it("renders the registry's tabs in order with the same labels and links", () => {
        render(<AIGovernanceRiskTabs view="overview" filters={filters} />);

        const links = screen.getByRole("navigation", { name: "Governance Risk views" });
        const rendered = Array.from(links.querySelectorAll("a")).map((a) => [
            a.textContent,
            new URL(a.getAttribute("href") ?? "", "https://app.example").pathname +
                new URL(a.getAttribute("href") ?? "", "https://app.example").searchParams
                    .getAll("view")
                    .map((v) => `?view=${v}`)
                    .join(""),
        ]);
        expect(rendered).toEqual([
            ["Overview", "/ai/risk"],
            ["Test Gaps", "/ai/risk?view=test-gaps"],
            ["Evidence", "/ai/risk?view=evidence"],
        ]);
    });

    it("renders the three tabs with the active view marked", () => {
        render(<AIGovernanceRiskTabs view="test-gaps" filters={filters} />);

        expect(screen.getByRole("navigation", { name: "Governance Risk views" })).toBeTruthy();
        expect(screen.getByText("Test Gaps").closest("a")).toHaveAttribute("aria-current", "page");
        expect(screen.getByText("Overview").closest("a")).not.toHaveAttribute("aria-current");
        expect(screen.getByText("Evidence").closest("a")).not.toHaveAttribute("aria-current");
    });

    it("keeps the filter scope on every tab href", () => {
        render(<AIGovernanceRiskTabs view="overview" filters={filters} role="lead" />);

        for (const label of ["Overview", "Test Gaps", "Evidence"]) {
            const href = screen.getByText(label).closest("a")?.getAttribute("href") ?? "";
            expect(href, `${label} href must carry the f param`).toMatch(/[?&]f=/);
            expect(href, `${label} href must carry the role param`).toMatch(/[?&]role=lead/);
        }
        expect(screen.getByText("Test Gaps").closest("a")?.getAttribute("href")).toContain(
            "view=test-gaps",
        );
        expect(screen.getByText("Evidence").closest("a")?.getAttribute("href")).toContain(
            "view=evidence",
        );
    });
});
