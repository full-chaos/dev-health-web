import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import type { MetricFilter } from "@/lib/filters/types";
import { WorkGraphHeaderActions } from "./WorkGraphHeaderActions";

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30 },
} as unknown as MetricFilter;

describe("WorkGraphHeaderActions", () => {
    it("links to the evidence explorer with the metric and the page filters (overview and dependencies)", () => {
        for (const tab of ["overview", "dependencies"]) {
            const { unmount } = render(
                <WorkGraphHeaderActions filters={filters} activeTab={tab} />,
            );
            const href =
                screen.getByRole("link", { name: "Open evidence" }).getAttribute("href") ?? "";
            expect(href).toContain("/explore");
            expect(href).toContain("metric=throughput");
            expect(href).toContain("f=");
            unmount();
        }
    });

    it("renders nothing on the other tabs (they never had it)", () => {
        for (const tab of ["inflow-outflow", "review-network", "artifacts"]) {
            const { container, unmount } = render(
                <WorkGraphHeaderActions filters={filters} activeTab={tab} />,
            );
            expect(container).toBeEmptyDOMElement();
            unmount();
        }
    });

    it("carries the role through", () => {
        render(<WorkGraphHeaderActions filters={filters} activeTab="overview" role="exec" />);
        expect(screen.getByRole("link").getAttribute("href")).toContain("role=exec");
    });
});
