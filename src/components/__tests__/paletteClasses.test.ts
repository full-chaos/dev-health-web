import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-7677: raw Tailwind palette classes ignore the theme. This scan counts them per
 * file under `src` and holds each file to its allow-listed count. A count may only go
 * down; a file that reaches 0 must be removed from the list (a stale entry fails), so the
 * list shrinks slice by slice until it is empty.
 */
const SRC = join(process.cwd(), "src");
const RAW =
    /\b(?:text|bg|border|ring|from|via|to|fill|stroke|divide|outline|shadow|accent|decoration)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/gu;

const ALLOWLIST: Record<string, number> = {
    "app/(app)/data-health/_components/AliasSuggestionRow.tsx": 2,
    "app/(app)/operating-review/page.tsx": 28,
    // 6 provider brand-mark hits (Admin page pass) + 3 in one red banner (Notice danger).
    "app/(app)/org/admin/integrations/page.tsx": 6,
    "app/(app)/reports/[id]/page.tsx": 19,
    "app/(app)/reports/new/page.tsx": 3,
    "components/ai/AIEvidenceExplorer.tsx": 6,
    "components/ai/AIOpportunityList.tsx": 2,
    "components/ai/AIRiskDashboard.tsx": 2,
    "components/evidence/EvidenceContext.tsx": 6,
    "components/evidence/EvidencePanel.tsx": 2,
};

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__tests__" || entry.name === "__generated__") continue;
            walk(full, out);
        } else if (/\.(ts|tsx)$/u.test(entry.name) && !/\.(test|stories)\./u.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

const counts = new Map<string, number>();
for (const file of walk(SRC)) {
    const n = (readFileSync(file, "utf8").match(RAW) ?? []).length;
    if (n > 0) counts.set(relative(SRC, file), n);
}

describe("raw Tailwind palette classes", () => {
    it("no file has more than its allow-listed count", () => {
        const over = [...counts].filter(([f, n]) => n > (ALLOWLIST[f] ?? 0));
        expect(over.map(([f, n]) => `${f}: ${n} > ${ALLOWLIST[f] ?? 0}`)).toEqual([]);
    });

    it("no allow-list entry is stale or above the real count", () => {
        const stale = Object.entries(ALLOWLIST).filter(([f, n]) => (counts.get(f) ?? 0) < n);
        expect(stale.map(([f, n]) => `${f}: list ${n}, real ${counts.get(f) ?? 0}`)).toEqual([]);
    });
});
