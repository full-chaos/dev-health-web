import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CHAOS-7584: chart, status, investment-theme and quadrant-zone colors come from
// the infinity theme tokens through `chartTheme`. These modules hold no color literal.
const MODULES = [
    "../../components/security/TrendChart.tsx",
    "../../components/security/SeverityStackedBar.tsx",
    "../../components/charts/WorkGraphExplorer.tsx",
    "../../components/charts/QuadrantChart.tsx",
    "../../components/charts/QuadrantPanel.tsx",
    "../../components/charts/HeatmapChart.tsx",
    "../../components/charts/TransitionHeatmapChart.tsx",
    "../../components/charts/HeatmapScaleLegend.tsx",
    "../heatmapRamp.ts",
    "../../components/charts/chartConventions.ts",
    "../chartTransforms.ts",
    "../chartUtils.ts",
    "../quadrantZones.ts",
];

const HEX = /#[0-9a-fA-F]{3,8}\b/u;
const RGB_LITERAL = /\brgba?\(\s*\d/u;

const findLiterals = (source: string) =>
    source
        .split("\n")
        .map((text, index) => ({ text, line: index + 1 }))
        .filter(({ text }) => HEX.test(text) || RGB_LITERAL.test(text))
        .map(({ text, line }) => `${line}: ${text.trim()}`);

describe("chart color sources", () => {
    it.each(MODULES)("%s holds no hex or rgb color literal", (path) => {
        const source = readFileSync(new URL(path, import.meta.url), "utf8");
        expect(findLiterals(source)).toEqual([]);
    });

    it("the scan itself catches a planted literal", () => {
        expect(findLiterals('const c = "#ef4444";')).toHaveLength(1);
        expect(findLiterals('const c = "rgba(34, 197, 94, 0.12)";')).toHaveLength(1);
        expect(findLiterals("`rgba(${red}, ${green}, ${blue}, ${a})`")).toHaveLength(0);
    });
});
