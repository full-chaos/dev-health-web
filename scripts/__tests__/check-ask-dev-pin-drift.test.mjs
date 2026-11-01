import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { pinMove } from "../ask-dev-pin-scope.mjs";
import { checkPin, pinOf, readPin, RENDER_PATHS } from "../check-ask-dev-pin-drift.mjs";

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

const check = (repo, pin, webContract = CONTRACT) => checkPin({ remote: repo, pin, webContract });

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
        expect(() => check(repo, "e".repeat(40))).toThrow();
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
    });

    it("exits 2 on a pin that is not a full SHA", () => {
        const { repo } = fakeAskDev();
        const result = run({ repo, pin: "main" });
        expect(result.status).toBe(2);
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
