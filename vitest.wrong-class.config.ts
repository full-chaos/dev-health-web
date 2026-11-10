import path from "node:path";
import { defineConfig } from "vitest/config";

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
        name: "wrong-class",
        environment: "node",
        // Inlined so the next/headers mock reaches the real next-auth.
        server: { deps: { inline: ["next-auth"] } },
        include: ["tests/wrong-class/**/*.gate.ts"],
        testTimeout: 600_000,
        hookTimeout: 120_000,
    },
});
