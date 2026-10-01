import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const infinityCss = read("../../app/fc-infinity-themes.css");
const globalsCss = read("../../app/globals.css");

type Theme = "light" | "dark";
type Rgb = readonly [number, number, number];

const getBlock = (css: string, palette: string, theme: Theme): Record<string, string> => {
    const selector = `:root[data-palette="${palette}"][data-theme="${theme}"] {`;
    const start = css.indexOf(selector);
    expect(start, `${palette}/${theme} block`).toBeGreaterThanOrEqual(0);
    const end = css.indexOf("\n}", start);
    const body = css.slice(start + selector.length, end);
    const tokens: Record<string, string> = {};
    for (const match of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gu)) {
        tokens[match[1]] = match[2].trim();
    }
    return tokens;
};

const toRgb = (hex: string): Rgb => {
    expect(hex).toMatch(/^#[0-9a-f]{6}$/u);
    return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Rgb;
};

const linearize = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
    const [r, g, b] = toRgb(hex).map(linearize);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

// Machado et al. 2009 severity 1.0 matrices, applied in linear sRGB.
const CVD: Record<"protanopia" | "deuteranopia", number[][]> = {
    protanopia: [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
    ],
    deuteranopia: [
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501, 0.047413],
        [-0.01182, 0.04294, 0.968881],
    ],
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toOklab = ([r, g, b]: number[]) => {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
};
const simulate = (hex: string, kind: keyof typeof CVD) => {
    const lin = toRgb(hex).map(linearize);
    return CVD[kind].map((row) => clamp01(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
};
/** OKLab distance on a 0-100 scale. */
const deltaE = (a: string, b: string, kind: keyof typeof CVD) => {
    const x = toOklab(simulate(a, kind));
    const y = toOklab(simulate(b, kind));
    return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

// A pair between 6 and 8 would be recorded here with a reason, not passed.
const RECORDED_EXCEPTIONS: Record<string, string> = {};

const THEMES: Theme[] = ["light", "dark"];
const infinity = (theme: Theme) => getBlock(infinityCss, "infinity", theme);
const series = (theme: Theme) => [1, 2, 3, 4, 5].map((n) => infinity(theme)[`--chart-color-${n}`]);

describe("infinity palette", () => {
    it.each(THEMES)("keeps text readable on its surfaces (%s)", (theme) => {
        const t = infinity(theme);
        for (const surface of [t["--background"], t["--card"], t["--surface"]]) {
            expect(contrast(t["--text-primary"], surface)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(t["--text-secondary"], surface)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(t["--text-muted"], surface)).toBeGreaterThanOrEqual(3);
            expect(contrast(t["--chart-muted"], surface)).toBeGreaterThanOrEqual(3);
        }
        expect(contrast(t["--chart-text"], t["--card"])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t["--accent-foreground"], t["--accent"])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t["--accent-2"], t["--card"])).toBeGreaterThanOrEqual(3);
        for (const status of ["--positive", "--caution", "--negative", "--info"]) {
            expect(contrast(t[status], t["--card"]), status).toBeGreaterThanOrEqual(4.5);
        }
    });

    it.each(THEMES)("keeps every chart series visible on the chart surface (%s)", (theme) => {
        const t = infinity(theme);
        for (let n = 1; n <= 10; n += 1) {
            expect(
                contrast(t[`--chart-color-${n}`], t["--card"]),
                `series ${n}`,
            ).toBeGreaterThanOrEqual(3);
        }
    });

    it.each(THEMES)(
        "keeps adjacent series distinct under protanopia and deuteranopia (%s)",
        (theme) => {
            const colors = series(theme);
            for (let i = 0; i < colors.length - 1; i += 1) {
                for (const kind of ["protanopia", "deuteranopia"] as const) {
                    const key = `${theme}:${i + 1}-${i + 2}:${kind}`;
                    const distance = deltaE(colors[i], colors[i + 1], kind);
                    if (key in RECORDED_EXCEPTIONS) {
                        expect(distance, key).toBeGreaterThanOrEqual(6);
                        expect(distance, key).toBeLessThan(8);
                    } else {
                        expect(distance, key).toBeGreaterThanOrEqual(8);
                    }
                }
            }
        },
    );

    it.each(THEMES)(
        "fixes investment theme colors by entity and defines the ramp and zones (%s)",
        (theme) => {
            const t = infinity(theme);
            expect(t["--theme-feature"]).toBe("var(--chart-color-5)");
            expect(t["--theme-quality"]).toBe("var(--chart-color-4)");
            expect(t["--theme-risk"]).toBe("var(--chart-color-2)");
            expect(t["--theme-maintenance"]).toBe("var(--chart-color-3)");
            expect(t["--theme-operational"]).toBe("var(--chart-color-1)");
            const ramp = [0, 1, 2, 3, 4, 5].map((n) => luminance(t[`--seq-${n}`]));
            const sorted = [...ramp].sort((a, b) => (theme === "light" ? b - a : a - b));
            expect(ramp).toEqual(sorted);
            for (let n = 1; n <= 4; n += 1) {
                expect(t[`--quadrant-zone-${n}`]).toMatch(/^#[0-9a-f]{6}$/u);
            }
        },
    );

    it.each(THEMES)("defines every token the removed palettes defined (%s)", (theme) => {
        const required = [
            "--background",
            "--foreground",
            "--ink-muted",
            "--accent",
            "--accent-foreground",
            "--accent-1",
            "--accent-2",
            "--accent-3",
            "--accent-negative",
            "--accent-highlight",
            "--card",
            "--card-stroke",
            "--chart-grid",
            "--chart-text",
            "--chart-muted",
            ...Array.from({ length: 10 }, (_, i) => `--chart-color-${i + 1}`),
            "--hero-gradient",
            "--app-gradient",
            "--surface",
            "--surface-raised",
            "--border",
            "--text-primary",
            "--text-secondary",
            "--text-muted",
            "--positive",
            "--caution",
            "--negative",
            "--info",
            "--accent-ai",
        ];
        const defined = new Set(Object.keys(infinity(theme)));
        expect(required.filter((name) => !defined.has(name))).toEqual([]);
    });

    it("ships no other palette block", () => {
        const names = new Set(
            [...infinityCss.matchAll(/data-palette="([^"]+)"/gu)].map((m) => m[1]),
        );
        expect([...names]).toEqual(["infinity"]);
        expect(globalsCss).not.toMatch(/data-palette="(?!infinity")[^"]+"\]\[data-theme/u);
    });

    it("is the default and the only palette the runtime sets", () => {
        expect(read("../../app/layout.tsx")).toContain('data-palette="infinity"');
        const toggle = read("../../components/ThemeToggle.tsx");
        const prefs = read("../../components/settings/PreferencesSettings.tsx");
        expect(toggle).not.toMatch(/palette/iu);
        expect(prefs).not.toMatch(/palette/iu);
    });

    it.each(["fullchaos-infinity-knot-redux", "material", "tailwind", "garbage", null, "infinity"])(
        "theme-init resolves a stored palette of %s to infinity before paint",
        (stored) => {
            const dataset: Record<string, string> = { palette: "fullchaos-infinity-knot-redux" };
            const doc = { documentElement: { dataset, style: {} as Record<string, string> } };
            const storage = {
                getItem: (key: string) => (key === "palette" ? stored : "dark"),
            };
            new Function("document", "localStorage", read("../../../public/theme-init.js"))(
                doc,
                storage,
            );
            expect(dataset.palette).toBe("infinity");
            expect(dataset.theme).toBe("dark");
        },
    );

    it("theme-init still sets infinity when storage throws", () => {
        const dataset: Record<string, string> = {};
        const doc = { documentElement: { dataset, style: {} as Record<string, string> } };
        const storage = {
            getItem: () => {
                throw new Error("blocked");
            },
        };
        new Function("document", "localStorage", read("../../../public/theme-init.js"))(
            doc,
            storage,
        );
        expect(dataset.palette).toBe("infinity");
    });
});
