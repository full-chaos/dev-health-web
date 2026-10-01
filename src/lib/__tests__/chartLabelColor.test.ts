import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    DEPTH_OPACITY,
    MIN_LABEL_CONTRAST,
    blendOver,
    depthOpacity,
    tileLabelColor,
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

describe("tileLabelColor", () => {
    for (const mode of ["light", "dark"] as const) {
        const vars = block(mode);
        const ink = vars["--chart-text"];
        const card = vars["--card"];
        for (const name of THEME_VARS) {
            for (const opacity of [undefined, ...DEPTH_OPACITY]) {
                it(`${mode} ${name} opacity ${opacity ?? "none"}: picks a >=4.5 color or hides`, () => {
                    const fill = vars[name];
                    expect(fill).toMatch(/^#[0-9a-f]{6}$/iu);
                    const pick = tileLabelColor(fill, opacity, card, [ink, card]);
                    const shown = blendOver(fill, opacity ?? 1, card);
                    const best = Math.max(contrastRatio(ink, shown), contrastRatio(card, shown));
                    if (pick === null) {
                        expect(best).toBeLessThan(MIN_LABEL_CONTRAST);
                    } else {
                        expect([ink, card]).toContain(pick);
                        expect(contrastRatio(pick, shown)).toBeGreaterThanOrEqual(
                            MIN_LABEL_CONTRAST,
                        );
                        expect(contrastRatio(pick, shown)).toBe(best);
                    }
                });
            }
        }
    }

    it("hides the label when neither candidate passes", () => {
        expect(tileLabelColor("#808080", 1, "#808080", ["#8a8a8a", "#777777"])).toBeNull();
    });

    it("blends a translucent fill over the backdrop before measuring", () => {
        expect(blendOver("#000000", 0.5, "#ffffff")).toBe("#808080");
        // a dark fill at low opacity over white reads light: dark ink wins
        expect(tileLabelColor("#000000", 0.1, "#ffffff", ["#ffffff", "#111111"])).toBe("#111111");
    });
});

describe("depthOpacity", () => {
    it("steps 1 / .82 / .66 and clamps", () => {
        expect([0, 1, 2, 5, -1].map(depthOpacity)).toEqual([1, 0.82, 0.66, 0.66, 1]);
    });
});
