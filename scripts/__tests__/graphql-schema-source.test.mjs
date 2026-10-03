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
 * 2. CI compares that same file with the pin, in a step that runs for every
 *    change to the copy and that fails on a difference. A commented `diff`
 *    line, an `if:` or `continue-on-error` on the step, or a failure branch
 *    that exits 0 would each leave the text in place and the check dead;
 * 3. no document names the Python export or an introspection as the way to
 *    get the schema.
 */
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ROOT, contents, job, step, stepRun } from "./chaos-3017-ci-contract-helpers.mjs";

const read = (file) => contents(path.join(ROOT, file));

const PIN = "contracts/graphql/v1/schema.graphql";
const COPY = "src/lib/graphql/schema.graphql";
const DRIFT_STEP = "Check GraphQL schema drift";

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

    describe("the CI drift step", () => {
        const workflow = read(".github/workflows/live-e2e.yml");
        const liveJob = job(workflow, "live-e2e");

        it("compares that same copy with the ops contract pin, as live commands", () => {
            // Whole lines of the run block: a commented line is a different line.
            const run = stepRun(liveJob, DRIFT_STEP).split("\n");
            expect(run).toContain(`pin=dev-health-ops/${PIN}`);
            expect(run).toContain(`diff -u "$pin" ${COPY} || {`);
        });

        it("fails the step on a difference", () => {
            expect(stepRun(liveJob, DRIFT_STEP)).toMatch(
                /^diff -u "\$pin" src\/lib\/graphql\/schema\.graphql \|\| \{\n\s+echo "::error::[^\n]+\n\s+exit 1\n\}$/m,
            );
        });

        it("has no condition and cannot pass on a failure", () => {
            const drift = step(liveJob, DRIFT_STEP);
            expect(drift).not.toMatch(/^\s*if:/m);
            expect(drift).not.toMatch(/^\s*continue-on-error:/m);
        });

        it("runs for every change to the copy, the generated types or the codegen config", () => {
            const filter = job(workflow, "changes");
            expect(filter).toMatch(/^\s+- 'src\/\*\*'$/m);
            expect(filter).toMatch(/^\s+- 'codegen\.ts'$/m);
        });
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
