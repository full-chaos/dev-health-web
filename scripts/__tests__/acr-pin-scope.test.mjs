import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { touchesPin } from "../acr-pin-scope.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../acr-pin-scope.mjs");

describe("touchesPin", () => {
    it.each([
        "src/lib/acr/contracts/manifest.json",
        "src/lib/acr/contracts/schemas/context_fabric_common.v1.schema.json",
        "src/lib/acr/threadValidators.js",
        "src/lib/acr/threadValidators.d.ts",
        "scripts/sync-acr-contracts.mjs",
        "scripts/acr-contract-artifacts.mjs",
        "scripts/check-acr-pin-drift.mjs",
        ".github/workflows/acr-pin-drift.yml",
    ])("enforces for %s", (file) => {
        expect(touchesPin(["README.md", file])).toBe(true);
    });
    it.each([
        "README.md",
        "src/lib/acr/contracts.ts",
        "src/lib/acr/threadContract.ts",
        "src/app/page.tsx",
        ".github/workflows/tests.yml",
        "scripts/other.mjs",
    ])("is advisory for %s", (file) => {
        expect(touchesPin([file])).toBe(false);
    });
    it("is advisory for no changed files", () => {
        expect(touchesPin([])).toBe(false);
    });
});

describe("cli", () => {
    const run = (input) => spawnSync("node", [SCRIPT], { input, encoding: "utf8" });
    it("prints enforce=true when a pin file changed", () => {
        expect(run("a.ts\nsrc/lib/acr/contracts/manifest.json\n").stdout).toBe("enforce=true\n");
    });
    it("prints enforce=false otherwise, and for empty input", () => {
        expect(run("a.ts\nb.ts\n").stdout).toBe("enforce=false\n");
        expect(run("").stdout).toBe("enforce=false\n");
    });
});
