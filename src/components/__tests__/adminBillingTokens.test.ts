import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("admin sidebars", () => {
    it("have no purple and keep the orange selection tint on the active item", () => {
        for (const f of [
            "components/admin/AdminSidebar.tsx",
            "components/superadmin/SuperadminSidebar.tsx",
        ]) {
            expect(src(f), f).not.toMatch(/purple/u);
        }
        const sup = src("components/superadmin/SuperadminSidebar.tsx");
        expect(sup).toContain('"border-(--accent) bg-(--accent)/15 text-foreground"');
        expect(sup).toContain("text-(--accent-text)");
        expect(src("components/admin/AdminSidebar.tsx")).toContain("STATUS_PILL.info");
    });
});

describe("billing status maps", () => {
    const maps: Array<[string, string]> = [
        ["components/admin/billing/RefundList.tsx", "succeeded"],
        ["components/admin/billing/InvoiceList.tsx", "payment_failed"],
        ["components/admin/billing/SubscriptionList.tsx", "past_due"],
    ];
    for (const [file, key] of maps) {
        it(`${file} maps ${key} to status tokens`, () => {
            const s = src(file);
            const line = s.split("\n").find((l) => l.trimStart().startsWith(`${key}:`)) ?? "";
            expect(line).toMatch(/bg-\(--(positive|negative|caution|info)\)\/12 text-\(--/u);
            expect(s).not.toMatch(/\bslate-\d/u);
        });
    }
});

describe("danger buttons", () => {
    for (const theme of ["light", "dark"] as const) {
        it(`accent-foreground on --negative reaches 4.5:1 in ${theme}`, () => {
            const t = tokens(theme);
            expect(
                ratio(rgb(t["--accent-foreground"]), rgb(t["--negative"])),
            ).toBeGreaterThanOrEqual(4.5);
        });
    }
    it("the delete buttons use the token pair", () => {
        for (const f of [
            "components/superadmin/OrgDeleteSection.tsx",
            "components/superadmin/UserDeleteSection.tsx",
            "components/admin/settings/DeletionPlanPreview.tsx",
            "components/admin/billing/RefundDialog.tsx",
        ]) {
            expect(src(f), f).toContain("bg-(--negative)");
            expect(src(f), f).toContain("text-(--accent-foreground)");
        }
    });
});
