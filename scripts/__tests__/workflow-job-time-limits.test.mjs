import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CHAOS-8530: every CI job has a time limit, so a hung job fails loudly at its limit instead of
// running for the 6 h default (the Tests run 37151519159 shard 3/3 ran 34 minutes before it was cancelled).
// Each limit is about 2x the slowest of the last 50 green runs of that job, rounded up to 5 minutes.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOWS = path.join(ROOT, ".github/workflows");

// Jobs with no green run to measure from (never run, or always skipped): left without a limit, on purpose.
const NO_DATA = new Set(["package.yml:package", "build-static.yml:test-e2e"]);
const MAX_MINUTES = 25;

function jobsOf(file) {
    const lines = fs.readFileSync(path.join(WORKFLOWS, file), "utf8").split("\n");
    const jobs = [];
    let injobs = false;
    for (const line of lines) {
        if (/^jobs:\s*$/u.test(line)) {
            injobs = true;
            continue;
        }
        if (!injobs) continue;
        const key = /^ {4}([A-Za-z0-9_-]+):\s*$/u.exec(line);
        if (key) {
            jobs.push({ id: key[1], timeout: undefined });
            continue;
        }
        const t = /^ {8}timeout-minutes:\s*(\d+)\s*$/u.exec(line);
        if (t && jobs.length > 0) jobs.at(-1).timeout = Number(t[1]);
    }
    return jobs;
}

describe("workflow job time limits (CHAOS-8530)", () => {
    const files = fs.readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));

    // The jobs the limits were measured for. A new job must be added here WITH a limit (or to NO_DATA).
    const EXPECTED = {
        "tests.yml": [
            "changes",
            "format",
            "quality",
            "build",
            "unit",
            "e2e-default",
            "e2e-onboarding",
            "design-lint",
            "test",
        ],
        "build.yml": ["changes", "build"],
        "live-e2e.yml": ["changes", "live-e2e"],
        "build-docker.yml": ["changes", "build", "merge"],
        "build-static.yml": ["changes", "build", "test-e2e"],
        "governance-src-test-policy.yml": ["enforce-src-test-policy"],
        "deploy-demo.yml": ["build", "deploy"],
        "package.yml": ["package"],
        "mirror-ci-images.yml": ["mirror"],
    };

    it("knows exactly the jobs of every workflow (a new job needs a limit decision)", () => {
        expect(files.sort()).toEqual(Object.keys(EXPECTED).sort());
        for (const f of files) {
            expect(
                jobsOf(f).map((j) => j.id),
                f,
            ).toEqual(EXPECTED[f]);
        }
    });

    for (const f of files) {
        for (const job of jobsOf(f)) {
            if (NO_DATA.has(`${f}:${job.id}`)) continue;
            it(`${f}:${job.id} has a timeout-minutes of at most ${MAX_MINUTES}`, () => {
                expect(job.timeout, "missing timeout-minutes").toBeDefined();
                expect(job.timeout).toBeGreaterThanOrEqual(5);
                expect(job.timeout).toBeLessThanOrEqual(MAX_MINUTES);
                expect(job.timeout % 5).toBe(0);
            });
        }
    }
});
