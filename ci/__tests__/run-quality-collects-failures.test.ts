import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "..", "run_tests.sh");

function runQuality(failing: string[]) {
    const dir = mkdtempSync(join(tmpdir(), "run-quality-"));
    const log = join(dir, "calls.log");
    writeFileSync(
        join(dir, "pnpm"),
        `#!/usr/bin/env bash
echo "$*" >> "${log}"
for f in ${failing.map((f) => `"${f}"`).join(" ")}; do
  if [[ "$*" == "$f"* ]]; then exit 1; fi
done
exit 0
`,
    );
    chmodSync(join(dir, "pnpm"), 0o755);
    const result = spawnSync("bash", [SCRIPT, "quality"], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, WIRE_PARITY_OPS_ROOT: dir },
    });
    const calls = readFileSync(log, "utf8").trim().split("\n");
    return { result, calls };
}

describe("run_tests.sh quality", () => {
    it("runs every step when the first one fails, and exits non-zero", () => {
        const { result, calls } = runQuality(["codegen:check"]);
        expect(result.status).not.toBe(0);
        expect(calls.map((c) => c.split(" ")[0])).toEqual([
            "codegen:check",
            "graphql:wire-parity:check",
            "lint",
            "typecheck",
            "audit",
        ]);
        expect(result.stderr).toContain("QUALITY-STEP FAIL: run_pnpm_script codegen:check");
    });

    it("reports each failing step and passes the rest", () => {
        const { result } = runQuality(["audit", "lint"]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("2 of 5 steps failed");
        expect(result.stdout).toContain("QUALITY-STEP PASS: run_pnpm_script typecheck");
    });

    it("exits zero when all steps pass", () => {
        const { result } = runQuality([]);
        expect(result.status).toBe(0);
    });
});
