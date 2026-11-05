import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.resolve(__dirname, "..");
const modules = readdirSync(dir).filter((f) => f.endsWith(".ts"));

describe("C1 decide modules are server-only", () => {
    it("lists the modules", () => {
        expect([...modules].sort()).toEqual(["catalog.ts", "config.ts", "decide.ts", "log.ts"]);
    });
    it.each(modules)("%s imports server-only first", (file) => {
        const text = readFileSync(path.join(dir, file), "utf8");
        expect(text.startsWith('import "server-only";\n')).toBe(true);
    });
});
