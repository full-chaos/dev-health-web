import childProcess, { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";

import { pinMove } from "../ask-dev-pin-scope.mjs";
import { checkPin, main, pinOf, readPin, RENDER_PATHS } from "../check-ask-dev-pin-drift.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, "../check-ask-dev-pin-drift.mjs");
const SCOPE = path.resolve(HERE, "../ask-dev-pin-scope.mjs");
const CONTRACT = "c".repeat(40);
const OTHER = "d".repeat(40);
const tmpDirs = [];
const g = (cwd, ...args) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();

function tmp(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
}

function commit(repo, files, msg) {
    for (const [f, c] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
        fs.writeFileSync(path.join(repo, f), c);
    }
    g(repo, "add", "-A");
    g(repo, "commit", "-q", "-m", msg);
    return g(repo, "rev-parse", "HEAD");
}

const manifest = (source_commit) => JSON.stringify({ source_commit });

function fakeAskDev(contract = CONTRACT) {
    const repo = tmp("fake-ask-dev-");
    g(repo, "init", "-q", "-b", "main");
    // allow fetching an arbitrary commit by SHA
    g(repo, "config", "uploadpack.allowAnySHA1InWant", "true");
    const base = commit(
        repo,
        {
            "package.json": "{}",
            "src/render/index.ts": "1",
            "src/components/a.tsx": "1",
            "src/lib/a.ts": "1",
            "src/app/ask-dev.css": "1",
            "src/app/page.tsx": "1",
            "src/contracts/manifest.json": manifest(contract),
            "README.md": "x",
        },
        "base",
    );
    return { repo, base };
}

const check = (repo, pin, webContract = CONTRACT) =>
    checkPin({ remote: repo, pin, webContract, sleep: () => {} });

afterAll(() => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe("pinOf", () => {
    const spec = (value) => JSON.stringify({ dependencies: { "@full-chaos/ask-dev": value } });
    const SHA = "a".repeat(40);

    it("reads a full commit SHA", () => {
        expect(pinOf(spec(`github:full-chaos/ask-dev#${SHA}`))).toBe(SHA);
    });

    it.each([
        ["a branch", "github:full-chaos/ask-dev#main"],
        ["a short SHA", "github:full-chaos/ask-dev#0892e63f"],
        ["no ref", "github:full-chaos/ask-dev"],
        ["another repo", `github:someone/ask-dev#${SHA}`],
        ["a registry version", "0.0.0"],
    ])("refuses %s", (_, value) => {
        expect(() => pinOf(spec(value))).toThrow(/not pinned to a full commit SHA/u);
    });

    it("refuses a package.json with no dependency", () => {
        expect(() => pinOf("{}")).toThrow(/not pinned/u);
    });

    it("reads this repository's own pin (a broken pin fails here, not only on the schedule)", () => {
        expect(readPin(path.resolve(HERE, "../../package.json"))).toMatch(/^[0-9a-f]{40}$/u);
    });
});

describe("checkPin", () => {
    it("is current when the pin is ask-dev main", () => {
        const { repo, base } = fakeAskDev();
        expect(check(repo, base).status).toBe("current");
    });

    it("is current when main moved without touching a render path", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "README.md": "y", "src/app/page.tsx": "2" }, "standalone only");
        expect(check(repo, base).status).toBe("current");
    });

    it.each([
        ["package.json", '{"x":1}'],
        ["src/app/ask-dev.css", "2"],
        ["src/components/a.tsx", "2"],
        ["src/lib/a.ts", "2"],
        ["src/render/index.ts", "2"],
    ])("is drift when %s changed, and names it", (file, content) => {
        const { repo, base } = fakeAskDev();
        const head = commit(repo, { [file]: content }, "render");
        expect(check(repo, base)).toMatchObject({
            status: "drift",
            pin: base,
            head,
            changed: [file],
        });
    });

    it("is drift when a render file was added or removed", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "src/components/b.tsx": "1" }, "add");
        expect(check(repo, base).changed).toEqual(["src/components/b.tsx"]);
        fs.rmSync(path.join(repo, "src/components/a.tsx"));
        commit(repo, {}, "remove");
        expect(check(repo, base).changed).toEqual(
            expect.arrayContaining(["src/components/a.tsx", "src/components/b.tsx"]),
        );
    });

    it.each(RENDER_PATHS)(
        "render path %s exists in the pinned package (a typo'd path would hide drift)",
        (renderPath) => {
            const pinned = path.resolve(HERE, "../../node_modules/@full-chaos/ask-dev");
            expect(fs.existsSync(path.join(pinned, renderPath))).toBe(true);
        },
    );

    it("is not_on_main for a commit that exists but is not in main's history", () => {
        const { repo, base } = fakeAskDev();
        g(repo, "checkout", "-q", "-b", "side");
        const side = commit(repo, { "src/lib/a.ts": "side" }, "side");
        g(repo, "checkout", "-q", "main");
        commit(repo, { "README.md": "z" }, "main moves");
        expect(check(repo, side).status).toBe("not_on_main");
        expect(check(repo, base).status).toBe("current");
    });

    it("throws for a pin that does not exist: a broken pin is never a verdict", () => {
        const { repo } = fakeAskDev();
        const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        try {
            expect(() => check(repo, "e".repeat(40))).toThrow();
        } finally {
            warn.mockRestore();
        }
    });

    it("is contract_mismatch when the pinned commit carries another ACR contract", () => {
        const { repo, base } = fakeAskDev(OTHER);
        expect(check(repo, base)).toMatchObject({
            status: "contract_mismatch",
            pinContract: OTHER,
            webContract: CONTRACT,
        });
    });

    it("reads the contract at the pin, not at main", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "src/contracts/manifest.json": manifest(OTHER) }, "ask-dev moves first");
        expect(check(repo, base).status).toBe("drift");
    });

    it("the pin check comes before drift: a side commit is reported as that", () => {
        const { repo } = fakeAskDev(OTHER);
        g(repo, "checkout", "-q", "-b", "side");
        const side = commit(repo, { "src/lib/a.ts": "side" }, "side");
        g(repo, "checkout", "-q", "main");
        expect(check(repo, side).status).toBe("not_on_main");
    });
});

describe("the CLI", () => {
    function run({ repo, pin, contract = CONTRACT, output = true }) {
        const dir = tmp("ask-dev-cli-");
        const pkg = path.join(dir, "package.json");
        const web = path.join(dir, "manifest.json");
        const out = path.join(dir, "out.txt");
        fs.writeFileSync(
            pkg,
            JSON.stringify({
                dependencies: { "@full-chaos/ask-dev": `github:full-chaos/ask-dev#${pin}` },
            }),
        );
        fs.writeFileSync(web, manifest(contract));
        const result = spawnSync("node", [SCRIPT], {
            encoding: "utf8",
            env: {
                ...process.env,
                ASK_DEV_REMOTE: repo,
                ASK_DEV_PACKAGE_JSON: pkg,
                ASK_DEV_WEB_MANIFEST: web,
                ...(output ? { GITHUB_OUTPUT: out } : {}),
            },
        });
        return { ...result, outputs: output ? fs.readFileSync(out, "utf8") : "" };
    }

    it("exits 0 when current", () => {
        const { repo, base } = fakeAskDev();
        const result = run({ repo, pin: base });
        expect(result.status).toBe(0);
        expect(result.outputs).toContain("status=current\n");
        expect(result.outputs).toContain(`pin=${base}\n`);
    });

    it("exits 1 on drift and names the bump", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "src/render/index.ts": "2" }, "render");
        const result = run({ repo, pin: base });
        expect(result.status).toBe(1);
        expect(result.outputs).toContain("status=drift\n");
        expect(result.stderr).toContain("src/render/index.ts");
        expect(result.stderr).toContain("pnpm add @full-chaos/ask-dev@github:full-chaos/ask-dev#");
    });

    it("exits 1 on a contract mismatch and a side commit", () => {
        const { repo, base } = fakeAskDev();
        expect(run({ repo, pin: base, contract: OTHER }).status).toBe(1);
        g(repo, "checkout", "-q", "-b", "side");
        const side = commit(repo, { "src/lib/a.ts": "side" }, "side");
        g(repo, "checkout", "-q", "main");
        const result = run({ repo, pin: side });
        expect(result.status).toBe(1);
        expect(result.outputs).toContain("status=not_on_main\n");
    });

    it("exits 2 when the remote cannot be read: a failed fetch never reads as current", () => {
        const result = run({ repo: path.join(os.tmpdir(), "no-such-repo"), pin: "a".repeat(40) });
        expect(result.status).toBe(2);
        expect(result.outputs).toContain("status=error\n");
        expect(result.stderr).toContain("could NOT run");
        expect(result.stderr).toContain(
            "::error title=ask-dev pin drift: tool failure, not drift::",
        );
    });

    it("exits 2 on a pin that is not a full SHA", () => {
        const { repo } = fakeAskDev();
        const result = run({ repo, pin: "main" });
        expect(result.status).toBe(2);
    });
});

// CHAOS-12444: outcome naming. Real local git remotes; the only injected faults are a failing
// temp-dir removal and a sleep hook that heals the remote between attempts.
describe("outcome", () => {
    const inputs = (pin, contract = CONTRACT) => {
        const dir = tmp("ask-dev-main-");
        const pkg = path.join(dir, "package.json");
        const web = path.join(dir, "manifest.json");
        const out = path.join(dir, "out.txt");
        fs.writeFileSync(
            pkg,
            JSON.stringify({
                dependencies: { "@full-chaos/ask-dev": `github:full-chaos/ask-dev#${pin}` },
            }),
        );
        fs.writeFileSync(web, manifest(contract));
        fs.writeFileSync(out, "");
        return { pkg, web, out };
    };
    // Runs main() with stdout/stderr captured; returns the code, the text and the GITHUB_OUTPUT file.
    const runMain = ({ repo, pin, contract, enforce }, deps = {}) => {
        const { pkg, web, out } = inputs(pin, contract);
        const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        const outw = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        try {
            const env = {
                ASK_DEV_REMOTE: repo,
                ASK_DEV_PACKAGE_JSON: pkg,
                ASK_DEV_WEB_MANIFEST: web,
                GITHUB_OUTPUT: out,
            };
            if (enforce !== undefined) env.ASK_DEV_PIN_ENFORCE = enforce;
            const code = main(env, deps);
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
        const { repo, base } = fakeAskDev();
        const r = withFailingRemove(() => runMain({ repo, pin: base }));
        expect(r.code).toBe(0);
        expect(r.output).toContain("status=current");
        expect(r.stderr).toMatch(/warning: .*could not remove temp dir/);
        expect(r.stderr).not.toContain("could NOT run");
    });

    it("a failed temp removal after a DRIFT measurement stays drift (exit 1)", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "src/render/index.ts": "2" }, "render");
        const r = withFailingRemove(() => runMain({ repo, pin: base }));
        expect(r.code).toBe(1);
        expect(r.output).toContain("status=drift");
        expect(r.stderr).toMatch(/warning: .*could not remove temp dir/);
    });

    it("checkPin returns the finished result when the removal fails", () => {
        const { repo, base } = fakeAskDev();
        const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        try {
            expect(withFailingRemove(() => check(repo, base)).status).toBe("current");
        } finally {
            warn.mockRestore();
        }
    });

    it("asks rmSync to retry a busy dir (maxRetries 5, retryDelay 100)", () => {
        const { repo, base } = fakeAskDev();
        const real = fs.rmSync;
        const calls = [];
        const spy = vi.spyOn(fs, "rmSync").mockImplementation((p, o) => {
            calls.push(o);
            return real(p, o);
        });
        try {
            check(repo, base);
        } finally {
            spy.mockRestore();
        }
        expect(calls).toEqual([{ recursive: true, force: true, maxRetries: 5, retryDelay: 100 }]);
    });

    it("a transient fetch failure that then succeeds gives the true result", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "src/render/index.ts": "2" }, "render");
        const away = `${repo}-away`;
        tmpDirs.push(away);
        fs.renameSync(repo, away);
        const sleeps = [];
        const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        try {
            const r = checkPin({
                remote: repo,
                pin: base,
                webContract: CONTRACT,
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
            { repo: path.join(os.tmpdir(), "no-such-repo"), pin: "a".repeat(40) },
            { sleep: (ms) => sleeps.push(ms) },
        );
        expect(r.code).toBe(2);
        expect(r.output).toContain("status=error");
        expect(r.output).not.toContain("status=current");
        expect(r.output).not.toContain("status=drift");
        expect(sleeps).toEqual([500, 1500]); // 3 attempts: the first + 2 retries
        expect(r.stderr).toContain("::error title=ask-dev pin drift: tool failure, not drift::");
        expect(r.stderr).not.toContain("::error title=ask-dev pin drift::");
    });

    it("a broken pin or manifest exits 2 at once, with no retry", () => {
        const { repo, base } = fakeAskDev();
        const sleeps = [];
        const deps = { sleep: (ms) => sleeps.push(ms) };
        const notFull = runMain({ repo, pin: "main" }, deps);
        expect(notFull.code).toBe(2);
        expect(notFull.output).toContain("status=error");
        expect(notFull.stderr).toContain(
            "::error title=ask-dev pin drift: tool failure, not drift::",
        );
        expect(notFull.stderr).toContain("not retried");
        const badContract = runMain({ repo, pin: base, contract: "not-a-sha" }, deps);
        expect(badContract.code).toBe(2);
        // ask-dev's own manifest at the pin is not JSON
        const bad = fakeAskDev();
        const brokenPin = commit(bad.repo, { "src/contracts/manifest.json": "{not json" }, "bad");
        expect(runMain({ repo: bad.repo, pin: brokenPin }, deps).code).toBe(2);
        expect(sleeps).toHaveLength(0);
    });

    it("names each wrong pin, none as a tool failure", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "src/render/index.ts": "2" }, "render");
        const drift = runMain({ repo, pin: base });
        expect(drift.code).toBe(1);
        expect(drift.stderr).toContain("::error title=ask-dev pin drift::");
        const mismatch = runMain({ repo, pin: base, contract: OTHER });
        expect(mismatch.code).toBe(1);
        expect(mismatch.stderr).toContain(
            "::error title=ask-dev pin carries another ACR contract::",
        );
        g(repo, "checkout", "-q", "-b", "side");
        const side = commit(repo, { "src/lib/a.ts": "side" }, "side");
        g(repo, "checkout", "-q", "main");
        const off = runMain({ repo, pin: side });
        expect(off.code).toBe(1);
        expect(off.stderr).toContain("::error title=ask-dev pin not on ask-dev main::");
        for (const r of [drift, mismatch, off]) expect(r.stderr).not.toContain("tool failure");
    });

    it("a clean run writes status=current and no annotation", () => {
        const { repo, base } = fakeAskDev();
        const r = runMain({ repo, pin: base });
        expect(r.code).toBe(0);
        expect(r.stderr).not.toContain("::error");
        expect(r.stderr).not.toContain("::warning");
    });

    it("ASK_DEV_PIN_ENFORCE=false turns annotations into warnings and keeps the exit codes", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "src/render/index.ts": "2" }, "render");
        const drift = runMain({ repo, pin: base, enforce: "false" });
        expect(drift.code).toBe(1);
        expect(drift.stderr).toContain("::warning title=ask-dev pin drift::");
        expect(drift.stderr).not.toContain("::error");
        const tool = runMain(
            { repo: path.join(os.tmpdir(), "no-such-repo"), pin: "a".repeat(40), enforce: "false" },
            { sleep: () => {} },
        );
        expect(tool.code).toBe(2);
        expect(tool.stderr).toContain(
            "::warning title=ask-dev pin drift: tool failure, not drift::",
        );
        expect(tool.stderr).not.toContain("::error");
    });
});

// Codex round: a git failure is never a verdict, and nothing printed can forge a workflow command.
describe("tool failures are not verdicts", () => {
    const run = ({ repo, pin, specPin = pin, pkgText, contract = CONTRACT }, deps = {}) => {
        const dir = tmp("ask-dev-tf-");
        const pkg = path.join(dir, "package.json");
        const web = path.join(dir, "manifest.json");
        const out = path.join(dir, "out.txt");
        fs.writeFileSync(
            pkg,
            pkgText ??
                JSON.stringify({
                    dependencies: { "@full-chaos/ask-dev": `github:full-chaos/ask-dev#${specPin}` },
                }),
        );
        fs.writeFileSync(web, manifest(contract));
        fs.writeFileSync(out, "");
        const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        const outw = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        try {
            const code = main(
                {
                    ASK_DEV_REMOTE: repo,
                    ASK_DEV_PACKAGE_JSON: pkg,
                    ASK_DEV_WEB_MANIFEST: web,
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
    const isMergeBase = (args) => args[0] === "merge-base";

    it("a merge-base that keeps failing is a tool failure, never not_on_main", () => {
        const { repo, base } = fakeAskDev();
        const sleeps = [];
        const spy = failGit(isMergeBase);
        try {
            const r = run({ repo, pin: base }, { sleep: (ms) => sleeps.push(ms) });
            expect(r.code).toBe(2);
            expect(r.output).toContain("status=error");
            expect(r.output).not.toMatch(/status=(not_on_main|current|drift)/);
            expect(sleeps).toEqual([500, 1500]);
            expect(r.stderr).toContain("tool failure, not drift");
            expect(r.stderr).toContain("after 3 attempts");
        } finally {
            spy.mockRestore();
        }
    });
    it("one failed merge-base heals and gives the true result", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "README.md": "y" }, "docs only");
        const spy = failGit(isMergeBase, 1);
        try {
            const r = run({ repo, pin: base }, { sleep: () => {} });
            expect(r.code).toBe(0);
            expect(r.output).toContain("status=current");
        } finally {
            spy.mockRestore();
        }
    });
    it("a failed read of the pinned manifest retries and never reads as a wrong pin", () => {
        const { repo, base } = fakeAskDev();
        const sleeps = [];
        const spy = failGit((args) => args[0] === "show", 1);
        try {
            const r = run({ repo, pin: base }, { sleep: (ms) => sleeps.push(ms) });
            expect(r.code).toBe(0);
            expect(sleeps).toEqual([500]);
        } finally {
            spy.mockRestore();
        }
    });
    it("a failed diff retries and never reads as drift or current", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { "src/render/index.ts": "2" }, "render");
        const sleeps = [];
        const spy = failGit((args) => args[0] === "diff");
        try {
            const r = run({ repo, pin: base }, { sleep: (ms) => sleeps.push(ms) });
            expect(r.code).toBe(2);
            expect(r.output).not.toMatch(/status=(drift|current)/);
            expect(sleeps).toEqual([500, 1500]);
        } finally {
            spy.mockRestore();
        }
    });

    const forged = "::error title=forged::boom";
    const noForgedLine = (stderr) => {
        for (const line of stderr.split("\n")) {
            expect(line.startsWith(forged)).toBe(false);
            if (line.startsWith("::")) expect(line).toMatch(/^::(error|warning) title=ask-dev /);
        }
        expect(stderr).not.toMatch(/\n::error title=forged/);
    };
    it("a package.json spec holding a newline and a workflow command cannot forge one", () => {
        const { repo, base } = fakeAskDev();
        const r = run({ repo, pin: base, specPin: `${base}\n${forged}` });
        expect(r.code).toBe(2);
        expect(r.stderr).toContain("could NOT run");
        noForgedLine(r.stderr);
    });
    it("a changed path holding a newline and a workflow command cannot forge one", () => {
        const { repo, base } = fakeAskDev();
        commit(repo, { [`src/lib/x\n${forged}.ts`]: "1" }, "add");
        const r = run({ repo, pin: base });
        expect(r.code).toBe(1);
        expect(r.stderr).toContain("DRIFT");
        noForgedLine(r.stderr);
    });
    it("an error text holding a newline and a workflow command cannot forge one (cleanup)", () => {
        const { repo, base } = fakeAskDev();
        const real = fs.rmSync;
        const spy = vi.spyOn(fs, "rmSync").mockImplementation((p, o) => {
            real(p, o);
            throw new Error(`ENOTEMPTY\n${forged}`);
        });
        try {
            const r = run({ repo, pin: base });
            expect(r.code).toBe(0);
            expect(r.stderr).toContain("could not remove temp dir");
            noForgedLine(r.stderr);
        } finally {
            spy.mockRestore();
        }
    });

    it("a package.json that is not JSON is a no-retry input error", () => {
        const { repo } = fakeAskDev();
        const sleeps = [];
        const r = run({ repo, pin: "x", pkgText: "{not json" }, { sleep: (ms) => sleeps.push(ms) });
        expect(r.code).toBe(2);
        expect(r.stderr).toContain("not retried");
        expect(r.stderr).not.toMatch(/after \d+ attempts/);
        expect(sleeps).toHaveLength(0);
    });
    it("a null package.json or null dependency is a no-retry input error", () => {
        const { repo } = fakeAskDev();
        for (const pkgText of ["null", '{"dependencies":null}']) {
            const sleeps = [];
            const r = run({ repo, pin: "x", pkgText }, { sleep: (ms) => sleeps.push(ms) });
            expect(r.code).toBe(2);
            expect(r.stderr).toContain("not retried");
            expect(sleeps).toHaveLength(0);
        }
    });
    it("the attempts text states the attempts really made", () => {
        const sleeps = [];
        const r = run(
            { repo: path.join(os.tmpdir(), "no-such-repo"), pin: "a".repeat(40) },
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
    // Runs main() with package.json at a known path, so a read error can be planted on it.
    const runWithPackage = (repo, pin, sleep) => {
        const dir = tmp("ask-dev-read-");
        const pkg = path.join(dir, "package.json");
        const web = path.join(dir, "manifest.json");
        const out = path.join(dir, "out.txt");
        fs.writeFileSync(
            pkg,
            JSON.stringify({
                dependencies: { "@full-chaos/ask-dev": `github:full-chaos/ask-dev#${pin}` },
            }),
        );
        fs.writeFileSync(web, manifest(CONTRACT));
        fs.writeFileSync(out, "");
        return {
            pkg,
            run: () => {
                const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
                const outw = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
                try {
                    const code = main(
                        {
                            ASK_DEV_REMOTE: repo,
                            ASK_DEV_PACKAGE_JSON: pkg,
                            ASK_DEV_WEB_MANIFEST: web,
                            GITHUB_OUTPUT: out,
                        },
                        { sleep },
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
            },
        };
    };
    it("a read error that is not ENOENT (EIO) is a tool failure: retried, and heals", () => {
        const { repo, base } = fakeAskDev();
        const sleeps = [];
        const { pkg, run: go } = runWithPackage(repo, base, (ms) => sleeps.push(ms));
        const spy = failRead(pkg, "EIO", 1);
        try {
            const r = go();
            expect(r.code).toBe(0);
            expect(r.output).toContain("status=current");
            expect(sleeps).toEqual([500]);
        } finally {
            spy.mockRestore();
        }
    });
    it("a read error that keeps failing (EIO) exits 2 after the attempts made, not as a broken input", () => {
        const { repo, base } = fakeAskDev();
        const sleeps = [];
        const { pkg, run: go } = runWithPackage(repo, base, (ms) => sleeps.push(ms));
        const spy = failRead(pkg, "EIO");
        try {
            const r = go();
            expect(r.code).toBe(2);
            expect(r.output).toContain("status=error");
            expect(sleeps).toEqual([500, 1500]);
            expect(r.stderr).toContain("after 3 attempts");
            expect(r.stderr).not.toContain("not retried");
        } finally {
            spy.mockRestore();
        }
    });
    it("an absent package.json (ENOENT) is a broken input: no retry", () => {
        const { repo, base } = fakeAskDev();
        const sleeps = [];
        const { pkg, run: go } = runWithPackage(repo, base, (ms) => sleeps.push(ms));
        fs.rmSync(pkg);
        const r = go();
        expect(r.code).toBe(2);
        expect(r.stderr).toContain("does not exist");
        expect(r.stderr).toContain("not retried");
        expect(sleeps).toHaveLength(0);
    });
    it("a path with unusual characters is listed raw", () => {
        const { repo, base } = fakeAskDev();
        const name = 'src/lib/\u00e9 "q"\tx.ts';
        commit(repo, { [name]: "1" }, "add");
        expect(check(repo, base)).toMatchObject({ status: "drift", changed: [name] });
    });
});

describe("workflow contract", () => {
    const wf = fs.readFileSync(
        path.resolve(HERE, "../../.github/workflows/ask-dev-pin-drift.yml"),
        "utf8",
    );
    const step = (name) => {
        const i = wf.indexOf(`- name: ${name}`);
        expect(i).toBeGreaterThan(-1);
        const next = wf.indexOf("\n            - ", i + 1);
        const job = wf.indexOf("\n    drift-issue:", i);
        const end = next === -1 ? wf.length : next;
        return wf.slice(i, job !== -1 && job < end ? job : end);
    };
    it("the check step is told whether the pin is enforced, and holds no token", () => {
        const check = step("Compare the pin with ask-dev main");
        expect(check).toContain("continue-on-error: true");
        expect(check).toContain("ASK_DEV_PIN_ENFORCE: ${{ steps.scope.outputs.enforce }}");
        expect(check).not.toMatch(/GH_TOKEN|github\.token|secrets\./);
    });
    it("no generic advisory step: the script names each wrong pin and a tool failure itself", () => {
        expect(wf).not.toContain("Advisory drift");
        expect(wf).not.toContain("or the check could not run");
    });
    it("the job fails on a failed check only where the pin is enforced", () => {
        const fail = step("Fail on a wrong pin");
        expect(fail).toContain("steps.scope.outputs.enforce == 'true'");
        expect(fail).toContain("steps.check.outcome == 'failure'");
        expect(fail).toContain("exit 1");
    });
    it("a tool failure opens no drift issue and closes none", () => {
        const i = wf.indexOf("\n    drift-issue:");
        const issue = wf.slice(i, wf.indexOf("\n        runs-on", i));
        expect(issue).toContain("needs.drift.outputs.status != 'error'");
        expect(issue).toContain("needs.drift.outputs.status != ''");
    });
});

describe("pinMove", () => {
    const pkg = (sha) =>
        JSON.stringify({
            dependencies: { "@full-chaos/ask-dev": `github:full-chaos/ask-dev#${sha}` },
        });
    const A = "a".repeat(40);
    const B = "b".repeat(40);

    it("does not enforce when the pin did not move", () => {
        expect(pinMove(pkg(A), pkg(A))).toEqual({ enforce: false, base_pin: A, pr_pin: A });
    });

    it("enforces when the pin moved, and names both", () => {
        expect(pinMove(pkg(A), pkg(B))).toEqual({ enforce: true, base_pin: A, pr_pin: B });
    });

    it("enforces when the base has no pin yet", () => {
        expect(pinMove("{}", pkg(B))).toEqual({ enforce: true, base_pin: "none", pr_pin: B });
    });

    it("refuses a PR that unpins it (a branch name), whatever the base", () => {
        const unpinned = JSON.stringify({
            dependencies: { "@full-chaos/ask-dev": "github:full-chaos/ask-dev#main" },
        });
        expect(() => pinMove(pkg(A), unpinned)).toThrow(/not pinned/u);
    });

    it("the CLI prints the outputs the workflow reads", () => {
        const dir = tmp("ask-dev-scope-");
        const base = path.join(dir, "base.json");
        const pr = path.join(dir, "pr.json");
        fs.writeFileSync(base, pkg(A));
        fs.writeFileSync(pr, pkg(B));
        const result = spawnSync("node", [SCOPE, base, pr], { encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(`enforce=true\nbase_pin=${A}\npr_pin=${B}\n`);
    });
});
