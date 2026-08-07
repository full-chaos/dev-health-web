import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
        },
    },
    test: {
        // Component tests use jsdom; lib/util tests keep node environment.
        // Projects allow different environments per directory.
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    environment: "node",
                    include: [
                        "src/lib/**/__tests__/**/*.test.ts",
                        "src/utils/**/__tests__/**/*.test.ts",
                        "src/data/**/__tests__/**/*.test.ts",
                        "src/components/**/*.test.ts",
                        "src/app/**/*.test.ts",
                        "scripts/**/__tests__/**/*.test.mjs",
                        "tests/mocks/**/*.test.ts",
                        // CHAOS-3219 Phase 4 Lane 4d. The Wave 4 access matrix
                        // runs only under an armed Compose launcher, so its
                        // false-green guard cannot be proven by that suite —
                        // the guard exists precisely for the case where that
                        // suite executes nothing. Its control lives here
                        // instead, in the required unit job, where it always
                        // runs.
                        "tests/live/**/__tests__/**/*.test.ts",
                    ],
                },
            },
            {
                extends: true,
                test: {
                    name: "components",
                    environment: "jsdom",
                    globals: true,
                    setupFiles: ["src/test/setup.ts"],
                    include: [
                        "src/components/**/*.test.tsx",
                        "src/app/**/*.test.tsx",
                        "src/lib/**/__tests__/**/*.test.tsx",
                    ],
                },
            },
        ],
        coverage: {
            provider: "v8",
            include: ["src/components/**", "src/app/**"],
            reporter: ["text", "lcov"],
        },
    },
});
