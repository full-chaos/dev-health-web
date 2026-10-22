import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HARNESS = path.resolve(import.meta.dirname, "../../ci/run_tests.sh");

function extract() {
    const text = readFileSync(HARNESS, "utf8");
    const start = text.indexOf("run_timed() {");
    const mid = text.indexOf("playwright_launch_probe() {");
    const end = text.indexOf("install_playwright_browser() {");
    return `${text.slice(start, text.indexOf("\n}\n", start) + 3)}\n${text.slice(mid, end)}`;
}

function run({ probeExits, depsExit }) {
    const dir = mkdtempSync(path.join(tmpdir(), "pw-install-"));
    const log = path.join(dir, "calls.log");
    const write = (name, body) => {
        writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${body}\n`);
        chmodSync(path.join(dir, name), 0o755);
    };
    write(
        "npx",
        `echo "npx $*" >> "${log}"\n[[ "$*" == *install-deps* ]] && exit ${depsExit}\nexit 0`,
    );
    write("timeout", `shift 2\nexec "$@"`);
    write(
        "node",
        `echo node >> "${log}"\nn=$(grep -c '^node$' "${log}")\ncodes=(${probeExits.join(" ")})\nexit "\${codes[$((n-1))]}"`,
    );
    const script = `set -euo pipefail\n${extract()}\ninstall_playwright_browser_ci_linux`;
    const result = spawnSync("bash", ["-c", script], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
        encoding: "utf8",
    });
    return { status: result.status, calls: readFileSync(log, "utf8").trim().split("\n") };
}

describe("CI Linux Playwright browser install", () => {
    it("skips apt when the probe passes", () => {
        const r = run({ probeExits: [0], depsExit: 0 });
        expect(r.status).toBe(0);
        expect(r.calls).toEqual(["npx playwright install chromium", "node"]);
    });

    it("falls back to install-deps on any non-zero probe exit and reprobes", () => {
        const r = run({ probeExits: [124, 0], depsExit: 0 });
        expect(r.status).toBe(0);
        expect(r.calls).toEqual([
            "npx playwright install chromium",
            "node",
            "npx playwright install-deps chromium",
            "node",
        ]);
    });

    it("fails when install-deps fails, without reprobing", () => {
        const r = run({ probeExits: [17, 0], depsExit: 9 });
        expect(r.status).toBe(9);
        expect(r.calls.filter((c) => c === "node")).toHaveLength(1);
    });

    it("fails when the second probe fails", () => {
        const r = run({ probeExits: [1, 29], depsExit: 0 });
        expect(r.status).toBe(29);
    });
});
