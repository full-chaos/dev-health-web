import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { sourceBackedTest } from "./acr-fixture-copy.mjs";
import { job, step } from "./chaos-3017-ci-contract-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = fs.readFileSync(path.join(ROOT, ".github/workflows/tests.yml"), "utf8");

function fakeTest() {
    const test = vi.fn();
    test.skip = vi.fn();
    return test;
}

// CHAOS-12219: in CI a source-backed test runs or fails. A skip reads as part of a passing run.
describe("sourceBackedTest", () => {
    it("runs the test when ACR_ROOT is set, with or without the marker", () => {
        const test = fakeTest();

        expect(sourceBackedTest(test, { ACR_ROOT: "/acr" })).toBe(test);
        expect(sourceBackedTest(test, { ACR_CONTRACT_GATE: "required", ACR_ROOT: "/acr" })).toBe(
            test,
        );
    });

    it("skips outside the gate when ACR_ROOT is unset", () => {
        const test = fakeTest();

        expect(sourceBackedTest(test, {})).toBe(test.skip);
        expect(sourceBackedTest(test, { CI: "true" })).toBe(test.skip);
    });

    it("fails inside the gate when ACR_ROOT is unset, and names the input", () => {
        const test = fakeTest();
        const body = vi.fn();

        sourceBackedTest(test, { ACR_CONTRACT_GATE: "required" })("needs acr", body);

        expect(test.skip).not.toHaveBeenCalled();
        const [name, gate] = test.mock.calls[0];
        expect(name).toBe("needs acr");
        expect(gate).toThrow(/ACR_ROOT/);
        expect(body).not.toHaveBeenCalled();
    });
});

describe("the CI unit step", () => {
    it("sets the marker and gives ACR_ROOT the acr checkout at the manifest's pin", () => {
        const unit = job(WORKFLOW, "unit");
        expect(unit).toMatch(
            /^ {8}env:\n {12}ACR_CONTRACT_GATE: required\n {12}ACR_ROOT: \$\{\{ github\.workspace \}\}\/\.acr-source\n {8}steps:$/mu,
        );

        expect(unit).toContain("src/lib/acr/contracts/manifest.json').source_commit");
        const checkout = step(unit, "Check out acr at the pinned commit");
        expect(checkout).toContain("repository: full-chaos/dev-health-acr");
        expect(checkout).toContain("ref: ${{ steps.acr-pin.outputs.sha }}");
        expect(checkout).toContain("path: .acr-source");
        expect(checkout).toContain("fetch-depth: 2");
    });
});
