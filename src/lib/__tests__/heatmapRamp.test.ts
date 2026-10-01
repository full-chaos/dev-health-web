import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
    contrastRatio,
    pickTextColor,
    rampColor,
    rampPosition,
    scaleMidpoint,
} from "../heatmapRamp";

const css = readFileSync(new URL("../../app/fc-infinity-themes.css", import.meta.url), "utf8");

type Theme = "light" | "dark";
const THEMES: Theme[] = ["light", "dark"];

const tokens = (theme: Theme): Record<string, string> => {
    const selector = `:root[data-palette="infinity"][data-theme="${theme}"] {`;
    const start = css.indexOf(selector);
    const end = css.indexOf("\n}", start);
    const out: Record<string, string> = {};
    for (const match of css
        .slice(start + selector.length, end)
        .matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gu)) {
        out[match[1]] = match[2].trim();
    }
    return out;
};

const lab = (hex: string) => {
    const lin = [1, 3, 5].map((i) => {
        const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const [r, g, b] = lin;
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
};
const deltaE = (a: string, b: string) => {
    const x = lab(a);
    const y = lab(b);
    return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

describe("heatmap ramp tokens", () => {
    it.each(THEMES)("steps strictly in lightness, one direction (%s)", (theme) => {
        const t = tokens(theme);
        const lightness = [0, 1, 2, 3, 4, 5].map((n) => lab(t[`--seq-${n}`])[0]);
        const diffs = lightness.slice(1).map((v, i) => v - lightness[i]);
        const direction = Math.sign(diffs[0]);
        expect(direction).not.toBe(0);
        diffs.forEach((diff) => expect(Math.sign(diff)).toBe(direction));
    });

    it.each(THEMES)("keeps adjacent steps apart (%s)", (theme) => {
        const t = tokens(theme);
        for (let n = 0; n < 5; n += 1) {
            expect(
                deltaE(t[`--seq-${n}`], t[`--seq-${n + 1}`]),
                `step ${n} to ${n + 1}`,
            ).toBeGreaterThanOrEqual(6);
        }
    });

    it.each(THEMES)("draws an empty cell apart from the lightest step (%s)", (theme) => {
        const t = tokens(theme);
        // An empty cell is the card surface, not step 0: missing is not zero.
        expect(deltaE(t["--card"], t["--seq-0"])).toBeGreaterThanOrEqual(6);
    });

    it.each(THEMES)("keeps text readable on the lightest and darkest steps (%s)", (theme) => {
        const t = tokens(theme);
        const lightness = [0, 5].map((n) => lab(t[`--seq-${n}`])[0]);
        const ends = lightness[0] > lightness[1] ? [0, 5] : [5, 0];
        for (const n of ends) {
            const fill = t[`--seq-${n}`];
            const text = pickTextColor(fill, [t["--text-primary"], t["--card"]]);
            expect(contrastRatio(text, fill), `step ${n}`).toBeGreaterThanOrEqual(4.5);
        }
    });
});

describe("heatmap ramp helpers", () => {
    const ramp = ["#000000", "#808080", "#ffffff"];

    it("returns the end stops at 0 and 1 and interpolates between", () => {
        expect(rampColor(0, ramp)).toBe("#000000");
        expect(rampColor(1, ramp)).toBe("#ffffff");
        expect(rampColor(0.25, ramp)).toBe("#404040");
        expect(rampColor(2, ramp)).toBe("#ffffff");
    });

    it("positions values on a linear and a log scale", () => {
        expect(rampPosition(5, 0, 10)).toBe(0.5);
        expect(rampPosition(0, 0, 99, "log")).toBe(0);
        expect(rampPosition(9, 0, 99, "log")).toBe(0.5);
        expect(rampPosition(3, 3, 3)).toBe(1);
    });

    it("finds the middle label of the scale", () => {
        expect(scaleMidpoint(0, 10, "linear")).toBe(5);
        expect(scaleMidpoint(0, 99, "log")).toBeCloseTo(9);
    });
});
