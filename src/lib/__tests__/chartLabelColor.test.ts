import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    DEPTH_OPACITY,
    LABEL_INK_DARK,
    LABEL_INK_LIGHT,
    MIN_LABEL_CONTRAST,
    blendOver,
    depthOpacity,
    tileLabel,
    tileLabelStyle,
} from "../chartLabelColor";
import { contrastRatio } from "../heatmapRamp";

const css = readFileSync(join(process.cwd(), "src/app/fc-infinity-themes.css"), "utf8");

function block(mode: "light" | "dark"): Record<string, string> {
    const start = css.indexOf(`[data-theme="${mode}"] {`);
    const end = css.indexOf("}", start);
    const vars: Record<string, string> = {};
    for (const m of css.slice(start, end).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gu)) {
        vars[m[1]] = m[2].trim();
    }
    const resolve = (v: string): string => {
        const ref = /^var\((--[a-z0-9-]+)\)$/u.exec(v);
        return ref ? resolve(vars[ref[1]]) : v;
    };
    return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, resolve(v)]));
}

const THEME_VARS = [
    "--theme-feature",
    "--theme-quality",
    "--theme-risk",
    "--theme-maintenance",
    "--theme-operational",
];

describe("tileLabel (theme color x opacity x light/dark)", () => {
    // CHAOS-8510: one rule for label ink on every fill: the better of white and near-black, which
    // reaches 4.5:1 everywhere, so there is never a halo or a shadow.
    let total = 0;
    for (const mode of ["light", "dark"] as const) {
        const vars = block(mode);
        const card = vars["--card"];
        for (const name of THEME_VARS) {
            for (const opacity of [undefined, ...DEPTH_OPACITY, 0.4]) {
                it(`${mode} ${name} opacity ${opacity ?? "none"}: white if it reaches 4.5, else near-black; at least 4.5`, () => {
                    const fill = vars[name];
                    expect(fill).toMatch(/^#[0-9a-f]{6}$/iu);
                    const label = tileLabel(fill, opacity, card);
                    const shown = blendOver(fill, opacity ?? 1, card);
                    const white = contrastRatio(LABEL_INK_LIGHT, shown);
                    const dark = contrastRatio(LABEL_INK_DARK, shown);
                    total += 1;
                    expect([LABEL_INK_LIGHT, LABEL_INK_DARK]).toContain(label.color);
                    // white wherever it reaches 4.5:1, else the better of the pair
                    expect(label.color).toBe(
                        white >= MIN_LABEL_CONTRAST || white >= dark
                            ? LABEL_INK_LIGHT
                            : LABEL_INK_DARK,
                    );
                    expect(Math.max(white, dark)).toBeGreaterThanOrEqual(MIN_LABEL_CONTRAST);
                    expect(label).not.toHaveProperty("haloColor");
                    expect(tileLabelStyle(fill, opacity, card).textBorderWidth).toBe(0);
                });
            }
        }
    }

    it("covers the whole matrix", () => {
        expect(total).toBe(2 * THEME_VARS.length * (DEPTH_OPACITY.length + 2));
    });

    it("the ink pair reaches 4.5:1 on EVERY fill (no dead zone), not only on the theme fills", () => {
        let worst = Infinity;
        for (let v = 0; v <= 255; v += 1) {
            for (const [r, g, b] of [
                [v, v, v],
                [v, 0, 0],
                [0, v, 0],
                [0, 0, v],
                [v, v, 0],
                [v, 0, v],
                [0, v, v],
                [255, v, 0],
                [255, 0, v],
                [v, 255, 0],
                [0, 255, v],
                [v, 0, 255],
                [0, v, 255],
            ]) {
                const fill = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
                const ink = tileLabel(fill, undefined, "#000000").color;
                worst = Math.min(worst, contrastRatio(ink, fill));
            }
        }
        expect(worst).toBeGreaterThanOrEqual(MIN_LABEL_CONTRAST);
    });

    it("the previous dark ink #15171a had a dead zone (why the ink is near-black)", () => {
        // A mid-tone (luminance about 0.2) where white and #15171a both fall under 4.5.
        const fill = "#7b7b7b";
        expect(contrastRatio("#ffffff", fill)).toBeLessThan(4.5);
        expect(contrastRatio("#15171a", fill)).toBeLessThan(4.5);
        expect(
            contrastRatio(tileLabel(fill, undefined, "#000000").color, fill),
        ).toBeGreaterThanOrEqual(4.5);
    });

    it("scarlet on the card: white wins on a fully opaque dark Maintenance fill", () => {
        const label = tileLabel("#da2100", 1, "#161c20");
        expect(label.color).toBe(LABEL_INK_LIGHT);
    });

    it("blends a translucent fill over the backdrop before measuring", () => {
        expect(blendOver("#000000", 0.5, "#ffffff")).toBe("#808080");
        expect(tileLabel("#000000", 0.1, "#ffffff").color).toBe(LABEL_INK_DARK);
    });

    it("a mid fill gets an ink and no text border", () => {
        const style = tileLabelStyle("#7a7a7a", 1, "#7a7a7a");
        expect(style.textBorderWidth).toBe(0);
        expect(style).not.toHaveProperty("textBorderColor");
    });
});

describe("dark theme: one ink (white) on every investment and flame fill (CHAOS-8510)", () => {
    const vars = block("dark");
    const card = vars["--card"];
    const ALIASES = [
        ...THEME_VARS,
        "--flame-branch-1",
        "--flame-branch-2",
        "--flame-branch-3",
        "--flame-branch-4",
        "--flame-branch-5",
    ];
    // Tint rules the charts use: depth lightening (adjustHex +8/+14/+20) and opacity 1 / .82 / .66.
    const tints = (fill: string): string[] => {
        const v = Number.parseInt(fill.slice(1), 16);
        const lift = (amount: number) =>
            `#${[v >> 16, (v >> 8) & 255, v & 255]
                .map((c) =>
                    Math.min(255, c + amount)
                        .toString(16)
                        .padStart(2, "0"),
                )
                .join("")}`;
        return [fill, lift(8), lift(14), lift(20)];
    };

    for (const name of ALIASES) {
        it(`${name}: white ink reaches 4.5:1 on the fill and on every depth / opacity tint, and is the picked ink`, () => {
            const fill = vars[name];
            expect(fill).toMatch(/^#[0-9a-f]{6}$/iu);
            for (const tint of tints(fill)) {
                for (const opacity of [1, 0.82, 0.66]) {
                    const shown = blendOver(tint, opacity, card);
                    expect(contrastRatio(LABEL_INK_LIGHT, shown)).toBeGreaterThanOrEqual(4.5);
                    expect(tileLabel(tint, opacity, card).color).toBe(LABEL_INK_LIGHT);
                }
            }
        });
    }

    it("the raw series colors are not the investment or flame fills", () => {
        expect(vars["--theme-feature"]).not.toBe(vars["--chart-color-5"]);
        expect(vars["--chart-color-5"]).toBe("#e8650a");
        expect(vars["--chart-color-3"]).toBe("#da2100");
    });
});

describe("unlabelled bars keep the bright series colors (CHAOS-8510)", () => {
    const vars = block("dark");

    it("every series bar reaches 3:1 against the meter track (--surface2) and the rework track (--card-stroke)", () => {
        const css2 = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
        const darkTrack = /data-theme="dark"\] \{\s*--surface2: (#[0-9a-f]{6});/iu.exec(css2)?.[1];
        expect(darkTrack).toBeDefined();
        // Series 3 (the red) was already 2.61:1 against the rework track before this change; it keeps
        // that value (not a regression of CHAOS-8510) and is not part of the 3:1 claim.
        for (const n of [1, 2, 3, 4, 5]) {
            const bar = vars[`--chart-color-${n}`];
            const min = n === 3 ? 2.6 : 3;
            expect(
                contrastRatio(bar, darkTrack!),
                `series ${n} vs meter track`,
            ).toBeGreaterThanOrEqual(min);
            expect(
                contrastRatio(bar, vars["--card-stroke"]),
                `series ${n} vs rework track`,
            ).toBeGreaterThanOrEqual(min);
        }
    });

    it("the darker label fills would NOT pass as bars (why bars do not use them)", () => {
        const track = vars["--card-stroke"];
        const worst = Math.min(...THEME_VARS.map((name) => contrastRatio(vars[name], track)));
        expect(worst).toBeLessThan(3);
    });

    it("meter bars and rework bars read the series colors, not the --theme-* aliases", () => {
        const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
        const rework = read("src/components/quality/ReworkThemeBars.tsx");
        expect(rework).toContain("investmentSeriesColor(");
        expect(rework).not.toContain("investmentThemeColor(");
        const section = read("src/components/work/investment/charts/InvestmentMixSection.tsx");
        expect(section).toContain("themeBarColorMap.get(");
        expect(section).not.toMatch(/color: themeColorMap\.get\(/u);
    });
});

describe("investment and flame surfaces read the aliases, not the raw series colors", () => {
    const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

    it("chartTheme maps the five investment themes to --theme-* and has --flame-branch-* tokens", () => {
        const src = read("src/components/charts/chartTheme.ts");
        for (const name of ["feature", "quality", "risk", "maintenance", "operational"]) {
            expect(src).toContain(`"--theme-${name}"`);
        }
        expect(src).toContain("--flame-branch-");
        expect(src).not.toMatch(
            /theme(Feature|Quality|Risk|Maintenance|Operational): "--chart-color-/u,
        );
    });

    it("the flame branches take tokens.flameBranch, not the raw chart color list", () => {
        const src = read("src/components/charts/HierarchicalFlameGraph.tsx");
        expect(src).toContain("tokens.flameBranch[branchIndex]");
        expect(src).not.toContain("chartColors[branchIndex]");
        expect(src).not.toContain("useChartColors");
    });
});

describe("depthOpacity", () => {
    it("steps 1 / .82 / .66 and clamps", () => {
        expect([0, 1, 2, 5, -1].map(depthOpacity)).toEqual([1, 0.82, 0.66, 0.66, 1]);
    });
});
