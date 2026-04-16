import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a Next.js marker that throws at build if imported
      // from client code. Vitest runs outside Next's bundler, so alias it to
      // an empty module for tests.
      "server-only": path.resolve(__dirname, "src/test/server-only-shim.ts"),
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
          include: ["src/components/**/*.test.tsx", "src/app/**/*.test.tsx"],
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
