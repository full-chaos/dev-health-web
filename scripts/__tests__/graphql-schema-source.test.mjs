/**
 * Guards where the web GraphQL schema comes from (CHAOS-8469).
 *
 * The source of truth is the ops contract pin, `contracts/graphql/v1/schema.graphql`
 * in dev-health-ops. `src/lib/graphql/schema.graphql` is a verbatim copy of it,
 * and codegen reads that copy. The Python schema export
 * (`dev_health_ops.api.graphql.export_schema`) and an introspection of the
 * Python API are gone with the Python API source, so a document that still
 * names them sends a reader to a command that cannot run.
 *
 * Three things have to hold together:
 *
 * 1. codegen reads the web copy;
 * 2. CI compares that same file with the pin, so the copy cannot drift;
 * 3. no document names the Python export or an introspection as the way to
 *    get the schema.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

const PIN = "contracts/graphql/v1/schema.graphql";
const COPY = "src/lib/graphql/schema.graphql";

/** Every document that tells a reader how the web schema is kept in step with ops. */
const SYNC_DOCUMENTS = [
    "codegen.ts",
    "README.md",
    "AGENTS.md",
    "docs/graphql-investment.md",
    "docs/testing-governance.md",
];

/** Ways to get the schema that no longer exist. */
const RETIRED_SOURCES = [
    /export_schema/,
    /Strawberry/i,
    /graphql-codegen introspect/,
    /backend export/i,
    /exports the ops schema/,
];

describe("the web GraphQL schema source", () => {
    it("codegen reads the web copy of the ops contract pin", () => {
        expect(read("codegen.ts")).toMatch(/^\s*schema:\s*"src\/lib\/graphql\/schema\.graphql",$/m);
    });

    it("CI compares that same copy with the ops contract pin", () => {
        const workflow = read(".github/workflows/live-e2e.yml");
        expect(workflow).toContain(`pin=dev-health-ops/${PIN}`);
        expect(workflow).toContain(`diff -u "$pin" ${COPY}`);
    });

    it.each(["codegen.ts", "README.md", "AGENTS.md"])("%s names the ops contract pin", (file) => {
        expect(read(file)).toContain(PIN);
    });

    it.each(SYNC_DOCUMENTS)("%s names no retired schema source", (file) => {
        const text = read(file);
        for (const retired of RETIRED_SOURCES) {
            expect(text, `${file} still names ${retired}`).not.toMatch(retired);
        }
    });
});
