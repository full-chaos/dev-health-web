import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/heatmapRamp";

// CHAOS-8531: the track of a bar is the page background `--background` (the prototype's
// `.bar-track{background:var(--bg)}`), on both bar surfaces, so a series fill reads against it.
const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");
const css = read("src/app/fc-infinity-themes.css");
const globals = read("src/app/globals.css");

function block(mode: "light" | "dark"): Record<string, string> {
    const start = css.indexOf(`[data-theme="${mode}"] {`);
    const end = css.indexOf("}", start);
    const vars: Record<string, string> = {};
    for (const m of css.slice(start, end).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gu)) {
        vars[m[1]] = m[2].trim();
    }
    return vars;
}
const surface2 = (mode: "light" | "dark") =>
    new RegExp(`data-theme="${mode}"\\]\\s*\\{[^}]*?--surface2:\\s*(#[0-9a-f]{6})`, "iu").exec(
        globals,
    )?.[1] ?? "";

const SURFACES = [
    { name: "MeterRows", file: "src/components/ui/MeterRows.tsx", marker: "meter-track" },
    {
        name: "ReworkThemeBars",
        file: "src/components/quality/ReworkThemeBars.tsx",
        marker: "overflow-hidden rounded-r-(--radius-sm)",
    },
] as const;

const trackClass = (file: string, marker: string): string => {
    const text = read(file);
    const at = text.indexOf(marker);
    const line = text.slice(
        Math.max(0, text.lastIndexOf("\n", at - 1)),
        text.indexOf("\n", at + 40),
    );
    return (
        /\bbg-(?:background|\(--[a-z0-9-]+\))/u.exec(
            text.slice(at - 120, at + 160).includes("bg-") ? text.slice(at - 120, at + 160) : line,
        )?.[0] ?? ""
    );
};

describe("bar track (CHAOS-8531)", () => {
    it.each(SURFACES)("$name draws its track with --background (the prototype's --bg)", (s) => {
        expect(trackClass(s.file, s.marker)).toBe("bg-background");
    });

    // Series fills of the five investment themes: --chart-color-1..5.
    for (const mode of ["dark", "light"] as const) {
        const vars = block(mode);
        const track = vars["--background"];
        const ratios = [1, 2, 3, 4, 5].map((n) =>
            Number(contrastRatio(vars[`--chart-color-${n}`], track).toFixed(2)),
        );

        if (mode === "dark") {
            it("dark: every series fill reaches 3:1 on the track, the red reads 3.74", () => {
                for (const r of ratios) expect(r).toBeGreaterThanOrEqual(3);
                expect(ratios[2]).toBe(3.74);
            });
        } else {
            it("light: pins the measured ratios (series 2, 4, 5 are under 3:1, as in the prototype)", () => {
                // 1 operational, 2 risk, 3 maintenance, 4 quality, 5 feature; the prototype has
                // 2.21 / 2.45 / 2.79 for series 2 / 4 / 5 with its own hex values.
                expect(ratios).toEqual([3.74, 2.75, 8.37, 2.75, 2.79]);
            });
        }
    }

    it("the old tracks would not have passed in dark (why the track changed)", () => {
        const vars = block("dark");
        expect(contrastRatio(vars["--chart-color-3"], surface2("dark"))).toBeLessThan(3.1);
        expect(contrastRatio(vars["--chart-color-3"], vars["--card-stroke"])).toBeLessThan(3);
    });
});
