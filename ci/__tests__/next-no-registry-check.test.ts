import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { nextDevNodeOptions, NEXT_NO_REGISTRY_CHECK_URL } from "../next-dev-env";

// CHAOS-10582. `next dev` awaits an un-timed fetch of the npm dist-tags
// endpoint before its compilers exist, so a hung registry hangs every dev
// server the e2e suites start. ci/next-no-registry-check.mjs fails that one
// request at once. These tests pin the guard, its wiring and its drift.

const DIST_TAGS_URL = "https://registry.npmjs.org/-/package/next/dist-tags";
const PRELOAD_PATH = path.resolve(__dirname, "../next-no-registry-check.mjs");
const REPO_ROOT = path.resolve(__dirname, "../..");

// Runs `script` as an ES module in a child that has the preload installed over
// a recording fetch stub. No network is touched. The child prints one JSON line.
function runWithPreload(script: string, cwd = REPO_ROOT) {
    const prelude = `
        const calls = [];
        globalThis.fetch = async (input, init) => {
            calls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
            return new Response("stub", { status: 200 });
        };
        await import(${JSON.stringify(pathToFileURL(PRELOAD_PATH).href)});
    `;
    const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", `${prelude}\n${script}`],
        { cwd, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout.trim());
}

const outcome = `
    async function attempt(input) {
        try {
            const res = await fetch(input);
            return "resolved:" + (await res.text());
        } catch (e) {
            return "rejected:" + (e && e.constructor && e.constructor.name);
        }
    }
`;

describe("next-no-registry-check preload", () => {
    it("exports the URL it blocks", () => {
        expect(NEXT_NO_REGISTRY_CHECK_URL).toBe(DIST_TAGS_URL);
        expect(readFileSync(PRELOAD_PATH, "utf8")).toContain(
            `export const BLOCKED_URL = "${DIST_TAGS_URL}";`,
        );
    });

    it("rejects the dist-tags URL at once in its string, URL and Request forms", () => {
        const out = runWithPreload(`
            ${outcome}
            const started = Date.now();
            const result = [
                await attempt(${JSON.stringify(DIST_TAGS_URL)}),
                await attempt(new URL(${JSON.stringify(DIST_TAGS_URL)})),
                await attempt(new Request(${JSON.stringify(DIST_TAGS_URL)})),
            ];
            console.log(JSON.stringify({ result, calls, fast: Date.now() - started < 1000 }));
        `);
        expect(out.result).toEqual([
            "rejected:TypeError",
            "rejected:TypeError",
            "rejected:TypeError",
        ]);
        expect(out.calls).toEqual([]);
        expect(out.fast).toBe(true);
    });

    it("passes every other fetch through untouched, near misses included", () => {
        const others = [
            "https://registry.npmjs.org/-/package/next/dist-tags/extra",
            "https://registry.npmjs.org/-/package/react/dist-tags",
            "https://registry.npmjs.org/next",
            "http://registry.npmjs.org/-/package/next/dist-tags",
            "https://example.test/-/package/next/dist-tags",
            "http://127.0.0.1:8001/health",
        ];
        const out = runWithPreload(`
            ${outcome}
            const others = ${JSON.stringify(others)};
            const result = [];
            for (const url of others) result.push(await attempt(url));
            result.push(await attempt(new URL(others[5])));
            result.push(await attempt(new Request(others[5])));
            console.log(JSON.stringify({ result, calls }));
        `);
        expect(out.result).toEqual(Array(others.length + 2).fill("resolved:stub"));
        expect(out.calls).toEqual([...others, others[5], others[5]]);
    });
});

describe("nextDevNodeOptions", () => {
    const fileUrl = pathToFileURL(PRELOAD_PATH).href;

    it("uses an absolute file URL, so the option works from any cwd", () => {
        const options = nextDevNodeOptions("");
        expect(options).toBe(`--import ${fileUrl}`);
        expect(options.startsWith("--import file:///")).toBe(true);
    });

    it("keeps an existing NODE_OPTIONS value", () => {
        expect(nextDevNodeOptions("--max-old-space-size=4096")).toBe(
            `--max-old-space-size=4096 --import ${fileUrl}`,
        );
    });

    it("does not add the preload twice", () => {
        const once = nextDevNodeOptions("--max-old-space-size=4096");
        expect(nextDevNodeOptions(once)).toBe(once);
    });

    it("loads in a node child started from another cwd", () => {
        const result = spawnSync(
            process.execPath,
            [
                "--input-type=module",
                "-e",
                `try { await fetch(${JSON.stringify(DIST_TAGS_URL)}); console.log("resolved"); } catch { console.log("rejected"); }`,
            ],
            {
                cwd: path.parse(REPO_ROOT).root,
                encoding: "utf8",
                env: { ...process.env, NODE_OPTIONS: nextDevNodeOptions("") },
            },
        );
        expect(result.stdout.trim()).toBe("rejected");
    });
});

describe("playwright dev-server configs", () => {
    const configs = [
        "playwright.config.ts",
        "playwright.customer-push.config.ts",
        "playwright.navigation.config.ts",
        "playwright.onboarding.config.ts",
        "playwright.live.config.ts",
    ];

    it.each(configs)("%s carries the preload on its next dev webServer", async (name) => {
        const mod = await import(path.join(REPO_ROOT, name));
        const servers = [mod.default.webServer].flat();
        const devServers = servers.filter((server: { command: string }) =>
            /\b(npm run dev|next dev)\b/.test(server.command),
        );
        expect(devServers).toHaveLength(1);
        expect(devServers[0].env.NODE_OPTIONS).toContain(
            `--import ${pathToFileURL(PRELOAD_PATH).href}`,
        );
    });

    it("no other playwright config starts next dev without the preload", () => {
        const names = readdirConfigs();
        for (const name of names) {
            if (configs.includes(name)) continue;
            expect(readFileSync(path.join(REPO_ROOT, name), "utf8")).not.toMatch(
                /npm run dev|next dev/,
            );
        }
    });
});

describe("drift guard against the installed next", () => {
    const require = createRequire(path.join(REPO_ROOT, "package.json"));
    const nextRoot = path.dirname(require.resolve("next/package.json"));
    const devDir = path.join(nextRoot, "dist/server/dev");

    it("next still fetches exactly the blocked URL from getVersionInfo", () => {
        const source = readFileSync(path.join(devDir, "hot-reloader-shared-utils.js"), "utf8");
        const fetched = [...source.matchAll(/fetch\(\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2]);
        expect(fetched).toEqual([NEXT_NO_REGISTRY_CHECK_URL]);
    });

    it.each(["hot-reloader-webpack.js", "hot-reloader-turbopack.js"])(
        "%s still calls getVersionInfo from the shared utils",
        (file) => {
            const source = readFileSync(path.join(devDir, file), "utf8");
            expect(source).toMatch(/getVersionInfo/);
            expect(source).toMatch(/hot-reloader-shared-utils/);
        },
    );
});

function readdirConfigs(): string[] {
    return readdirSync(REPO_ROOT).filter((n) => /^playwright\..*config\.ts$/.test(n));
}
