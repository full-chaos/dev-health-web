import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { WorkTabNav } from "./WorkTabNav";
import type { MetricFilter } from "@/lib/filters/types";

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

vi.mock("@/lib/filters/url", () => ({
    withFilterParam: (href: string) => href,
}));

const filters: MetricFilter = {
    scope: { level: "repo", ids: [] },
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

describe("WorkTabNav", () => {
    it("renders all tab labels", () => {
        render(<WorkTabNav activeTab="overview" filters={filters} />);
        const labels = screen.getAllByRole("tab").map((tab) => tab.textContent);

        expect(labels).toEqual(["Overview", "Heatmap", "Flame", "Evidence", "Work Graph"]);
    });

    it("marks the active tab with aria-current='page'", () => {
        render(<WorkTabNav activeTab="flame" filters={filters} />);
        const activeLink = screen.getByText("Flame").closest("a");
        expect(activeLink).toHaveAttribute("aria-current", "page");
    });

    it("does not mark inactive tabs with aria-current", () => {
        render(<WorkTabNav activeTab="flame" filters={filters} />);
        const inactiveLink = screen.getByText("Overview").closest("a");
        expect(inactiveLink).not.toHaveAttribute("aria-current");
    });

    it("sets correct href for each tab", () => {
        render(<WorkTabNav activeTab="overview" filters={filters} />);
        const graphLink = screen.getByText("Work Graph").closest("a");
        expect(graphLink).toHaveAttribute("href", "/work?view=work&tab=graph");
    });

    it("renders the strip with the shared tablist primitive", () => {
        render(<WorkTabNav activeTab="overview" filters={filters} />);
        expect(screen.getByRole("tablist", { name: "Work views" })).toBeInTheDocument();
    });
});
