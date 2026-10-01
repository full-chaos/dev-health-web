import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@/test/utils";
import { ConfidenceBadge } from "@/components/feature-flags/ConfidenceBadge";
import { STATUS_PILL } from "@/lib/statusPill";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const themes = src("app/fc-infinity-themes.css");
const tokens = (theme: "light" | "dark") => {
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

describe("ConfidenceBadge uses the status pill form (the level keeps its text label)", () => {
    for (const [score, tone] of [
        [0.9, "positive"],
        [0.6, "caution"],
        [0.1, "negative"],
    ] as const) {
        it(`score ${score} is the ${tone} pill and shows the percentage`, () => {
            const { container } = render(<ConfidenceBadge score={score} />);
            const el = container.firstElementChild as HTMLElement;
            expect(el.className).toContain(STATUS_PILL[tone]);
            expect(el.className).not.toMatch(/(?:green|amber|red)-\d/u);
            expect(el).toHaveTextContent(`${Math.round(score * 100)}%`);
        });
    }
});

describe("cognitive-load page tokens", () => {
    it("has no amber, emerald or rose class except the fetch-error banner", () => {
        const s = src("app/(app)/cognitive-load/page.tsx")
            .split("\n")
            .filter((l) => !/rose-(?:200|50|800)/u.test(l))
            .join("\n");
        expect(s).not.toMatch(/\b(?:text|bg|border)-(?:amber|emerald|rose)-\d{2,3}/u);
        expect(s).toContain("bg-(--caution-solid)");
        expect(s).toContain("text-(--on-caution-solid)");
    });
    for (const theme of ["light", "dark"] as const) {
        it(`caution text, positive text and the solid pill reach 4.5:1 in ${theme}`, () => {
            const t = tokens(theme);
            for (const k of ["--caution", "--positive", "--negative"]) {
                expect(ratio(rgb(t[k]), rgb(t["--card"])), `${k} on card`).toBeGreaterThanOrEqual(
                    4.5,
                );
            }
            expect(
                ratio(rgb(t["--on-caution-solid"]), rgb(t["--caution-solid"])),
            ).toBeGreaterThanOrEqual(4.5);
        });
    }
});
