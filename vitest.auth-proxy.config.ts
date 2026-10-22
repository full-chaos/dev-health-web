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
        name: "auth-proxy",
        environment: "node",
        include: ["tests/auth-proxy/**/*.proof.ts"],
        testTimeout: 60_000,
    },
});
