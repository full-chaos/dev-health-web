import { describe, expect, it } from "vitest";

import { navTrailForPathname } from "../areas";
import { metricEvidenceLeaf } from "../evidenceTrail";

describe("metricEvidenceLeaf", () => {
    it("names the metric from the metric param", () => {
        expect(metricEvidenceLeaf("/explore", { metric: "blocked_work" })).toBe(
            "Blocked Work evidence",
        );
    });

    it("reads the metric of a served explain endpoint first", () => {
        expect(
            metricEvidenceLeaf("/explore", {
                metric: "cycle_time",
                api: "/api/v1/explain?metric=blocked_work",
            }),
        ).toBe("Blocked Work evidence");
    });

    it("is null for a drilldown read and for other routes", () => {
        expect(metricEvidenceLeaf("/explore", { api: "/api/v1/drilldown/prs" })).toBeNull();
        expect(metricEvidenceLeaf("/metrics", { metric: "blocked_work" })).toBeNull();
    });
});

describe("navTrailForPathname with a leaf", () => {
    it("links the area and ends on the leaf", () => {
        const trail = navTrailForPathname("/explore", "Blocked Work evidence");
        expect(trail.map((crumb) => crumb.label)).toEqual(["Diagnose", "Blocked Work evidence"]);
        expect(trail[0].href).toBe("/diagnose");
        expect(trail[1].href).toBeUndefined();
    });

    it("without a leaf is unchanged", () => {
        expect(navTrailForPathname("/explore").map((crumb) => crumb.label)).toEqual(["Diagnose"]);
    });
});
