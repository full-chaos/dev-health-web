import { describe, it, expect } from "vitest";
import {
    buildLegacyWorkRedirectTarget,
    LEGACY_WORK_TAB_REDIRECTS,
    resolveLegacyWorkRedirect,
} from "../workPageView";

describe("legacy Work route redirects", () => {
    it.each([
        ["overview", "/diagnose"],
        ["flow", "/metrics?tab=flow"],
        ["investment", "/investment"],
        ["landscape", "/landscape"],
        ["capacity", "/plan/capacity"],
        ["heatmap", "/cognitive-load?tab=heatmap"],
        ["flame", "/complexity?tab=flame"],
        ["graph", "/diagnose/work-graph"],
        ["evidence", "/diagnose/work-graph?evidence=open"],
    ] as const)("redirects /work?tab=%s to %s", (tab, target) => {
        expect(resolveLegacyWorkRedirect({ tab })).toBe(target);
    });

    it("redirects bare /work and the retired work view to Diagnose overview", () => {
        expect(resolveLegacyWorkRedirect({})).toBe("/diagnose");
        expect(resolveLegacyWorkRedirect({ view: "overview" })).toBe("/diagnose");
        expect(resolveLegacyWorkRedirect({ view: "work" })).toBe("/diagnose/work-graph");
    });

    it("keeps the redirect map explicit for every retired Work tab", () => {
        expect(LEGACY_WORK_TAB_REDIRECTS).toEqual({
            overview: "/diagnose",
            flow: "/metrics?tab=flow",
            investment: "/investment",
            landscape: "/landscape",
            capacity: "/plan/capacity",
            heatmap: "/cognitive-load?tab=heatmap",
            flame: "/complexity?tab=flame",
            graph: "/diagnose/work-graph",
            evidence: "/diagnose/work-graph?evidence=open",
        });
    });

    it("merges preserved filter params into retired targets that already have a query string", () => {
        expect(
            buildLegacyWorkRedirectTarget("/metrics?tab=flow", {
                tab: "flow",
                f: "scope-team",
                role: "engineering-manager",
            }),
        ).toBe("/metrics?tab=flow&f=scope-team&role=engineering-manager");
    });

    it("preserves repeated filter values while stripping retired tab and view params", () => {
        expect(
            buildLegacyWorkRedirectTarget("/cognitive-load?tab=heatmap", {
                tab: "heatmap",
                view: "work",
                f: ["scope-team", "date-window"],
            }),
        ).toBe("/cognitive-load?tab=heatmap&f=scope-team&f=date-window");
    });

    it("ignores unknown legacy tabs instead of creating a generic overview loopback", () => {
        expect(resolveLegacyWorkRedirect({ tab: "unknown" })).toBeNull();
    });
});
