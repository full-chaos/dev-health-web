import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CHAOS-8482: the ops API is the Go `query-api`; the Python api source is being deleted (CHAOS-8315).
// No web doc or GraphQL source text may tell a reader to start the Python API or call the schema Strawberry.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("web texts do not name the Python API", () => {
    it("docs/graphql-investment.md names the Go query-api, not `python cli.py api`", () => {
        const doc = read("docs/graphql-investment.md");
        expect(doc).not.toMatch(/python\s+cli\.py\s+api/u);
        expect(doc).toContain("Go `query-api` service");
        expect(doc).not.toMatch(/router/iu);
        expect(doc).not.toContain("agent-visual-testing");
    });

    it("src/lib/graphql/types.ts names the contract, not Strawberry", () => {
        const head = read("src/lib/graphql/types.ts").split("\n").slice(0, 8).join("\n");
        expect(head).not.toMatch(/strawberry/iu);
        expect(head).toContain("contracts/graphql/v1/schema.graphql");
    });
});
