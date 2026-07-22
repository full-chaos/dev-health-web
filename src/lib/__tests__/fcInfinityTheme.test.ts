import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const themeCss = readFileSync(new URL("../../app/fc-infinity-themes.css", import.meta.url), "utf8");

type Rgb = readonly [number, number, number];

const getThemeBlock = (palette: "ember" | "tide", theme: "light" | "dark") => {
    const selector = `:root[data-palette="fullchaos-infinity-${palette}"][data-theme="${theme}"]`;
    const selectorStart = themeCss.indexOf(`${selector} {`);
    expect(selectorStart).toBeGreaterThanOrEqual(0);

    const bodyStart = themeCss.indexOf("{", selectorStart) + 1;
    const bodyEnd = themeCss.indexOf("\n}", bodyStart);
    expect(bodyEnd).toBeGreaterThan(bodyStart);

    return themeCss.slice(bodyStart, bodyEnd);
};

const getChartColors = (block: string) =>
    Array.from(block.matchAll(/--chart-color-\d+:\s*([^;]+);/gu), (match) => match[1]);

const getSourceColor = (name: string): Rgb => {
    const match = themeCss.match(new RegExp(`--fc-${name}:\\s*(#[0-9a-f]{6});`, "u"));
    expect(match?.[1]).toBeDefined();
    const hex = match?.[1] ?? "#000000";
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ];
};

const mixSrgb = (first: Rgb, second: Rgb, firstWeight: number): Rgb => {
    const mixChannel = (firstChannel: number, secondChannel: number) =>
        Math.round(firstChannel * firstWeight + secondChannel * (1 - firstWeight));
    return [
        mixChannel(first[0], second[0]),
        mixChannel(first[1], second[1]),
        mixChannel(first[2], second[2]),
    ];
};

const relativeLuminance = (color: Rgb) => {
    const linearize = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return (
        linearize(color[0]) * 0.2126 + linearize(color[1]) * 0.7152 + linearize(color[2]) * 0.0722
    );
};

const contrastRatio = (first: Rgb, second: Rgb) => {
    const firstLuminance = relativeLuminance(first);
    const secondLuminance = relativeLuminance(second);
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 0.05) / (darker + 0.05);
};

describe("FC Infinity theme contracts", () => {
    it("uses a deep slate canvas without page-scale gradients in dark mode", () => {
        for (const palette of ["ember", "tide"] as const) {
            const block = getThemeBlock(palette, "dark");

            expect(block).toContain(
                "--background: color-mix(in srgb, var(--fc-slate) 70%, var(--fc-graphite));",
            );
            expect(block).toContain("--card: var(--fc-carbon);");
            expect(block).toContain("--hero-gradient: none;");
            expect(block).toContain("--app-gradient: none;");
        }
    });

    it("uses the same neutral off-white canvas and stronger boundaries in light mode", () => {
        for (const palette of ["ember", "tide"] as const) {
            const block = getThemeBlock(palette, "light");

            expect(block).toContain(
                "--background: color-mix(in srgb, var(--fc-white) 88%, var(--fc-silver));",
            );
            expect(block).toContain("--card: var(--fc-white);");
            expect(block).toContain(
                "--card-stroke: color-mix(in srgb, var(--fc-steel) 55%, var(--fc-silver));",
            );
            expect(block).toContain("--hero-gradient: none;");
            expect(block).toContain("--app-gradient: none;");
        }
    });

    it("gives Ember a warm-leading chart sequence and Tide a cool-leading sequence", () => {
        const emberDarkColors = getChartColors(getThemeBlock("ember", "dark"));
        const tideDarkColors = getChartColors(getThemeBlock("tide", "dark"));
        const emberLightColors = getChartColors(getThemeBlock("ember", "light"));
        const tideLightColors = getChartColors(getThemeBlock("tide", "light"));

        expect(emberDarkColors.slice(0, 6)).toEqual([
            "var(--fc-amber)",
            "var(--fc-flame)",
            "var(--fc-gold)",
            "var(--fc-orange)",
            "var(--fc-red)",
            "var(--fc-crimson)",
        ]);
        expect(tideDarkColors.slice(0, 6)).toEqual([
            "var(--fc-electric-cyan)",
            "var(--fc-aqua)",
            "var(--fc-glacier)",
            "var(--fc-ice-blue)",
            "var(--fc-ocean)",
            "var(--fc-cyan)",
        ]);
        expect(emberLightColors.slice(0, 4)).toEqual([
            "var(--fc-crimson)",
            "var(--fc-orange)",
            "var(--fc-red)",
            "var(--fc-amber)",
        ]);
        expect(tideLightColors.slice(0, 4)).toEqual([
            "var(--fc-ocean)",
            "var(--fc-deep-cyan)",
            "var(--fc-deep-ocean)",
            "var(--fc-slate)",
        ]);
        expect(emberDarkColors).not.toEqual(tideDarkColors);
        expect(emberLightColors).not.toEqual(tideLightColors);
    });

    it("keeps text, accents, and control boundaries above their contrast targets", () => {
        const white = getSourceColor("white");
        const voidColor = getSourceColor("void");
        const ink = getSourceColor("ink");
        const carbon = getSourceColor("carbon");
        const graphite = getSourceColor("graphite");
        const slate = getSourceColor("slate");
        const steel = getSourceColor("steel");
        const muted = getSourceColor("muted");
        const mist = getSourceColor("mist");
        const silver = getSourceColor("silver");
        const orange = getSourceColor("orange");
        const crimson = getSourceColor("crimson");
        const amber = getSourceColor("amber");
        const ocean = getSourceColor("ocean");
        const electricCyan = getSourceColor("electric-cyan");
        const deepCyan = getSourceColor("deep-cyan");

        const darkCanvas = mixSrgb(slate, graphite, 0.7);
        const darkStroke = mixSrgb(steel, muted, 0.78);
        expect(contrastRatio(white, darkCanvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(mist, darkCanvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(mist, carbon)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(amber, darkCanvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(electricCyan, darkCanvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(voidColor, amber)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(voidColor, electricCyan)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(darkStroke, carbon)).toBeGreaterThanOrEqual(3);

        const lightCanvas = mixSrgb(white, silver, 0.88);
        const lightStroke = mixSrgb(steel, silver, 0.55);
        const emberLightAccent = mixSrgb(orange, crimson, 0.6);
        expect(contrastRatio(ink, lightCanvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(steel, lightCanvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(emberLightAccent, lightCanvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(white, emberLightAccent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(ocean, lightCanvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(white, ocean)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(deepCyan, lightCanvas)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(lightStroke, white)).toBeGreaterThanOrEqual(3);
    });
});
