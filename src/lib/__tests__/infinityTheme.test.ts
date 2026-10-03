import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZONE_GRADIENT_ALPHA } from "../themeTints";
import { NODE_TYPE_COLOR_SOURCE } from "../workGraphNodeColors";

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

const toHex = (linear: number[]) =>
    `#${linear
        .map((v) =>
            Math.round(clamp01(v) * 255)
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
/** The color a canvas or CSS paints for `foreground` at `alpha` over `background` (sRGB blend). */
const over = (foreground: string, background: string, alpha: number) =>
    toHex(toRgb(foreground).map((v, i) => v * alpha + toRgb(background)[i] * (1 - alpha)));
/** OKLab distance on a 0-100 scale, normal vision. */
const deltaENormal = (a: string, b: string) => {
    const x = toOklab(toRgb(a).map(linearize));
    const y = toOklab(toRgb(b).map(linearize));
    return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

// A pair between 6 and 8 would be recorded here with a reason, not passed.
const RECORDED_EXCEPTIONS: Record<string, string> = {};

const THEMES: Theme[] = ["light", "dark"];
const infinity = (theme: Theme) => getBlock(infinityCss, "infinity", theme);
const series = (theme: Theme) => [1, 2, 3, 4, 5].map((n) => infinity(theme)[`--chart-color-${n}`]);
const allSeries = (theme: Theme) =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => infinity(theme)[`--chart-color-${n}`]);

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
        "keeps adjacent series distinct for all ten series, under protanopia and deuteranopia (%s)",
        (theme) => {
            const colors = allSeries(theme);
            for (let i = 0; i < colors.length - 1; i += 1) {
                for (const kind of ["protanopia", "deuteranopia"] as const) {
                    const key = `${theme}:${i + 1}-${i + 2}:${kind}`;
                    expect(deltaE(colors[i], colors[i + 1], kind), key).toBeGreaterThanOrEqual(8);
                }
            }
        },
    );

    // CHAOS-7892: series 3, 7 and 8 were the same red, brown and red as --negative and --caution, so
    // Work Graph node types (Deployment, Diff, Review outcome, Incident) and legend dots looked alike.
    it.each(THEMES)(
        "keeps series 3, 7 and 8 at least 15 dE from the status colors and from each other (%s)",
        (theme) => {
            const t = infinity(theme);
            const colors = allSeries(theme);
            const slots = { "series 3": colors[2], "series 7": colors[6], "series 8": colors[7] };
            const status = {
                "--negative": t["--negative"],
                "--caution": t["--caution"],
                "--positive": t["--positive"],
            };
            for (const [name, hex] of Object.entries(slots)) {
                for (const [token, value] of Object.entries(status)) {
                    expect(
                        deltaENormal(hex, value),
                        `${theme} ${name} vs ${token}`,
                    ).toBeGreaterThanOrEqual(15);
                }
            }
            const names = Object.keys(slots) as (keyof typeof slots)[];
            for (let a = 0; a < names.length; a += 1) {
                for (let b = a + 1; b < names.length; b += 1) {
                    expect(
                        deltaENormal(slots[names[a]], slots[names[b]]),
                        `${theme} ${names[a]} vs ${names[b]}`,
                    ).toBeGreaterThanOrEqual(15);
                }
            }
        },
    );

    it.each(THEMES)(
        "draws the Work Graph node types that collided in four distinct colors (%s)",
        (theme) => {
            const t = infinity(theme);
            const colors = allSeries(theme);
            const colorOf = (type: keyof typeof NODE_TYPE_COLOR_SOURCE) => {
                const source = NODE_TYPE_COLOR_SOURCE[type];
                return source === "negative" ? t["--negative"] : colors[source];
            };
            const types = ["DEPLOYMENT", "DIFF", "REVIEW_OUTCOME", "INCIDENT"] as const;
            for (let a = 0; a < types.length; a += 1) {
                for (let b = a + 1; b < types.length; b += 1) {
                    expect(
                        deltaENormal(colorOf(types[a]), colorOf(types[b])),
                        `${theme} ${types[a]} vs ${types[b]}`,
                    ).toBeGreaterThanOrEqual(15);
                }
            }
        },
    );

    it("pins the CHAOS-7892 series picks and leaves the other series alone", () => {
        const light = allSeries("light");
        const dark = allSeries("dark");
        expect(light).toEqual([
            "#0087a9",
            "#c88600",
            "#2525d0",
            "#00a2b8",
            "#f06a00",
            "#075a72",
            "#e052a7",
            "#771782",
            "#656c73",
            "#2f353b",
        ]);
        expect(dark).toEqual([
            "#0b8fb0",
            "#c98500",
            "#da2100",
            "#02a2bc",
            "#e8650a",
            "#4fd3df",
            "#7d49ca",
            "#e56ce5",
            "#808990",
            "#a7afb5",
        ]);
    });

    it.each(THEMES)(
        "fixes investment theme colors by entity and defines the ramp and zones (%s)",
        (theme) => {
            const t = infinity(theme);
            // Light: the investment themes are the series colors. Dark (CHAOS-8510): their own darker
            // fills, so one ink (white) fits every tile; the raw series colors stay as they are.
            const alias =
                theme === "light"
                    ? {
                          "--theme-feature": "var(--chart-color-5)",
                          "--theme-quality": "var(--chart-color-4)",
                          "--theme-risk": "var(--chart-color-2)",
                          "--theme-maintenance": "var(--chart-color-3)",
                          "--theme-operational": "var(--chart-color-1)",
                      }
                    : {
                          "--theme-feature": "#a64807",
                          "--theme-quality": "#016e7f",
                          "--theme-risk": "#885a00",
                          "--theme-maintenance": "#cc1f00",
                          "--theme-operational": "#086d86",
                      };
            for (const [name, value] of Object.entries(alias)) expect(t[name]).toBe(value);
            expect(t["--chart-color-3"]).toBe(theme === "light" ? "#2525d0" : "#da2100");
            const ramp = [0, 1, 2, 3, 4, 5].map((n) => luminance(t[`--seq-${n}`]));
            const sorted = [...ramp].sort((a, b) => (theme === "light" ? b - a : a - b));
            expect(ramp).toEqual(sorted);
            for (let n = 1; n <= 4; n += 1) {
                expect(t[`--quadrant-zone-${n}`]).toMatch(/^#[0-9a-f]{6}$/u);
            }
        },
    );

    it("keeps production's zone gradient alphas (peak .20, mid .12, rim 0)", () => {
        expect(ZONE_GRADIENT_ALPHA).toEqual({ peak: 0.2, mid: 0.12, edge: 0 });
    });

    it.each(THEMES)(
        "draws each quadrant zone visibly and apart from its neighbours (%s)",
        (theme) => {
            const t = infinity(theme);
            const zoneAt = (alpha: number) =>
                [1, 2, 3, 4].map((n) => over(t[`--quadrant-zone-${n}`], t["--card"], alpha));
            // The gradient peak is the zone's strongest tint: it must read against the surface.
            const peak = zoneAt(ZONE_GRADIENT_ALPHA.peak);
            peak.forEach((fill, i) => {
                expect(
                    deltaENormal(fill, t["--card"]),
                    `zone ${i + 1} peak vs chart surface`,
                ).toBeGreaterThanOrEqual(4);
            });
            // Zones sit in a 2 x 2 grid in the ring 1-2-3-4: each neighbours the next.
            for (const [a, b] of [
                [1, 2],
                [2, 3],
                [3, 4],
                [4, 1],
            ]) {
                expect(
                    deltaENormal(peak[a - 1], peak[b - 1]),
                    `zone ${a} vs ${b} at the peak`,
                ).toBeGreaterThanOrEqual(3);
            }
            // Text drawn on a zone keeps its contrast at the strongest tint.
            for (const fill of peak) {
                expect(contrast(t["--chart-text"], fill)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(t["--chart-muted"], fill)).toBeGreaterThanOrEqual(3);
            }
            // Most of a zone sits at the mid alpha; the focused point (series 1) must read there.
            for (const fill of zoneAt(ZONE_GRADIENT_ALPHA.mid)) {
                expect(
                    contrast(t["--chart-color-1"], fill),
                    "focus point on zone",
                ).toBeGreaterThanOrEqual(3);
            }
        },
    );

    it.each(THEMES)(
        "keeps orange text and muted ink readable on cards, the page and tints (%s)",
        (theme) => {
            const t = infinity(theme);
            const surfaces: Record<string, string> = {
                card: t["--card"],
                page: t["--background"],
            };
            for (const alpha of [0.05, 0.1, 0.15]) {
                surfaces[`accent ${alpha} on card`] = over(t["--accent"], t["--card"], alpha);
                surfaces[`accent ${alpha} on page`] = over(t["--accent"], t["--background"], alpha);
            }
            // Warm cards (amber-50 "needs attention" tint) exist in the light theme.
            if (theme === "light") {
                surfaces["warm tint"] = "#f1e9db";
            }
            for (const [name, fill] of Object.entries(surfaces)) {
                expect(
                    contrast(t["--accent-text"], fill),
                    `accent text on ${name}`,
                ).toBeGreaterThanOrEqual(4.5);
                expect(
                    contrast(t["--ink-muted"], fill),
                    `ink-muted on ${name}`,
                ).toBeGreaterThanOrEqual(4.5);
                expect(
                    contrast(t["--text-muted"], fill),
                    `text-muted on ${name}`,
                ).toBeGreaterThanOrEqual(4.5);
            }
        },
    );

    it("pins the muted ink values: light as before, dark one notch lighter", () => {
        // CHAOS-7746: light muted ink one notch darker so it reads on warm cards and tints.
        expect(infinity("light")["--text-muted"]).toBe("#585e65");
        expect(infinity("light")["--ink-muted"]).toBe("#585e65");
        const dark = infinity("dark");
        // CHAOS-8141: dark orange text is the prototype's --accentInk #ffab66 (6.79:1 on the card), not the flat accent.
        expect(dark["--accent-text"]).toBe("#ffab66");
        expect(dark["--ink-muted"]).toBe("#a7afb5");
        expect(dark["--text-muted"]).toBe("#8b959c");
    });

    // CHAOS-7746: text pairs that measured 4.05 to 4.49 in the light sweep (surfaces are the measured
    // composites) plus every own-family tint of the token, 5 to 20 percent over card and page.
    const rgbHex = (r: number, g: number, b: number) =>
        `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    const light7746 = () => {
        const t = infinity("light");
        const tints = (token: string, alphas: number[]) =>
            alphas.flatMap((a) => [
                over(t[token], t["--card"], a),
                over(t[token], t["--background"], a),
            ]);
        const everyTint = [
            "--positive",
            "--info",
            "--caution",
            "--negative",
            "--accent",
            "--accent-2",
        ].flatMap((token) => tints(token, [0.05, 0.1, 0.12, 0.15]));
        return {
            t,
            checks: [
                {
                    token: "--accent-2",
                    surfaces: [
                        rgbHex(229, 223, 214),
                        rgbHex(215, 228, 225),
                        rgbHex(222, 236, 239),
                        t["--card"],
                        t["--background"],
                        ...tints("--accent-2", [0.05, 0.1, 0.12, 0.2]),
                    ],
                },
                {
                    token: "--positive",
                    surfaces: [
                        rgbHex(215, 228, 225),
                        rgbHex(217, 231, 226),
                        rgbHex(222, 235, 231),
                        t["--card"],
                        t["--background"],
                        ...tints("--positive", [0.05, 0.1, 0.12, 0.15, 0.2]),
                    ],
                },
                ...["--caution", "--accent-3"].map((token) => ({
                    token,
                    surfaces: [
                        rgbHex(227, 214, 194),
                        rgbHex(230, 217, 199),
                        t["--card"],
                        t["--background"],
                        ...tints("--caution", [0.05, 0.1, 0.12, 0.15, 0.2]),
                    ],
                })),
                ...["--ink-muted", "--text-muted"].map((token) => ({
                    token,
                    surfaces: [
                        rgbHex(219, 214, 207),
                        rgbHex(232, 216, 215),
                        t["--card"],
                        t["--background"],
                        ...everyTint,
                    ],
                })),
            ],
        };
    };

    it("keeps the five light text tokens at 4.5:1 on the measured surfaces and every own tint", () => {
        const { t, checks } = light7746();
        for (const { token, surfaces } of checks) {
            for (const surface of surfaces) {
                expect(
                    contrast(t[token], surface),
                    `${token} on ${surface}`,
                ).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it("pins the CHAOS-7746 light picks and keeps accent-2 equal to info, accent-3 to caution", () => {
        const light = infinity("light");
        expect(light["--accent-2"]).toBe("#03627d");
        expect(light["--info"]).toBe("#03627d");
        expect(light["--positive"]).toBe("#18664d");
        expect(light["--caution"]).toBe("#7d4f00");
        expect(light["--accent-3"]).toBe("#7d4f00");
        // Chart colors are not touched by this ticket (series 3, 7 and 8 are CHAOS-7892, pinned below).
        expect(light["--chart-color-1"]).toBe("#0087a9");
    });

    // Pin of the whole dark block: CHAOS-7746 left it byte-equal; CHAOS-7892 changed exactly dark series 7
    // and 8 (the diff of this hash is those two lines); CHAOS-8061 added exactly --action and --on-action;
    // CHAOS-8141 added --accent-wash and --accent-ink and set --accent-text to #ffab66 (4 lines);
    // CHAOS-8171 added the four --*-wash status tokens (comment line + 4 lines); --deemph added (CHAOS-8171 follow-up); CHAOS-8510 set the five --theme-* to darker dark fills and added --flame-branch-1..5.
    it("leaves the dark block byte for byte as pinned", () => {
        const block = infinityCss.match(
            /:root\[data-palette="infinity"\]\[data-theme="dark"\] \{([\s\S]*?)\n\}/u,
        );
        expect(block).not.toBeNull();
        expect(createHash("sha256").update(block![1]).digest("hex")).toBe(
            "9175d6e0dab926af6604b054093ad04995f996109d8611fe2ccaade5f65bfa8f",
        );
    });

    it.each([
        ["light", "#037493"],
        ["dark", "#0a7f9c"],
    ] as const)(
        "filled action (primary button) is the approved blue with white text (%s)",
        (theme, fill) => {
            const t = infinity(theme);
            expect(t["--action"]).toBe(fill);
            expect(t["--on-action"]).toBe("#ffffff");
            expect(contrast(t["--on-action"], t["--action"])).toBeGreaterThanOrEqual(4.5);
        },
    );

    it.each(THEMES)(
        "keeps production's solid caution strip: amber fill, black ink (%s)",
        (theme) => {
            const t = infinity(theme);
            expect(t["--caution-solid"]).toBe("#fe9a00");
            expect(t["--on-caution-solid"]).toBe("#000000");
            expect(contrast(t["--on-caution-solid"], t["--caution-solid"])).toBeGreaterThanOrEqual(
                9.7,
            );
        },
    );

    it.each(THEMES)(
        "keeps action text readable on cards, the page and action tints (%s)",
        (theme) => {
            const t = infinity(theme);
            // Links and actions use --accent-2 (the action color) on cards and the page...
            for (const [name, fill] of Object.entries({
                card: t["--card"],
                page: t["--background"],
                "action 5 on card": over(t["--accent-2"], t["--card"], 0.05),
            })) {
                expect(
                    contrast(t["--accent-2"], fill),
                    `action text on ${name}`,
                ).toBeGreaterThanOrEqual(4.5);
            }
            // ...and --info on the tinted action pills (--accent-2 at 5 to 20 percent).
            for (const alpha of [0.05, 0.1, 0.2]) {
                for (const base of [t["--card"], t["--background"]]) {
                    const fill = over(t["--accent-2"], base, alpha);
                    expect(
                        contrast(t["--info"], fill),
                        `info on action ${alpha}`,
                    ).toBeGreaterThanOrEqual(4.5);
                }
            }
        },
    );

    it("defines --deemph as the prototype sparkline stroke", () => {
        expect(infinity("light")["--deemph"]).toBe("#9aa2a9");
        expect(infinity("dark")["--deemph"]).toBe("#5f6a72");
    });

    it.each(THEMES)(
        "keeps status pill and Notice text readable on the status wash (%s)",
        (theme) => {
            const t = infinity(theme);
            // Pills and Notices: status token as text on the status wash token (prototype greenWash etc.),
            // and the Notice body ink (--ink-muted) on the same wash.
            for (const k of ["positive", "caution", "negative", "info"]) {
                const wash = t[`--${k}-wash`];
                expect(wash, `--${k}-wash is defined`).toBeDefined();
                expect(contrast(t[`--${k}`], wash), `${k} on wash`).toBeGreaterThanOrEqual(4.5);
                expect(
                    contrast(t["--ink-muted"], wash),
                    `ink-muted on ${k} wash`,
                ).toBeGreaterThanOrEqual(4.5);
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
            "--accent-text",
            "--caution-solid",
            "--on-caution-solid",
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

// CHAOS-8141: selected-control tokens from the approved prototype (theme.css:18 --accentWash/--accentInk,
// dark-tokens.css:5), with the web's AA ink where the prototype value fails 4.5:1.
describe("infinity selected-control tokens (CHAOS-8141)", () => {
    it.each([
        ["light", "#ffe9da", "#b1361a"],
        ["dark", "#3a2110", "#ffab66"],
    ] as const)("pins the wash and ink and keeps the ink readable (%s)", (theme, wash, ink) => {
        const t = infinity(theme);
        expect(t["--accent-wash"]).toBe(wash);
        expect(t["--accent-ink"]).toBe(ink);
        expect(t["--accent-ink"]).toBe(t["--accent-text"]);
        expect(
            contrast(t["--accent-ink"], t["--accent-wash"]),
            "ink on wash",
        ).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t["--accent-wash"], t["--card"]), "wash vs card").toBeGreaterThanOrEqual(
            1.05,
        );
    });

    it.each(THEMES)(
        "keeps the dark and light orange text at 4.5:1 on card and page (%s)",
        (theme) => {
            const t = infinity(theme);
            for (const surface of [t["--card"], t["--background"]]) {
                expect(contrast(t["--accent-text"], surface)).toBeGreaterThanOrEqual(4.5);
            }
        },
    );
});

describe("global rules from the approved prototype (CHAOS-8141)", () => {
    const rule = (selector: string) => {
        const start = globalsCss.indexOf(`\n${selector} {`);
        expect(start, selector).toBeGreaterThanOrEqual(0);
        return globalsCss.slice(start, globalsCss.indexOf("\n}", start));
    };

    it("draws the global focus ring in the action teal, not the selection orange", () => {
        // Prototype style.css:157 `button:focus-visible{outline:2px solid var(--blueInk)}`.
        expect(rule(":focus-visible")).toContain("outline: 2px solid var(--accent-2)");
        expect(rule(".primary-nav-group-button:focus-visible")).toContain("var(--accent-2)");
        expect(rule(".primary-nav-group-button:focus-visible")).not.toContain("var(--accent)");
    });

    it("prints metric-hero values in plain ink, with no gradient text", () => {
        // Prototype theme.css:62 `.metric-value{font-variant-numeric:normal}` plain ink.
        const hero = rule(".metric-hero");
        expect(hero).toContain("color: var(--text-primary)");
        expect(hero).not.toMatch(/gradient|background-clip|text-fill-color/u);
    });
});
