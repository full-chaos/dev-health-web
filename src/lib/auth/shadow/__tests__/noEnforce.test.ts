import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.resolve(__dirname, "..");
const appDir = path.resolve(__dirname, "../../../../app/(app)");
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts"));

describe("the shadow never enforces", () => {
    it("lists the modules", () => {
        expect(sources.sort()).toEqual(["catalog.ts", "config.ts", "index.ts", "log.ts", "run.ts"]);
    });

    it.each(sources)(
        "%s does not import a redirect, a role guard or the session reader",
        (file) => {
            const text = readFileSync(path.join(dir, file), "utf8");
            expect(text).not.toMatch(/from "next\/navigation"/);
            expect(text).not.toMatch(
                /\b(redirect|notFound|requireRole|requireSuperuser|requireSession)\b/,
            );
            expect(text).not.toMatch(/from "@\/lib\/auth"/);
        },
    );

    it.each([
        ["layout.tsx", /await withDeadline\(requireSession\(\)/],
        ["org/admin/layout.tsx", /await requireRole\(/],
        ["superadmin/layout.tsx", /await requireSuperuser\(/],
        ["data-health/layout.tsx", /await requireRole\(/],
    ])("%s calls the shadow once, after its own guard, and never in a condition", (rel, guard) => {
        const text = readFileSync(path.join(appDir, rel), "utf8");
        const calls = text.match(/scheduleShadow\(/g) ?? [];
        expect(calls).toHaveLength(1);
        const g = text.search(guard);
        expect(g).toBeGreaterThan(-1);
        expect(text.indexOf("scheduleShadow(")).toBeGreaterThan(g);
        expect(text).toMatch(/^ {4}scheduleShadow\(/m);
        expect(text).not.toMatch(/(if|\?|&&|\|\|)[^\n]*scheduleShadow/);
    });
});
