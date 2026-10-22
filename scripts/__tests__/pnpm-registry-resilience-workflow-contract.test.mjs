import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOWS = path.join(ROOT, ".github", "workflows");
const read = (...p) => readFileSync(path.join(ROOT, ...p), "utf8");

const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));
const count = (text, needle) => text.split(needle).length - 1;

describe("pnpm registry resilience (slow npm registry must not eat job limits)", () => {
    it("bounds pnpm's registry requests", () => {
        const ws = read("pnpm-workspace.yaml");
        for (const key of [
            "fetchTimeout",
            "fetchRetries",
            "fetchRetryMintimeout",
            "fetchRetryMaxtimeout",
        ]) {
            expect(ws, key).toMatch(new RegExp(`^${key}: \\d+$`, "mu"));
        }
    });

    for (const file of files) {
        const text = read(".github", "workflows", file);
        const installs = count(text, "pnpm install --frozen-lockfile");
        if (installs === 0) continue;

        it(`${file}: every install restores and saves the lockfile-keyed pnpm store, with no second cache`, () => {
            expect(text).not.toMatch(/^\s+cache: ["']?pnpm["']?$/mu);
            expect(count(text, "uses: actions/cache/restore@")).toBe(installs);
            expect(count(text, "name: Save pnpm store")).toBe(installs);
            expect(count(text, "name: Save partial pnpm store")).toBe(installs);
            expect(count(text, "hashFiles('pnpm-lock.yaml')")).toBe(installs * 4);
        });

        it(`${file}: the pnpm bootstrap step is time-bounded`, () => {
            const setups = count(text, "uses: pnpm/action-setup@");
            expect(setups).toBe(installs);
            expect(
                text.match(/uses: pnpm\/action-setup@[^\n]*\n\s+timeout-minutes: 3\n/gu) ?? [],
            ).toHaveLength(setups);
        });
    }

    it("the quality job audit goes through the bounded retry wrapper, not bare pnpm audit", () => {
        const sh = read("ci", "run_tests.sh");
        expect(sh).toContain("node ci/pnpm-audit-retry.mjs");
        expect(sh).not.toMatch(/^\s*pnpm audit/mu);
    });
});
