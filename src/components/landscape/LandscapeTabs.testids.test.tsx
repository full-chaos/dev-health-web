import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import type { HotspotRow } from "@/components/complexity/ComplexityDashboard";
import type { BusFactor } from "@/lib/graphql/types";
import type { QuadrantResponse } from "@/lib/types";

import { HotspotsView, OwnershipView, ReposView, TeamsView } from "./LandscapeTabs";

// CHAOS-7765 pin: the test hooks of the four tables and their rows stay.

const axes = {
    x: { metric: "x", label: "x", unit: "u" },
    y: { metric: "y", label: "y", unit: "u" },
};
const point = (id: string, x: number, y: number) => ({
    entity_id: id,
    entity_label: id,
    x,
    y,
    window_start: "2026-06-01",
    window_end: "2026-09-01",
    evidence_link: "/explore",
});
const quadrant: QuadrantResponse = {
    axes,
    annotations: [],
    points: [point("a", 1, 2), point("b", 3, 4)],
};
const hotspots = [
    { repoId: "r1", repoName: "one", filePath: "a/x.ts", riskScore: 1, churnLoc30d: 2 },
    { repoId: "r2", repoName: "two", filePath: "b/y.ts", riskScore: 3, churnLoc30d: 4 },
] as unknown as HotspotRow[];
const bus = {
    repos: [
        { repoId: "r1", repoName: "one", value: 1, topMaintainers: [] },
        { repoId: "r2", repoName: "two", value: 2, topMaintainers: [] },
    ],
} as unknown as BusFactor;

describe("Landscape table test hooks (pin)", () => {
    it.each([
        ["teams-table", "teams-row", <TeamsView key="t" cycleData={quadrant} churnData={null} />],
        ["repos-table", "repos-row", <ReposView key="r" hotspots={hotspots} />],
        ["ownership-table", "ownership-row", <OwnershipView key="o" busFactor={bus} />],
        ["hotspots-table", "hotspots-row", <HotspotsView key="h" hotspots={hotspots} />],
    ])("%s is the table and has one %s per row", (tableId, rowId, view) => {
        render(view);

        expect(screen.getByTestId(tableId).tagName).toBe("TABLE");
        expect(screen.getAllByTestId(rowId)).toHaveLength(2);
        for (const row of screen.getAllByTestId(rowId)) expect(row.tagName).toBe("TR");
    });

    it("renders no table, only the empty state, when there is nothing to show", () => {
        render(<TeamsView cycleData={null} churnData={null} />);

        expect(screen.queryByTestId("teams-table")).toBeNull();
        expect(screen.queryByRole("table")).toBeNull();
    });
});
