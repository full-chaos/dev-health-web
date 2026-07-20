import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect } from "vitest";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const NON_SUCCESS_RESULTS = ["failure", "cancelled", "skipped"];
export const REQUIRED_STAGE_GROUPS = [
    ["general", "Check general test stages", ["format", "quality", "build", "unit", "integration"]],
    ["E2E", "Check E2E test stages", ["e2e-default", "e2e-onboarding", "e2e-context-fabric"]],
    ["PagerDuty", "Check PagerDuty final QA matrix", ["pagerduty-final-qa"]],
];
const execFileAsync = promisify(execFile);
const PLAYWRIGHT_CLI = path.join(ROOT, "node_modules/@playwright/test/cli.js");

export function contents(file) {
    return fs.readFileSync(file, "utf8");
}

export function runHarness(args, environment = {}) {
    return spawnSync("bash", [path.join(ROOT, "ci/run_tests.sh"), ...args], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, ...environment },
    });
}

export function recordHarnessPackageCommands(args, { failScript } = {}) {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chaos-3017-contract-"));
    const commandLog = path.join(temporaryDirectory, "commands.log");
    const recorder = [
        "#!/usr/bin/env bash",
        'printf \'%s\\n\' "$*" >> "$CI_CONTRACT_COMMAND_LOG"',
        'if [[ -n "${CI_CONTRACT_FAIL_SCRIPT:-}" && "$1" == "$CI_CONTRACT_FAIL_SCRIPT" ]]; then',
        "  exit 42",
        "fi",
        "",
    ].join("\n");
    for (const command of ["pnpm", "npx"]) {
        fs.writeFileSync(path.join(temporaryDirectory, command), recorder, { mode: 0o755 });
    }

    const artifactRoot = `test-results/chaos-3017-contract-${process.pid}`;
    try {
        const result = runHarness(args, {
            CI_CONTRACT_COMMAND_LOG: commandLog,
            CI_CONTRACT_FAIL_SCRIPT: failScript ?? "",
            PATH: `${temporaryDirectory}:${process.env.PATH}`,
            PLAYWRIGHT_REPORT_DIR: `${artifactRoot}/report`,
            PLAYWRIGHT_RESULTS_DIR: `${artifactRoot}/results`,
        });
        const commands = fs.readFileSync(commandLog, "utf8").trim().split(/\r?\n/u);
        return { commands, result };
    } finally {
        fs.rmSync(path.join(ROOT, artifactRoot), { force: true, recursive: true });
        fs.rmSync(temporaryDirectory, { force: true, recursive: true });
    }
}

export function job(workflow, id) {
    const match = workflow.match(
        new RegExp(`^    ${id}:\\n([\\s\\S]*?)(?=^    [A-Za-z0-9-]+:|$(?![\\s\\S]))`, "m"),
    );
    expect(match, `missing ${id} job`).not.toBeNull();
    return match[0];
}

export function step(workflowJob, stepName) {
    const lines = workflowJob.split(/\r?\n/u);
    const nameLine = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
    expect(nameLine, `missing ${stepName} step`).toBeGreaterThanOrEqual(0);

    const stepIndent = lines[nameLine].match(/^\s*/u)[0].length;
    const nextStepOffset = lines
        .slice(nameLine + 1)
        .findIndex(
            (line) =>
                line.match(/^\s*/u)[0].length === stepIndent && line.trim().startsWith("- name: "),
        );
    const stepEnd = nextStepOffset === -1 ? lines.length : nameLine + nextStepOffset + 1;
    return lines.slice(nameLine, stepEnd).join("\n");
}

export function runStep(workflowJob, command) {
    const lines = workflowJob.split(/\r?\n/u);
    const runLine = lines.findIndex((line) => line.trim() === `- run: ${command}`);
    expect(runLine, `missing run step: ${command}`).toBeGreaterThanOrEqual(0);
    const stepIndent = lines[runLine].match(/^\s*/u)[0].length;
    const nextStepOffset = lines
        .slice(runLine + 1)
        .findIndex(
            (line) => line.match(/^\s*/u)[0].length === stepIndent && line.trim().startsWith("- "),
        );
    const stepEnd = nextStepOffset === -1 ? lines.length : runLine + nextStepOffset + 1;
    return lines.slice(runLine, stepEnd).join("\n").trimEnd();
}

export function stepRun(workflowJob, stepName) {
    const stepLines = step(workflowJob, stepName).split("\n");
    const runLine = stepLines.findIndex((line) => line.trim() === "run: |");
    expect(runLine, `missing ${stepName} run block`).toBeGreaterThanOrEqual(0);

    const body = stepLines.slice(runLine + 1).filter((line) => line.trim());
    expect(body, `empty ${stepName} run block`).not.toHaveLength(0);
    const bodyIndent = body[0].match(/^\s*/u)[0].length;
    return body.map((line) => line.slice(bodyIndent)).join("\n");
}

export function matrixShardLabels(workflowJob) {
    const match = workflowJob.match(/^\s+shard: \[([^\]]+)\]$/mu);
    expect(match, "missing shard matrix").not.toBeNull();
    const shards = match[1].split(",").map((value) => value.trim());
    expect(shards.every((value) => /^[1-9][0-9]*$/u.test(value))).toBe(true);
    expect(new Set(shards).size).toBe(shards.length);
    return shards.map((shard) => `${shard}/${shards.length}`);
}

export function executeWorkflowRun(script, results) {
    const rendered = script.replace(
        /\$\{\{\s*needs\.([A-Za-z0-9-]+)\.result\s*\}\}/gu,
        (_, stage) => {
            expect(Object.hasOwn(results, stage), `missing result for ${stage}`).toBe(true);
            return results[stage];
        },
    );
    expect(rendered).not.toContain("${{");
    return spawnSync("bash", ["-e", "-c", rendered], {
        cwd: ROOT,
        encoding: "utf8",
    });
}

export function expectSuccessfulProcess(result) {
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr || result.stdout).toBe(0);
}

export async function listDefaultPlaywrightTests(shard, signal) {
    const args = [PLAYWRIGHT_CLI, "test", "--list"];
    if (shard) args.push("--shard", shard);

    const { stdout } = await execFileAsync(process.execPath, args, {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
        maxBuffer: 1024 * 1024,
        signal,
        timeout: 15_000,
    });

    const entryPattern = /^\[[^\]]+\] › .+:\d+:\d+ › .+$/u;
    const entries = stdout
        .split(/\r?\n/u)
        .map((line) => line.trim().replace(/\s+/gu, " "))
        .filter((line) => entryPattern.test(line))
        .map(normalizePlaywrightTestIdentity);
    const total = stdout.match(/^Total: (\d+) tests? in \d+ files?$/mu);
    expect(total, "missing Playwright inventory total").not.toBeNull();
    expect(entries).toHaveLength(Number(total[1]));
    return entries;
}

export function normalizePlaywrightTestIdentity(line) {
    const match = line.match(/^(\[[^\]]+\] › .+?):\d+:\d+( › .+)$/u);
    if (!match) {
        throw new Error(`Unexpected Playwright test listing: ${line}`);
    }
    return `${match[1]}${match[2]}`;
}

export function intersection(left, right) {
    const rightSet = new Set(right);
    return left.filter((entry) => rightSet.has(entry));
}
