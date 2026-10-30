import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * The E8 render-shape differential oracle (CHAOS-11941, design §6). ask-dev's REAL modules run from
 * a checkout (env ASK_DEV_DIR) at the pinned commit, beside web's ports, in one process:
 * `@/lib/ask-dev/...` resolves to web, every other `@/...` to ASK_DEV_DIR/src. Run it with
 * `pnpm test:ask-dev-oracle` (three time zones). Not part of the web unit suite.
 */
const askDev = process.env.ASK_DEV_DIR;
if (askDev === undefined || askDev === "") throw new Error("ASK_DEV_DIR is required");
const web = path.resolve(import.meta.dirname, "../..");
const pinned = readFileSync(path.join(import.meta.dirname, "ASK_DEV_SHA"), "utf8").trim();

/**
 * ask-dev keeps `formatValue`, `formatDisplay` and `trendsForGroup` private. The oracle reaches the
 * ORIGINAL bodies through an append-only transform: exactly one export line is added, and the
 * transform fails unless the file it is given is byte for byte the pinned blob (so nothing else can
 * have changed, and a checkout at another commit cannot pass).
 */
const PRIVATE_EXPORTS: Record<string, string> = {
    "src/components/RenderShapeChart.tsx": "export { formatValue, formatDisplay };",
    "src/components/FactRowsPanel.tsx": "export { trendsForGroup };",
};

function exposePrivateFunctions(): Plugin {
    return {
        name: "ask-dev-oracle-expose-private",
        enforce: "pre",
        transform(code, id) {
            const file = id.split("?")[0]!;
            for (const [relative, line] of Object.entries(PRIVATE_EXPORTS)) {
                if (file !== path.resolve(askDev!, relative)) continue;
                const blob = execFileSync("git", ["-C", askDev!, "show", `${pinned}:${relative}`], {
                    encoding: "utf8",
                });
                if (code !== blob) {
                    throw new Error(`${relative} is not the pinned ask-dev blob ${pinned}`);
                }
                const transformed = `${code}${line}\n`;
                if (transformed !== `${blob}${line}\n`)
                    throw new Error(`${relative}: transform drift`);
                return { code: transformed, map: null };
            }
            return null;
        },
    };
}

export default defineConfig({
    root: import.meta.dirname,
    plugins: [exposePrivateFunctions()],
    resolve: {
        alias: [
            { find: /^@\/lib\/ask-dev\//, replacement: `${path.join(web, "src/lib/ask-dev")}/` },
            { find: /^@\/lib\/acr\//, replacement: `${path.join(web, "src/lib/acr")}/` },
            { find: /^@\//, replacement: `${path.join(askDev, "src")}/` },
            { find: "server-only", replacement: path.resolve(askDev, "src/test/server-only.ts") },
        ],
    },
    server: { fs: { strict: false } },
    test: {
        environment: "node",
        include: ["render-oracle.test.ts"],
        testTimeout: 120_000,
    },
});
