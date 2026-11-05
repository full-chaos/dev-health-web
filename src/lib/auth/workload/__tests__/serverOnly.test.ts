import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.resolve(__dirname, "..");
const modules = readdirSync(dir).filter((f) => f.endsWith(".ts"));

describe("workload modules are server-only", () => {
    it("lists the modules", () => {
        expect(modules.sort()).toEqual(["token.ts"]);
    });
    it.each(modules)("%s imports server-only first", (file) => {
        const text = readFileSync(path.join(dir, file), "utf8");
        expect(text.startsWith('import "server-only";\n')).toBe(true);
    });
    it("the bundle check does not yet list the token module", () => {
        // The row comes with the first consumer: the build drops a module with no consumer, and the check then fails on its marker.
        const script = readFileSync(
            path.resolve(__dirname, "../../../../../scripts/check-client-bundle.mjs"),
            "utf8",
        );
        expect(script).not.toContain("src/lib/auth/workload/token.ts");
    });
});
