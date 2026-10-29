import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Runs the generator against a checkout of the ask-dev repo (env ASK_DEV_DIR). `@` resolves to
 * ASK_DEV_DIR/src, so the REAL ask-dev modules execute; `server-only` is stubbed as ask-dev's own
 * vitest config does. Not part of the web test suite (see request-oracle.generate.ts).
 */
const askDev = process.env.ASK_DEV_DIR;
if (askDev === undefined || askDev === "") throw new Error("ASK_DEV_DIR is required");

export default defineConfig({
    root: import.meta.dirname,
    resolve: {
        alias: {
            "@": path.resolve(askDev, "src"),
            "server-only": path.resolve(askDev, "src/test/server-only.ts"),
        },
    },
    server: { fs: { strict: false } },
    test: {
        environment: "node",
        include: ["request-oracle.generate.ts"],
    },
});
