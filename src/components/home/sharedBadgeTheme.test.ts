import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STATUS_PILL_ALPHA } from "@/lib/themeTints";
import { AREA_STATE_PILL, SEVERITY_BADGE, CONFIDENCE_DOT, CONFIDENCE_TEXT } from "./severityTokens";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const themes = read("../../app/fc-infinity-themes.css");
const RAW = /\b(?:text|bg|border)-(?:red|amber|yellow|orange|green|emerald|purple|blue)-\d{2,3}/u;

const block = (theme: "light" | "dark") => {
    const sel = `:root[data-palette="infinity"][data-theme="${theme}"] {`;
    const start = themes.indexOf(sel);
    const body = themes.slice(start + sel.length, themes.indexOf("\n}", start));
    return Object.fromEntries(
        [...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6});/gu)].map((m) => [m[1], m[2]]),
    );
};
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
const over = (fg: number[], bg: number[], a: number) => fg.map((v, i) => v * a + bg[i] * (1 - a));

describe("shared badges use theme tokens, not raw palette classes", () => {
    it("severityTokens has no raw palette class", () => {
        expect(read("./severityTokens.ts")).not.toMatch(RAW);
    });
    it("severity badge fills use the shared pill alpha", () => {
        expect(STATUS_PILL_ALPHA).toBe(0.12);
        expect(SEVERITY_BADGE.critical).toContain("bg-(--accent-negative)/12");
        expect(SEVERITY_BADGE.high).toContain("bg-(--accent-3)/12");
        expect(CONFIDENCE_DOT.medium).toBe("bg-(--accent-3)");
        expect(CONFIDENCE_TEXT.medium).toBe("text-(--accent-3)");
    });
    for (const theme of ["light", "dark"] as const) {
        it(`status text reaches 4.5:1 on its pill fill in ${theme}`, () => {
            const t = block(theme);
            for (const token of ["--accent-negative", "--accent-3"]) {
                const fill = over(rgb(t[token]), rgb(t["--card"]), STATUS_PILL_ALPHA);
                expect(ratio(rgb(t[token]), fill), `${token} ${theme}`).toBeGreaterThanOrEqual(4.5);
            }
        });
    }
});

describe("area severity pill: Low and Info carry a wash (CHAOS-8189)", () => {
    it("low uses the positive wash, neutral (Info) the info wash, no card fill", () => {
        expect(AREA_STATE_PILL.low).toContain("bg-(--positive)/12");
        expect(AREA_STATE_PILL.neutral).toContain("bg-(--info)/12");
        for (const pill of Object.values(AREA_STATE_PILL)) expect(pill).toContain("rounded-full!");
        expect(AREA_STATE_PILL.low).not.toContain("card-70");
        expect(AREA_STATE_PILL.neutral).not.toContain("card-70");
    });
});
