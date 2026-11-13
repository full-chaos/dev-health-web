import path from "node:path";
import { defineConfig } from "vitest/config";

// CHAOS-13325: the ACR real-PDP equality cells (tests/acr-legacy/*.pdp.ts). They run the real web routes against a
// live dev-health-ops stack and its auth-service PDP, armed by ci/acr-legacy/run-pdp-equality.sh; unarmed, they fail.
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
        name: "acr-pdp",
        environment: "node",
        server: { deps: { inline: ["next-auth"] } },
        include: ["tests/acr-legacy/**/*.pdp.ts"],
        fileParallelism: false,
        testTimeout: 60_000,
    },
});
