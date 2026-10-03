import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-8434 (ruling 107): a component never renders the text of a backend or thrown error. A failed
 * read shows `readFailureMessage(error, "<operation>")`, which logs the detail and returns the plain
 * sentence. This scan fails when a `.tsx` file under src/ reads `<error>.message` or `graphQLErrors`.
 *
 * ALLOWED: each entry below, with its reason. The action files (4xx validation text rule of
 * `AdminErrorNotice`) are removed from this list by the actions PR of the same ticket.
 */
const ALLOW: Record<string, string> = {
    "components/evidence/EvidencePanel.tsx":
        "the text goes to the log and to the dev-diagnostics block (flag-gated), not to users",
    "app/(app)/reports/[id]/page.tsx": "ACTION errors (trigger/update/clone/delete): actions PR",
    "app/(app)/reports/new/page.tsx": "ACTION error (create): actions PR",
    "components/admin/llm/ByoLlmSpendSummary.tsx": "actions PR",
    "components/admin/billing/PlanManager.tsx": "ACTION toast (client JSON validation): actions PR",
    "components/admin/sync/SyncConfigHeaderActions.tsx": "ACTION toast: actions PR",
    "components/admin/sync/SyncConfigDeleteControls.tsx": "ACTION toast: actions PR",
    "components/admin/sync/SyncConfigTableRow.tsx": "ACTION toast: actions PR",
};

const SRC = join(process.cwd(), "src");
const RENDERED = /\b\w*(?:[eE]rr|[eE]rror|cause)\w*\??\.message\b|graphQLErrors/u;

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (name === "__tests__" || name === "generated") continue;
            walk(full, out);
        } else if (full.endsWith(".tsx") && !/\.(test|spec)\.tsx$/u.test(name)) {
            out.push(full);
        }
    }
    return out;
}

describe("no component renders backend error text", () => {
    const files = walk(SRC);

    it("scans a real set of files (a scan of nothing is a failure)", () => {
        expect(files.length).toBeGreaterThan(200);
    });

    it("finds no error.message / graphQLErrors read outside the allow-list", () => {
        const offenders = files
            .map((f) => relative(SRC, f))
            .filter((rel) => !(rel in ALLOW))
            .filter((rel) => RENDERED.test(readFileSync(join(SRC, rel), "utf8")));
        expect(offenders).toEqual([]);
    });

    it("keeps the allow-list honest: every entry exists and still reads error text", () => {
        for (const rel of Object.keys(ALLOW)) {
            const text = readFileSync(join(SRC, rel), "utf8");
            expect(RENDERED.test(text), `${rel} no longer needs its allow-list entry`).toBe(true);
        }
    });
});
