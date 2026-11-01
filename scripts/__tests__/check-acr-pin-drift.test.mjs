import childProcess, { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";

import { checkDrift, main, sourcePathsFromManifest } from "../check-acr-pin-drift.mjs";

const SCRIPT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../check-acr-pin-drift.mjs",
);
const tmpDirs = [];
const PATHS = ["contracts/openapi/a.json", "contracts/jsonschema/v1/s.json"];
const g = (cwd, ...args) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();

function commit(repo, files, msg) {
    for (const [f, c] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
        fs.writeFileSync(path.join(repo, f), c);
    }
    g(repo, "add", "-A");
    g(repo, "commit", "-q", "-m", msg);
    return g(repo, "rev-parse", "HEAD");
}

function fakeAcr() {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "fake-acr-"));
    tmpDirs.push(repo);
    g(repo, "init", "-q", "-b", "main");
    // allow fetching an arbitrary commit by SHA
    g(repo, "config", "uploadpack.allowAnySHA1InWant", "true");
    const base = commit(
        repo,
        {
            "contracts/openapi/a.json": "1",
            "contracts/jsonschema/v1/s.json": "1",
            "README.md": "x",
        },
        "base",
    );
    return { repo, base };
}

afterAll(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("checkDrift", () => {
    it("is current when the pin is acr main", () => {
        const { repo, base } = fakeAcr();
        expect(checkDrift({ remote: repo, pin: base, paths: PATHS }).status).toBe("current");
    });
    it("is current when main moved without touching contracts/", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "README.md": "y" }, "docs only");
        expect(checkDrift({ remote: repo, pin: base, paths: PATHS }).status).toBe("current");
    });
    it("is current when only a contract file NOT in the manifest changed (an mcp_* schema web does not vendor)", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/jsonschema/v1/mcp_x.v1.schema.json": "2" }, "mcp only");
        expect(checkDrift({ remote: repo, pin: base, paths: PATHS }).status).toBe("current");
    });
    it("is drift when a manifest-listed mcp_* file changed (it IS vendored)", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/jsonschema/v1/mcp_v.v1.schema.json": "1" }, "add");
        const pin = g(repo, "rev-parse", "HEAD");
        commit(repo, { "contracts/jsonschema/v1/mcp_v.v1.schema.json": "2" }, "change");
        const r = checkDrift({
            remote: repo,
            pin,
            paths: [...PATHS, "contracts/jsonschema/v1/mcp_v.v1.schema.json"],
        });
        expect(r.status).toBe("drift");
        expect(base).toBeTruthy();
    });
    it("is current for a mode-only change (same content)", () => {
        const { repo, base } = fakeAcr();
        fs.chmodSync(path.join(repo, "contracts/openapi/a.json"), 0o755);
        g(repo, "add", "-A");
        g(repo, "commit", "-q", "-m", "mode");
        expect(checkDrift({ remote: repo, pin: base, paths: PATHS }).status).toBe("current");
    });
    it("THROWS when a manifest path exists at neither commit, or is a glob", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/openapi/a.json": "2" }, "change");
        for (const bad of ["contracts/openapi/no-such.json", "contracts/openapi/*.json"]) {
            expect(() => checkDrift({ remote: repo, pin: base, paths: [bad] })).toThrow(
                /neither pin nor main/,
            );
        }
    });
    it("THROWS on a bad manifest path even when the pin IS acr main", () => {
        const { repo, base } = fakeAcr();
        expect(() =>
            checkDrift({ remote: repo, pin: base, paths: ["contracts/openapi/missing.json"] }),
        ).toThrow(/neither pin nor main/);
    });
    it("rejects a directory entry as a vendored path", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/openapi/a.json": "2" }, "change");
        expect(() =>
            checkDrift({
                remote: repo,
                pin: base,
                paths: ["contracts/openapi", "contracts/jsonschema/v1"],
            }),
        ).toThrow(/neither pin nor main/);
    });
    it("the real manifest maps to EXACTLY the generator's source path list", () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
        const sync = fs.readFileSync(path.join(root, "scripts/sync-acr-contracts.mjs"), "utf8");
        const declared = [...sync.matchAll(/^\s*"(contracts\/[^"]+)",$/gm)].map((m) => m[1]).sort();
        const mapped = sourcePathsFromManifest(
            path.join(root, "src/lib/acr/contracts/manifest.json"),
        ).sort();
        expect(declared.length).toBeGreaterThan(30);
        expect(mapped).toEqual(declared);
    });
    it("maps manifest paths back to acr source paths", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mf-"));
        tmpDirs.push(dir);
        const m = path.join(dir, "m.json");
        fs.writeFileSync(
            m,
            JSON.stringify({
                files: [
                    { path: "openapi/a.json" },
                    { path: "schemas/s.json" },
                    { path: "examples/e.json" },
                ],
            }),
        );
        expect(sourcePathsFromManifest(m)).toEqual([
            "contracts/openapi/a.json",
            "contracts/jsonschema/v1/s.json",
            "contracts/examples/v1/e.json",
        ]);
    });
    it("is drift when contracts/ changed after the pin", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/openapi/a.json": "2" }, "contract change");
        const r = checkDrift({ remote: repo, pin: base, paths: PATHS });
        expect(r.status).toBe("drift");
        expect(r.changed).toEqual(["contracts/openapi/a.json"]);
    });
    it("THROWS (never passes) when the remote cannot be fetched", () => {
        const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        try {
            expect(() =>
                checkDrift({
                    remote: "/nonexistent/acr.git",
                    pin: "a".repeat(40),
                    paths: PATHS,
                    sleep: () => {},
                }),
            ).toThrow();
        } finally {
            warn.mockRestore();
        }
    });
});

describe("cli exit codes", () => {
    const run = (remote, pin) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-"));
        tmpDirs.push(dir);
        const manifest = path.join(dir, "manifest.json");
        fs.writeFileSync(
            manifest,
            JSON.stringify({ source_commit: pin, files: [{ path: "openapi/a.json" }] }),
        );
        const output = path.join(dir, "github-output");
        const result = spawnSync("node", [SCRIPT], {
            env: {
                ...process.env,
                ACR_REMOTE: remote,
                ACR_MANIFEST: manifest,
                GITHUB_OUTPUT: output,
            },
            encoding: "utf8",
        });
        result.outputs = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
        return result;
    };
    it("exits 0 on a clean pin", () => {
        const { repo, base } = fakeAcr();
        const r = run(repo, base);
        expect(r.status).toBe(0);
        expect(r.outputs).toBe(`status=current\npin=${base}\nhead=${base}\n`);
    });
    it("exits 1 on planted drift", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/openapi/a.json": "2" }, "planted");
        const r = run(repo, base);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("DRIFT");
        expect(r.outputs).toMatch(/^status=drift\npin=[0-9a-f]{40}\nhead=[0-9a-f]{40}\n$/);
        expect(r.outputs).not.toContain(`head=${base}`);
    });
    it("exits 2 on fetch failure", () => {
        const r = run("/nonexistent/acr.git", "a".repeat(40));
        expect(r.status).toBe(2);
        expect(r.stderr).toContain("could NOT run");
        expect(r.outputs).toBe("status=error\npin=" + "a".repeat(40) + "\n");
    });
    it("exits 2 on a malformed pin", () => {
        const { repo } = fakeAcr();
        expect(run(repo, "main").status).toBe(2);
    });
});

// CHAOS-12444: outcome naming. Real local git remotes; the only injected faults are a failing
// temp-dir removal and a sleep hook that heals the remote between attempts.
describe("outcome", () => {
    const manifestFor = (pin, files = [{ path: "openapi/a.json" }]) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-"));
        tmpDirs.push(dir);
        const manifest = path.join(dir, "manifest.json");
        fs.writeFileSync(manifest, JSON.stringify({ source_commit: pin, files }));
        return { manifest, out: path.join(dir, "github-output.txt") };
    };
    // Runs main() with stdout/stderr captured; returns the code, the text and the GITHUB_OUTPUT file.
    const runMain = ({ remote, pin, files, enforce }, deps = {}) => {
        const { manifest, out } = manifestFor(pin, files);
        fs.writeFileSync(out, "");
        const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        const outw = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        try {
            const env = { ACR_REMOTE: remote, ACR_MANIFEST: manifest, GITHUB_OUTPUT: out };
            if (enforce !== undefined) env.ACR_PIN_ENFORCE = enforce;
            const code = main(env, deps);
            return {
                code,
                stderr: err.mock.calls.map((c) => String(c[0])).join(""),
                stdout: outw.mock.calls.map((c) => String(c[0])).join(""),
                output: fs.readFileSync(out, "utf8"),
            };
        } finally {
            err.mockRestore();
            outw.mockRestore();
        }
    };
    // The real fault seen on runners (ENOTEMPTY from rmSync), injected where it happens: fs.rmSync.
    // The spy removes the dir for real first, so tests leave nothing behind, then throws.
    const withFailingRemove = (fn) => {
        const real = fs.rmSync;
        const spy = vi.spyOn(fs, "rmSync").mockImplementation((p, o) => {
            real(p, o);
            throw new Error(`ENOTEMPTY: directory not empty, rmdir '${p}/.git/objects'`);
        });
        try {
            return fn();
        } finally {
            spy.mockRestore();
        }
    };

    it("a failed temp removal after a CLEAN measurement stays current (exit 0) and warns", () => {
        const { repo, base } = fakeAcr();
        const r = withFailingRemove(() => runMain({ remote: repo, pin: base }));
        expect(r.code).toBe(0);
        expect(r.output).toContain("status=current");
        expect(r.stderr).toMatch(/warning: .*could not remove temp dir/);
        expect(r.stderr).not.toContain("could NOT run");
    });
    it("a failed temp removal after a DRIFT measurement stays drift (exit 1)", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/openapi/a.json": "2" }, "planted");
        const r = withFailingRemove(() => runMain({ remote: repo, pin: base }));
        expect(r.code).toBe(1);
        expect(r.output).toContain("status=drift");
        expect(r.stderr).toMatch(/warning: .*could not remove temp dir/);
    });
    it("checkDrift returns the finished result when the removal fails", () => {
        const { repo, base } = fakeAcr();
        const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        try {
            expect(
                withFailingRemove(() => checkDrift({ remote: repo, pin: base, paths: PATHS }))
                    .status,
            ).toBe("current");
        } finally {
            warn.mockRestore();
        }
    });
    it("asks rmSync to retry a busy dir (maxRetries 5, retryDelay 100)", () => {
        const { repo, base } = fakeAcr();
        const real = fs.rmSync;
        const calls = [];
        const spy = vi.spyOn(fs, "rmSync").mockImplementation((p, o) => {
            calls.push(o);
            return real(p, o);
        });
        try {
            checkDrift({ remote: repo, pin: base, paths: PATHS });
        } finally {
            spy.mockRestore();
        }
        expect(calls).toEqual([{ recursive: true, force: true, maxRetries: 5, retryDelay: 100 }]);
    });
    it("a transient fetch failure that then succeeds gives the true result", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/openapi/a.json": "2" }, "planted");
        const away = `${repo}-away`;
        tmpDirs.push(away);
        fs.renameSync(repo, away);
        const sleeps = [];
        const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        try {
            const r = checkDrift({
                remote: repo,
                pin: base,
                paths: PATHS,
                sleep: (ms) => {
                    sleeps.push(ms);
                    fs.renameSync(away, repo); // the network heals during the first backoff
                },
            });
            expect(r.status).toBe("drift");
        } finally {
            warn.mockRestore();
        }
        expect(sleeps).toEqual([500]);
    });
    it("a fetch that keeps failing exits 2 with status=error after a bounded retry", () => {
        const sleeps = [];
        const r = runMain(
            { remote: "/nonexistent/acr.git", pin: "a".repeat(40) },
            { sleep: (ms) => sleeps.push(ms) },
        );
        expect(r.code).toBe(2);
        expect(r.output).toContain("status=error");
        expect(r.output).not.toContain("status=current");
        expect(r.output).not.toContain("status=drift");
        expect(sleeps).toEqual([500, 1500]); // 3 attempts: the first + 2 retries
        expect(r.stderr).toContain("::error title=ACR pin drift: tool failure, not drift::");
        expect(r.stderr).not.toContain("ACR contract pin drift");
    });
    it("a broken manifest path exits 2 at once, with no retry", () => {
        const { repo, base } = fakeAcr();
        const sleeps = [];
        const r = runMain(
            { remote: repo, pin: base, files: [{ path: "openapi/no-such.json" }] },
            { sleep: (ms) => sleeps.push(ms) },
        );
        expect(r.code).toBe(2);
        expect(r.output).toContain("status=error");
        expect(r.stderr).toContain("::error title=ACR pin drift: tool failure, not drift::");
        expect(r.stderr).toContain("not retried");
        expect(sleeps).toHaveLength(0);
        // an unrecognised manifest path and a bad pin are also instant
        const bad = runMain(
            { remote: repo, pin: base, files: [{ path: "weird/x.json" }] },
            { sleep: (ms) => sleeps.push(ms) },
        );
        expect(bad.code).toBe(2);
        expect(
            runMain({ remote: repo, pin: "main" }, { sleep: (ms) => sleeps.push(ms) }).code,
        ).toBe(2);
        expect(sleeps).toHaveLength(0);
    });
    it("drift prints the drift title; a tool failure never does", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/openapi/a.json": "2" }, "planted");
        const r = runMain({ remote: repo, pin: base });
        expect(r.code).toBe(1);
        expect(r.stderr).toContain("::error title=ACR contract pin drift::");
        expect(r.stderr).not.toContain("tool failure");
        expect(r.output).toContain(`pin=${base}`);
    });
    it("a clean run writes status=current and no annotation", () => {
        const { repo, base } = fakeAcr();
        const r = runMain({ remote: repo, pin: base });
        expect(r.code).toBe(0);
        expect(r.output).toContain("status=current");
        expect(r.stderr).not.toContain("::error");
        expect(r.stderr).not.toContain("::warning");
    });
    it("ACR_PIN_ENFORCE=false turns annotations into warnings and keeps the exit codes", () => {
        const { repo, base } = fakeAcr();
        commit(repo, { "contracts/openapi/a.json": "2" }, "planted");
        const drift = runMain({ remote: repo, pin: base, enforce: "false" });
        expect(drift.code).toBe(1);
        expect(drift.stderr).toContain("::warning title=ACR contract pin drift::");
        expect(drift.stderr).not.toContain("::error");
        const tool = runMain(
            { remote: "/nonexistent/acr.git", pin: "a".repeat(40), enforce: "false" },
            { sleep: () => {} },
        );
        expect(tool.code).toBe(2);
        expect(tool.stderr).toContain("::warning title=ACR pin drift: tool failure, not drift::");
        expect(tool.stderr).not.toContain("::error");
    });
});

// Codex round: a git failure is never a verdict, and nothing printed can forge a workflow command.
describe("tool failures are not verdicts", () => {
    const manifestFor = (pin, files) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-"));
        tmpDirs.push(dir);
        const manifest = path.join(dir, "manifest.json");
        fs.writeFileSync(manifest, JSON.stringify({ source_commit: pin, files }));
        return { manifest, out: path.join(dir, "github-output.txt") };
    };
    const runMain = (
        { remote, pin, files = [{ path: "openapi/a.json" }], manifestPath },
        deps = {},
    ) => {
        const { manifest, out } = manifestFor(pin, files);
        fs.writeFileSync(out, "");
        const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        const outw = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        try {
            const code = main(
                {
                    ACR_REMOTE: remote,
                    ACR_MANIFEST: manifestPath ?? manifest,
                    GITHUB_OUTPUT: out,
                },
                deps,
            );
            return {
                code,
                stderr: err.mock.calls.map((c) => String(c[0])).join(""),
                output: fs.readFileSync(out, "utf8"),
            };
        } finally {
            err.mockRestore();
            outw.mockRestore();
        }
    };
    // Make git calls matching `match` fail with a git-style error: `times` times, or forever.
    const failGit = (match, times = Infinity) => {
        const real = childProcess.execFileSync;
        let left = times;
        return vi.spyOn(childProcess, "execFileSync").mockImplementation((cmd, args, opts) => {
            if (left > 0 && cmd === "git" && match(args)) {
                left -= 1;
                throw Object.assign(new Error("fatal: simulated git failure"), { status: 128 });
            }
            return real(cmd, args, opts);
        });
    };
    const readsHead = (head) => (args) => args[0] === "ls-tree" && args.includes(head);
    const setup = () => {
        const { repo, base } = fakeAcr();
        const head = commit(repo, { "README.md": "y" }, "docs only"); // truth: current
        return { repo, base, head };
    };

    it("one failed read of ONE side retries and gives the true result, never drift", () => {
        const { repo, base, head } = setup();
        const sleeps = [];
        const spy = failGit(readsHead(head), 1);
        try {
            const r = runMain({ remote: repo, pin: base }, { sleep: (ms) => sleeps.push(ms) });
            expect(r.code).toBe(0);
            expect(r.output).toContain("status=current");
            expect(r.output).not.toContain("status=drift");
            expect(sleeps).toEqual([500]);
        } finally {
            spy.mockRestore();
        }
    });
    it("a read of one side that keeps failing is a tool failure: exit 2, status=error, never drift", () => {
        const { repo, base, head } = setup();
        const sleeps = [];
        const spy = failGit(readsHead(head));
        try {
            const r = runMain({ remote: repo, pin: base }, { sleep: (ms) => sleeps.push(ms) });
            expect(r.code).toBe(2);
            expect(r.output).toContain("status=error");
            expect(r.output).not.toMatch(/status=(drift|current)/);
            expect(sleeps).toEqual([500, 1500]);
            expect(r.stderr).toContain("tool failure, not drift");
            expect(r.stderr).toContain("after 3 attempts");
            expect(r.stderr).not.toContain("neither pin nor main");
        } finally {
            spy.mockRestore();
        }
    });
    it("a read that fails on BOTH sides is a retried tool failure, not a broken manifest", () => {
        const { repo, base } = setup();
        const sleeps = [];
        const spy = failGit((args) => args[0] === "ls-tree");
        try {
            const r = runMain({ remote: repo, pin: base }, { sleep: (ms) => sleeps.push(ms) });
            expect(r.code).toBe(2);
            expect(sleeps).toEqual([500, 1500]);
            expect(r.stderr).not.toContain("neither pin nor main");
            expect(r.stderr).not.toContain("not retried");
        } finally {
            spy.mockRestore();
        }
    });
    it("a path that is truly absent on one side is still drift", () => {
        const { repo, base } = fakeAcr();
        fs.rmSync(path.join(repo, "contracts/openapi/a.json"));
        commit(repo, {}, "remove");
        const r = runMain({ remote: repo, pin: base });
        expect(r.code).toBe(1);
        expect(r.output).toContain("status=drift");
    });

    const forged = "::error title=forged::boom";
    const noForgedLine = (stderr) => {
        for (const line of stderr.split("\n")) {
            expect(line.startsWith(forged)).toBe(false);
            if (line.startsWith("::")) expect(line).toMatch(/^::(error|warning) title=ACR /);
        }
        expect(stderr).not.toMatch(/\n::error title=forged/);
    };
    it("a manifest path holding a newline and a workflow command cannot forge one (error line)", () => {
        const { repo, base } = fakeAcr();
        const r = runMain({
            remote: repo,
            pin: base,
            files: [{ path: `openapi/x\n${forged}` }],
        });
        expect(r.code).toBe(2);
        expect(r.stderr).toContain("could NOT run");
        noForgedLine(r.stderr);
    });
    it("a drifted path holding a newline and a workflow command cannot forge one (drift list)", () => {
        const { repo } = fakeAcr();
        const name = `contracts/openapi/b\n${forged}.json`;
        const pin = commit(repo, { [name]: "1" }, "add");
        commit(repo, { [name]: "2" }, "change");
        const r = runMain({
            remote: repo,
            pin,
            files: [{ path: `openapi/b\n${forged}.json` }],
        });
        expect(r.code).toBe(1);
        expect(r.stderr).toContain("DRIFT");
        noForgedLine(r.stderr);
    });
    it("an error text holding a newline and a workflow command cannot forge one (cleanup warning)", () => {
        const { repo, base } = fakeAcr();
        const real = fs.rmSync;
        const spy = vi.spyOn(fs, "rmSync").mockImplementation((p, o) => {
            real(p, o);
            throw new Error(`ENOTEMPTY\n${forged}`);
        });
        try {
            const r = runMain({ remote: repo, pin: base });
            expect(r.code).toBe(0);
            expect(r.stderr).toContain("could not remove temp dir");
            noForgedLine(r.stderr);
        } finally {
            spy.mockRestore();
        }
    });

    it.each([
        ["a null path", [{ path: null }]],
        ["a null entry", [null]],
        ["an entry with no path", [{}]],
        ["a path that is not a string", [{ path: 5 }]],
    ])("%s in the manifest is a no-retry input error", (_, files) => {
        const { repo, base } = fakeAcr();
        const sleeps = [];
        const r = runMain({ remote: repo, pin: base, files }, { sleep: (ms) => sleeps.push(ms) });
        expect(r.code).toBe(2);
        expect(r.output).toContain("status=error");
        expect(r.stderr).toContain("manifest entry has no path");
        expect(r.stderr).toContain("not retried");
        expect(r.stderr).not.toMatch(/after \d+ attempts/);
        expect(sleeps).toHaveLength(0);
    });
    it("a manifest that is missing or not JSON is a no-retry input error", () => {
        const { repo, base } = fakeAcr();
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-"));
        tmpDirs.push(dir);
        const bad = path.join(dir, "bad.json");
        fs.writeFileSync(bad, "{not json");
        for (const manifestPath of [bad, path.join(dir, "missing.json")]) {
            const sleeps = [];
            const r = runMain(
                { remote: repo, pin: base, manifestPath },
                { sleep: (ms) => sleeps.push(ms) },
            );
            expect(r.code).toBe(2);
            expect(r.stderr).toContain("not retried");
            expect(r.stderr).not.toMatch(/after \d+ attempts/);
            expect(sleeps).toHaveLength(0);
        }
    });
    it("the attempts text states the attempts really made", () => {
        const sleeps = [];
        const r = runMain(
            { remote: "/nonexistent/acr.git", pin: "a".repeat(40) },
            { sleep: (ms) => sleeps.push(ms) },
        );
        expect(r.stderr).toContain(`after ${sleeps.length + 1} attempts`);
        expect(r.stderr).not.toContain("not retried");
    });
    const failRead = (target, code, times = Infinity) => {
        const real = fs.readFileSync;
        let left = times;
        return vi.spyOn(fs, "readFileSync").mockImplementation((file, ...rest) => {
            if (left > 0 && file === target) {
                left -= 1;
                throw Object.assign(new Error(`${code}: simulated read error`), { code });
            }
            return real(file, ...rest);
        });
    };
    it("a read error that is not ENOENT (EIO) is a tool failure: retried, and heals", () => {
        const { repo, base } = fakeAcr();
        const { manifest, out } = manifestFor(base, [{ path: "openapi/a.json" }]);
        fs.writeFileSync(out, "");
        const sleeps = [];
        const spy = failRead(manifest, "EIO", 1);
        try {
            const r = runMain(
                { remote: repo, pin: base, manifestPath: manifest },
                { sleep: (ms) => sleeps.push(ms) },
            );
            expect(r.code).toBe(0);
            expect(r.output).toContain("status=current");
            expect(sleeps).toEqual([500]);
        } finally {
            spy.mockRestore();
        }
    });
    it("a read error that keeps failing (EIO) exits 2 after the attempts made, not as a broken input", () => {
        const { repo, base } = fakeAcr();
        const { manifest } = manifestFor(base, [{ path: "openapi/a.json" }]);
        const sleeps = [];
        const spy = failRead(manifest, "EIO");
        try {
            const r = runMain(
                { remote: repo, pin: base, manifestPath: manifest },
                { sleep: (ms) => sleeps.push(ms) },
            );
            expect(r.code).toBe(2);
            expect(r.output).toContain("status=error");
            expect(sleeps).toEqual([500, 1500]);
            expect(r.stderr).toContain("after 3 attempts");
            expect(r.stderr).not.toContain("not retried");
        } finally {
            spy.mockRestore();
        }
    });
    it("an absent manifest (ENOENT) is a broken input: no retry", () => {
        const { repo, base } = fakeAcr();
        const sleeps = [];
        const r = runMain(
            {
                remote: repo,
                pin: base,
                manifestPath: path.join(os.tmpdir(), "no-such-manifest.json"),
            },
            { sleep: (ms) => sleeps.push(ms) },
        );
        expect(r.code).toBe(2);
        expect(r.stderr).toContain("does not exist");
        expect(r.stderr).toContain("not retried");
        expect(sleeps).toHaveLength(0);
    });
    it("a path with unusual characters compares raw: drift when it changed, current when not", () => {
        const { repo } = fakeAcr();
        const name = 'contracts/openapi/\u00e9 "q"\tx.json';
        const pin = commit(repo, { [name]: "1" }, "add");
        const paths = [name];
        expect(checkDrift({ remote: repo, pin, paths }).status).toBe("current");
        commit(repo, { [name]: "2" }, "change");
        expect(checkDrift({ remote: repo, pin, paths })).toMatchObject({
            status: "drift",
            changed: [name],
        });
    });
});

describe("workflow contract", () => {
    const wf = fs.readFileSync(
        path.resolve(path.dirname(SCRIPT), "../.github/workflows/acr-pin-drift.yml"),
        "utf8",
    );
    const step = (name) => {
        const i = wf.indexOf(`- name: ${name}`);
        expect(i).toBeGreaterThan(-1);
        const next = wf.indexOf("\n            - ", i + 1);
        const end = next === -1 ? wf.length : next;
        const job = wf.indexOf("\n    bump:", i);
        return wf.slice(i, job !== -1 && job < end ? job : end);
    };
    it("bump runs ONLY on status drift: never on a tool failure", () => {
        const bump = wf.slice(
            wf.indexOf("\n    bump:"),
            wf.indexOf("\n        steps:", wf.indexOf("\n    bump:")),
        );
        expect(bump).toMatch(/if: .*needs\.drift\.outputs\.status == 'drift'/);
        expect(bump).not.toMatch(/status == 'error'|status != 'current'|status != ''/);
        expect(bump.match(/needs\.drift\.outputs\.status/g)).toHaveLength(1);
    });
    it("the check step is told whether drift is enforced, and sets no other secret", () => {
        const check = step("Compare the vendored pin with acr main");
        expect(check).toContain("continue-on-error: true");
        expect(check).toContain("ACR_PIN_ENFORCE: ${{ steps.scope.outputs.enforce }}");
        expect(check).not.toMatch(/GH_TOKEN|github\.token|secrets\./);
    });
    it("no generic advisory step: the script names drift and a tool failure itself", () => {
        expect(wf).not.toContain("Advisory drift");
        expect(wf).not.toContain("or the check could not run");
    });
    it("the job fails on a failed check only where drift is enforced", () => {
        const fail = step("Fail when enforced");
        expect(fail).toContain("steps.scope.outputs.enforce == 'true'");
        expect(fail).toContain("steps.check.outcome == 'failure'");
        expect(fail).toContain("exit 1");
    });
});
