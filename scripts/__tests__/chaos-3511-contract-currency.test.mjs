import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * CHAOS-3511. The pre-existing `check` mode is a CONSISTENCY guard -- it
 * pins web's generated artifacts to exactly `SOURCE_COMMIT` -- but says
 * nothing about whether `SOURCE_COMMIT` itself has gone stale against ops
 * main. This exercises the new `check-currency` mode, which does: it reads
 * the consumed surface (`contracts/ask-dev/v1/`) from two independent Git
 * worktrees and fails loudly, naming every drifted file, when they disagree.
 *
 * Real `git` repositories throughout, not hand-authored JSON standing in
 * for one -- the script reads its inputs exclusively through `git`
 * subprocess calls (`ls-tree`/`show`), so a fixture that skipped git would
 * not exercise the actual read path CI and local runs both use.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/ask-dev-contracts.mjs");
const TEMP_DIRS = new Set();

// Isolated from ambient ASK_DEV_OPS_ROOT / ASK_DEV_OPS_MAIN_ROOT: these tests
// exercise --pinned/--current explicitly, and the harness that runs the
// FULL gate (ci/run_tests.sh) exports both for the whole process tree, which
// would otherwise let `parseArguments`'s env fallback silently supply a real
// value here and mask the "both required" failure this file means to prove.
// The one test that deliberately wants the env fallback (`falls back to
// ASK_DEV_OPS_ROOT / ASK_DEV_OPS_MAIN_ROOT ...`) sets its own env directly
// and does not use this helper.
function run(args) {
    const env = { ...process.env };
    delete env.ASK_DEV_OPS_ROOT;
    delete env.ASK_DEV_OPS_MAIN_ROOT;
    return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8", env });
}

function git(cwd, args) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
    }
    return result.stdout;
}

/** A real Git repository seeded with `files` in a single commit. */
function repoWithFiles(files) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "chaos-3511-ops-")));
    TEMP_DIRS.add(root);
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "chaos-3511@example.com"]);
    git(root, ["config", "user.name", "CHAOS-3511 test"]);
    git(root, ["config", "commit.gpgsign", "false"]);
    for (const [relativePath, contents] of Object.entries(files)) {
        const destination = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, contents);
    }
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "seed"]);
    return root;
}

afterEach(() => {
    for (const dir of TEMP_DIRS) fs.rmSync(dir, { recursive: true, force: true });
    TEMP_DIRS.clear();
});

describe("CHAOS-3511 ask-dev contract currency guard", () => {
    it("passes when the pinned and current consumed surfaces are byte-identical", () => {
        const files = {
            "contracts/ask-dev/v1/manifest.json": '{"a":1}\n',
            "contracts/ask-dev/v1/schemas/dev_x.v1.schema.json": '{"b":2}\n',
        };
        const pinned = repoWithFiles(files);
        const current = repoWithFiles(files);

        const result = run(["check-currency", "--pinned", pinned, "--current", current]);
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain("is current with ops main");
    });

    // RED against the pre-CHAOS-3511 mock: before this mode existed, no
    // command in `ci/run_tests.sh`'s quality tier could ever produce this
    // failure -- a 54-commit-stale pin stayed permanently green. This is the
    // guard that closes it, proven against real, independently-committed
    // drift rather than asserted in the abstract.
    it("fails loudly and names every drifted file when the consumed surface changed", () => {
        const pinned = repoWithFiles({
            "contracts/ask-dev/v1/manifest.json": '{"a":1}\n',
            "contracts/ask-dev/v1/schemas/dev_removed.v1.schema.json": '{"gone":true}\n',
        });
        const current = repoWithFiles({
            "contracts/ask-dev/v1/manifest.json": '{"a":2}\n',
            "contracts/ask-dev/v1/schemas/dev_added.v1.schema.json": '{"new":true}\n',
        });

        const result = run(["check-currency", "--pinned", pinned, "--current", current]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("is stale against ops main");
        expect(result.stderr).toContain("changed: manifest.json");
        expect(result.stderr).toContain("added: schemas/dev_added.v1.schema.json");
        expect(result.stderr).toContain("removed: schemas/dev_removed.v1.schema.json");
        expect(result.stderr).toContain("regenerate: pnpm ask-dev:contracts:generate");
    });

    it("ignores drift outside contracts/ask-dev/v1/ (web does not consume v2)", () => {
        const pinned = repoWithFiles({
            "contracts/ask-dev/v1/manifest.json": '{"a":1}\n',
            "contracts/ask-dev/v2/manifest.json": '{"v2":1}\n',
        });
        const current = repoWithFiles({
            "contracts/ask-dev/v1/manifest.json": '{"a":1}\n',
            "contracts/ask-dev/v2/manifest.json": '{"v2":999}\n',
            "contracts/ask-dev/v2/schemas/dev_answer.v2.schema.json": '{"new":true}\n',
        });

        const result = run(["check-currency", "--pinned", pinned, "--current", current]);
        expect(result.status, result.stderr).toBe(0);
    });

    it("fails closed when --pinned or --current is missing", () => {
        const result = run(["check-currency", "--pinned", "/tmp/does-not-matter"]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("check-currency requires --pinned and --current");
    });

    it("falls back to ASK_DEV_OPS_ROOT / ASK_DEV_OPS_MAIN_ROOT when no flags are given", () => {
        const files = { "contracts/ask-dev/v1/manifest.json": '{"a":1}\n' };
        const pinned = repoWithFiles(files);
        const current = repoWithFiles(files);

        const result = spawnSync(process.execPath, [SCRIPT, "check-currency"], {
            cwd: ROOT,
            encoding: "utf8",
            env: { ...process.env, ASK_DEV_OPS_MAIN_ROOT: current, ASK_DEV_OPS_ROOT: pinned },
        });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain("is current with ops main");
    });

    it("fails when the current root is not a clean Git worktree", () => {
        const pinned = repoWithFiles({ "contracts/ask-dev/v1/manifest.json": '{"a":1}\n' });
        const notARepo = fs.realpathSync.native(
            fs.mkdtempSync(path.join(os.tmpdir(), "chaos-3511-not-git-")),
        );
        TEMP_DIRS.add(notARepo);

        const result = run(["check-currency", "--pinned", pinned, "--current", notARepo]);
        expect(result.status).not.toBe(0);
    });

    it("fails when ops main has no Ask Dev artifacts at all under the consumed surface", () => {
        const pinned = repoWithFiles({ "contracts/ask-dev/v1/manifest.json": '{"a":1}\n' });
        const current = repoWithFiles({ "README.md": "unrelated\n" });

        const result = run(["check-currency", "--pinned", pinned, "--current", current]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("ops main has no Ask Dev artifacts");
    });
});
