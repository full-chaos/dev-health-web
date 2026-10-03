import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { SyncStatusBadge } from "./SyncStatusBadge";

// CHAOS-8099 review: label/fill contrast of the sync row buttons in both themes (>= 4.5:1), and the
// classes that make the label token win over the Button variant's own text class.
//   - Delete (danger outline): label `--negative` on the card surface, hover wash `--negative-wash`.
//   - Sync Now (primary): `--on-action` on `--action` (Button primary, no override).

const root = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const themes = root("app/fc-infinity-themes.css");
const tokens = (theme: "light" | "dark") => {
    const sel = `:root[data-palette="infinity"][data-theme="${theme}"] {`;
    const start = themes.indexOf(sel);
    const body = themes.slice(start + sel.length, themes.indexOf("\n}", start));
    return Object.fromEntries(
        [...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6});/gu)].map((m) => [m[1], m[2]]),
    );
};
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (h: string) =>
    [1, 3, 5]
        .map((i) => lin(parseInt(h.slice(i, i + 2), 16)))
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe("sync row buttons: contrast in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
        it(`Delete label (--negative) on the card and on its hover wash, ${theme}`, () => {
            const t = tokens(theme);
            expect(ratio(t["--negative"], t["--card"]), "on card").toBeGreaterThanOrEqual(4.5);
            expect(ratio(t["--negative"], t["--negative-wash"]), "on wash").toBeGreaterThanOrEqual(
                4.5,
            );
        });

        it(`Sync Now label (--on-action) on the fill (--action), ${theme}`, () => {
            const t = tokens(theme);
            expect(ratio(t["--on-action"], t["--action"])).toBeGreaterThanOrEqual(4.5);
        });
    }

    it("the Delete label token carries `!` so it wins over the secondary Button text class", () => {
        const s = root("components/admin/sync/SyncConfigDeleteControls.tsx");
        expect(s).toContain("text-(--negative)!");
        expect(s).toContain("hover:bg-(--negative-wash)!");
    });

    it("Sync Now is the primary Button variant, with no label override", () => {
        const s = root("components/admin/sync/SyncConfigTableRow.tsx").replace(/\s+/gu, " ");
        expect(s).toMatch(/<Button size="sm" variant="primary" onClick=\{trigger\}/u);
    });
});

describe("SyncStatusBadge keeps its words and states (importers: sync table, job history, run detail, connector table, sync detail)", () => {
    const words: Array<[Parameters<typeof SyncStatusBadge>[0]["status"], string]> = [
        ["success", "Success"],
        ["failed", "Failed"],
        ["running", "Syncing..."],
        ["idle", "Idle"],
        ["never", "Never Synced"],
    ];
    for (const [status, word] of words) {
        it(`${status} reads "${word}" with an icon and no border`, () => {
            const { container } = render(<SyncStatusBadge status={status} />);
            expect(screen.getByText(word)).toBeInTheDocument();
            expect(container.querySelector("svg")).not.toBeNull();
            expect(container.firstElementChild?.classList.contains("border")).toBe(false);
        });
    }
});
