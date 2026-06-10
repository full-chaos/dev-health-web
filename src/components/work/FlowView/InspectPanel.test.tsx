import { screen } from "@testing-library/react";
import { render } from "@/test/utils";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import { decodeFilter } from "@/lib/filters/encode";
import { InspectPanel, buildFlowWorkGraphUrl, type FlowSelection } from "./InspectPanel";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const filters: MetricFilter = {
    scope: { level: "team", ids: ["team-1"] },
    time: { range_days: 14, compare_days: 0 },
    who: {},
    what: { repos: ["repo-1"] },
    why: {},
    how: {},
};

const selection: FlowSelection = {
    view: "state_flow",
    path: ["Todo", "Done"],
    key: "done",
    metricValue: 42,
    percentTotal: 12.5,
    unit: "items",
};

describe("InspectPanel Work Graph drilldown", () => {
    it("builds a work-to-change graph link for state flow selections with filters and role", () => {
        render(
            <InspectPanel
                selection={selection}
                evidenceUrl="/evidence"
                flameUrl="/flame"
                filters={filters}
                activeRole="manager"
                contextEntityLabel={null}
                contextZone={null}
                onClearContext={vi.fn()}
            />,
        );

        const link = screen.getByText("Open Work Graph").closest("a");
        expect(link).toHaveAttribute("href", expect.stringContaining("/diagnose/work-graph?"));
        expect(link).toHaveAttribute("href", expect.stringContaining("f="));
        expect(link).toHaveAttribute("href", expect.stringContaining("role=manager"));
        expect(link).toHaveAttribute(
            "href",
            expect.stringContaining("graph_connection=work-to-change"),
        );
    });

    it("omits graph_connection for investment selections", () => {
        const href = buildFlowWorkGraphUrl({ view: "investment_mix" }, filters);

        expect(href).toContain("/diagnose/work-graph?f=");
        expect(href).not.toContain("graph_connection=");
    });

    it("adds theme and subcategory context for investment mix selections", () => {
        const href = buildFlowWorkGraphUrl(
            {
                view: "investment_mix",
                investment: {
                    themeKey: "quality",
                    subcategoryKey: "quality.bugfix",
                },
            },
            filters,
        );

        expect(href).toContain("graph_theme=quality");
        expect(href).toContain("graph_subcategory=quality.bugfix");
        expect(href).not.toContain("graph_connection=");
    });

    it("builds a code hotspot graph link with repo-scoped filters and selected file node", () => {
        const hotspotSelection: FlowSelection = {
            view: "code_hotspots",
            path: ["All", "repo:web-app", "src", "app", "page.tsx"],
            key: "page.tsx",
            metricValue: 9,
            percentTotal: 42,
            unit: "changes",
            hotspot: {
                repoId: "repo:web-app",
                filePath: "src/app/page.tsx",
            },
        };

        render(
            <InspectPanel
                selection={hotspotSelection}
                evidenceUrl="/evidence"
                flameUrl="/flame"
                filters={{ ...filters, what: { repos: ["repo:api"] } }}
                activeRole="manager"
                contextEntityLabel={null}
                contextZone={null}
                onClearContext={vi.fn()}
            />,
        );

        const link = screen.getByText("Open Work Graph").closest("a");
        expect(link).toHaveAttribute("href", expect.stringContaining("/diagnose/work-graph?"));
        expect(link).toHaveAttribute(
            "href",
            expect.stringContaining("graph_connection=change-to-code"),
        );
        expect(link).toHaveAttribute(
            "href",
            expect.stringContaining("graph_node=FILE%3Asrc%2Fapp%2Fpage.tsx"),
        );

        const href = link?.getAttribute("href") ?? "";
        const decodedFilters = decodeFilter(new URLSearchParams(href.split("?")[1]).get("f"));
        expect(decodedFilters.what.repos).toEqual(["repo:web-app"]);
        expect(decodedFilters.time).toEqual(filters.time);
        expect(decodedFilters.scope).toEqual(filters.scope);
    });
});
