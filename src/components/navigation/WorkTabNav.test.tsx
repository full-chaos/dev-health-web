import { describe, expect, it } from "vitest";

import { navAreas } from "@/lib/navigation/areas";
import { LEGACY_WORK_TAB_REDIRECTS } from "@/lib/navigation/workPageView";

describe("Work lens retirement", () => {
    it("removes the Work tab strip from the canonical IA", () => {
        const diagnose = navAreas.find((area) => area.id === "diagnose");

        expect(diagnose?.children.map((child) => child.label)).toEqual([
            "Overview",
            "Flow",
            "Investment",
            "Landscape",
            "Work Graph",
            "Complexity",
            "Cognitive Load",
            "Bottlenecks",
            // CHAOS-3524 (chris's ruling): Ask Dev removed as a left-nav
            // destination — one ingress only, the in-context
            // trigger/window path.
            "People",
            "Code",
        ]);
        expect(diagnose?.children.some((child) => child.label === "Work")).toBe(false);
    });

    it("keeps former Work tabs reachable only through explicit redirects", () => {
        expect(LEGACY_WORK_TAB_REDIRECTS).toMatchObject({
            heatmap: "/cognitive-load?tab=heatmap",
            flame: "/complexity?tab=flame",
            graph: "/diagnose/work-graph",
            evidence: "/diagnose/work-graph?evidence=open",
        });
    });
});
