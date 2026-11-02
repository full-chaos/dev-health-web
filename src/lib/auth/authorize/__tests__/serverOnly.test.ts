import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The bundle scan (scripts/check-client-bundle.mjs) needs every registered marker in the server
// output, so a module that no route imports yet cannot be registered there. Until a consumer
// exists, this cell holds the guard: each module of this directory starts with the import that
// makes the build refuse a client import.
const dir = path.resolve(__dirname, "..");
const modules = readdirSync(dir).filter((f) => f.endsWith(".ts"));

describe("authorize modules are server-only", () => {
    it("lists the modules", () => {
        expect(modules.sort()).toEqual(["client.ts", "decision.ts", "request.ts"]);
    });
    it.each(modules)("%s imports server-only first", (file) => {
        const text = readFileSync(path.join(dir, file), "utf8");
        expect(text.startsWith('import "server-only";\n')).toBe(true);
    });
});
