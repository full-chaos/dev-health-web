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
                it(`${mode} ${name} opacity ${opacity ?? "none"}: ink = higher contrast, at least 4.5`, () => {
                    const fill = vars[name];
                    expect(fill).toMatch(/^#[0-9a-f]{6}$/iu);
                    const label = tileLabel(fill, opacity, card);
                    const shown = blendOver(fill, opacity ?? 1, card);
                    const white = contrastRatio(LABEL_INK_LIGHT, shown);
                    const dark = contrastRatio(LABEL_INK_DARK, shown);
                    total += 1;
                    expect([LABEL_INK_LIGHT, LABEL_INK_DARK]).toContain(label.color);
                    expect(contrastRatio(label.color, shown)).toBe(Math.max(white, dark));
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

describe("depthOpacity", () => {
    it("steps 1 / .82 / .66 and clamps", () => {
        expect([0, 1, 2, 5, -1].map(depthOpacity)).toEqual([1, 0.82, 0.66, 0.66, 1]);
    });
});
