import path from "node:path";
import { defineConfig } from "vitest/config";

// CHAOS-13330: the ACR legacy cells (tests/acr-legacy). They run the real web routes against a live
// dev-health-ops stack and are armed by ci/acr-legacy/run-legacy-cells.sh; unarmed, the suite fails.
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
            "#server-session": path.resolve(__dirname, "./src/lib/serverSession.server.ts"),
            "#server-env": path.resolve(__dirname, "./src/lib/serverEnv.server.ts"),
        },
    },
    test: {
        name: "acr-legacy",
        environment: "node",
        server: { deps: { inline: ["next-auth"] } },
        include: ["tests/acr-legacy/**/*.proof.ts"],
        fileParallelism: false,
        testTimeout: 60_000,
    },
});
