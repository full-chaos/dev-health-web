import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CHAOS-13768: the unit job writes the vitest JUnit file and uploads it, also when the unit step failed, so a failed
// unit case reaches the Tests tab. The artifact name must be one the ops tests sync selects, and a web Tests run must
// stay under the sync's cap of 25 artifacts per run.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = fs.readFileSync(path.join(ROOT, ".github/workflows/tests.yml"), "utf8");
const CONFIG = fs.readFileSync(path.join(ROOT, "vitest.config.ts"), "utf8");

const SYNC_EXCLUDED_SUFFIXES = [".dockerbuild"];
const SYNC_EXCLUDED_PREFIXES = ["go-images-", "go-test-timings-", "go-junit-part-"];
const SYNC_ARTIFACT_CAP = 25;

function jobBlocks() {
    const jobs = {};
    let id = null;
    let injobs = false;
    for (const line of WORKFLOW.split("\n")) {
        if (/^jobs:\s*$/u.test(line)) {
            injobs = true;
            continue;
        }
        if (!injobs) continue;
        const key = /^ {4}([A-Za-z0-9_-]+):\s*$/u.exec(line);
        if (key) {
            id = key[1];
            jobs[id] = [];
            continue;
        }
        if (id) jobs[id].push(line);
    }
    return Object.fromEntries(
        Object.entries(jobs).map(([name, lines]) => [name, lines.join("\n")]),
    );
}

function stepsOf(block) {
    return block
        .split(/\n(?= {12}- )/u)
        .filter((chunk) => /^ {12}- /u.test(chunk))
        .map((chunk) => chunk.trimEnd());
}

const unitSteps = stepsOf(jobBlocks().unit);
const unitStep = unitSteps.find((step) => /id:\s*unit-tests\b/u.test(step));
const uploadStep = unitSteps.find((step) => /name:\s*Upload vitest JUnit\b/u.test(step));

function field(step, name) {
    const found =
        new RegExp(`^ {14}${name}:\\s*(.+)$`, "mu").exec(step) ??
        new RegExp(`^ {12}- ${name}:\\s*(.+)$`, "mu").exec(step);
    return found?.[1].trim();
}

function withField(step, name) {
    return new RegExp(`^ {18}${name}:\\s*(.+)$`, "mu").exec(step)?.[1].trim();
}

// Evaluates only the condition shapes this workflow uses; any other token fails loudly, so a reworded condition is
// reviewed here instead of passing unread.
function uploadRuns(condition, unitOutcome) {
    return condition.split("&&").every((raw) => {
        const part = raw.trim();
        if (part === "always()") return true;
        const outcome =
            /^steps\.unit-tests\.outcome (==|!=) '(success|failure|cancelled|skipped)'$/u.exec(
                part,
            );
        if (!outcome) throw new Error(`condition part not understood: ${part}`);
        return outcome[1] === "==" ? unitOutcome === outcome[2] : unitOutcome !== outcome[2];
    });
}

describe("vitest JUnit upload (CHAOS-13768)", () => {
    it("the unit step has an id and names the JUnit file for vitest", () => {
        expect(unitStep, "a step with id unit-tests in the unit job").toBeDefined();
        expect(unitStep).toMatch(/^ {12}- run: bash ci\/run_tests\.sh unit$/mu);
        expect(unitStep).toContain("VITEST_JUNIT_FILE: ${{ runner.temp }}/vitest-junit/junit.xml");
    });

    it("vitest.config.ts takes its reporters from the env helper", () => {
        expect(CONFIG).toContain('import { vitestReporters } from "./ci/vitest-reporters";');
        expect(CONFIG).toContain("reporters: vitestReporters(process.env),");
    });

    it("uploads exactly the file the unit step writes, after the unit step", () => {
        expect(uploadStep, "an Upload vitest JUnit step in the unit job").toBeDefined();
        expect(unitSteps.indexOf(uploadStep)).toBeGreaterThan(unitSteps.indexOf(unitStep));
        expect(uploadStep).toMatch(
            /uses: actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/u,
        );
        expect(withField(uploadStep, "path")).toBe("${{ runner.temp }}/vitest-junit/junit.xml");
        expect(withField(uploadStep, "if-no-files-found")).toBe("error");
        expect(withField(uploadStep, "retention-days")).toBe("14");
    });

    it("uploads when the unit step failed", () => {
        const condition = field(uploadStep, "if");
        expect(condition).toBe("always() && steps.unit-tests.outcome != 'skipped'");
        expect(uploadRuns(condition, "failure")).toBe(true);
        expect(uploadRuns(condition, "success")).toBe(true);
        expect(uploadRuns(condition, "cancelled")).toBe(true);
    });

    it("does not run the upload when the unit step never ran", () => {
        expect(uploadRuns(field(uploadStep, "if"), "skipped")).toBe(false);
    });

    it("the artifact name is selected by the ops tests sync", () => {
        const name = withField(uploadStep, "name");
        expect(name).toMatch(/^vitest-junit-/u);
        for (const prefix of SYNC_EXCLUDED_PREFIXES) expect(name.startsWith(prefix)).toBe(false);
        for (const suffix of SYNC_EXCLUDED_SUFFIXES) expect(name.endsWith(suffix)).toBe(false);
    });

    it("a Tests run uploads fewer than the sync's per-run cap", () => {
        let total = 0;
        for (const [, block] of Object.entries(jobBlocks())) {
            const uploads = (block.match(/uses: actions\/upload-artifact@/gu) ?? []).length;
            if (uploads === 0) continue;
            const shards = /^ {16}shard: \[([0-9, ]+)\]/mu.exec(block);
            total += uploads * (shards ? shards[1].split(",").length : 1);
        }
        expect(total).toBeGreaterThanOrEqual(15);
        expect(total).toBeLessThan(SYNC_ARTIFACT_CAP);
    });
});
