import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/heatmapRamp";

// CHAOS-11942, E8 design §9: Ask Dev charts sit on the panel surface (`--surface`). Each series
// colour a chart can take (series i -> `--chart-color-i`, G7) needs 3:1 against it (WCAG 1.4.11),
// and the chart and figure text tokens need 4.5:1 (1.4.3), in the light and the dark theme. The
// ratios are computed from the theme file itself, so a token change is checked here.
const CSS_FILE = "src/app/fc-infinity-themes.css";
const SERIES_TOKENS = Array.from({ length: 10 }, (_, i) => `--chart-color-${i + 1}`);
const TEXT_TOKENS = ["--chart-text", "--chart-muted", "--ink-muted", "--foreground", "--accent-2"];

function themeTokens(css: string, mode: "light" | "dark"): Record<string, string> {
    const start = css.indexOf(`[data-theme="${mode}"] {`);
    if (start < 0) throw new Error(`no ${mode} theme block`);
    const end = css.indexOf("}", start);
    const vars: Record<string, string> = {};
    for (const match of css.slice(start, end).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gu))
        vars[match[1]!] = match[2]!.trim();
    return vars;
}

function contrastFailures(vars: Record<string, string>): string[] {
    const surface = vars["--surface"];
    if (surface === undefined || !/^#[0-9a-f]{6}$/iu.test(surface))
        return ["--surface is not a hex colour"];
    const failures: string[] = [];
    const check = (token: string, minimum: number) => {
        const colour = vars[token];
        if (colour === undefined || !/^#[0-9a-f]{6}$/iu.test(colour)) {
            failures.push(`${token} is not a hex colour`);
            return;
        }
        const ratio = contrastRatio(colour, surface);
        if (ratio < minimum)
            failures.push(`${token} ${colour} on ${surface}: ${ratio.toFixed(2)} < ${minimum}`);
    };
    SERIES_TOKENS.forEach((token) => check(token, 3));
    TEXT_TOKENS.forEach((token) => check(token, 4.5));
    return failures;
}

const css = readFileSync(join(process.cwd(), CSS_FILE), "utf8");

describe("chart contrast on the Ask Dev panel (E8 §9)", () => {
    it.each(["light", "dark"] as const)(
        "%s theme: series 3:1 and text 4.5:1 against --surface",
        (mode) => {
            expect(contrastFailures(themeTokens(css, mode))).toEqual([]);
        },
    );

    it("fails a planted low-contrast series colour and a planted low-contrast text token", () => {
        const light = themeTokens(css, "light");
        expect(contrastFailures({ ...light, "--chart-color-3": "#f4f4f4" })).toEqual([
            expect.stringMatching(/^--chart-color-3 #f4f4f4 on #fdfdfc: 1\.\d\d < 3$/u),
        ]);
        expect(contrastFailures({ ...light, "--chart-muted": "#a0a0a0" })).toEqual([
            expect.stringMatching(/^--chart-muted #a0a0a0 on #fdfdfc: 2\.\d\d < 4\.5$/u),
        ]);
    });
});
