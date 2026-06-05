import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

import designLint from "./eslint-plugin-design-lint/index.mjs";

const enableDesignLint = process.env.DESIGN_LINT === "true";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        "out/**",
        "build/**",
        ".worktrees/**",
        ".pnpm-store/**",
        "artifacts/**",
        "output/**",
        "playwright-report/**",
        "test-results/**",
        "vendor/**",
        "next-env.d.ts",
    ]),
    {
        // Prevent silent swallowing of errors — use fetchOrNull or log explicitly.
        // Pattern: .catch(() => null) or .catch(() => {}) with no body.
        rules: {
            "no-restricted-syntax": [
                "warn",
                {
                    // .catch(() => null)
                    selector:
                        "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression.arguments:first-child[body.type='Literal'][body.value=null]",
                    message:
                        "Silent .catch(() => null) swallows errors. Use fetchOrNull() or log the error explicitly.",
                },
                {
                    // .catch(() => {})
                    selector:
                        "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression.arguments:first-child[body.type='BlockStatement'][body.body.length=0]",
                    message:
                        "Empty .catch(() => {}) swallows errors. Use fetchOrNull() or log the error explicitly.",
                },
            ],
        },
    },
    ...(enableDesignLint
        ? [
              {
                  files: ["src/**/*.{ts,tsx,js,jsx}"],
                  ignores: [
                      "src/**/*.test.{ts,tsx,js,jsx}",
                      "src/**/*.spec.{ts,tsx,js,jsx}",
                      "src/**/__tests__/**",
                      "src/**/fixtures/**",
                      "src/**/mocks/**",
                      "src/lib/api/**",
                      "src/lib/graphql/**",
                      "src/lib/design/cta.ts",
                  ],
                  plugins: {
                      "design-lint": designLint,
                  },
                  rules: {
                      "design-lint/no-raw-id-in-jsx": "error",
                      "design-lint/no-hardcoded-style": "error",
                      "design-lint/cta-from-registry": "error",
                      "design-lint/no-internal-leak": "error",
                      "design-lint/chart-values-formatted": "error",
                  },
              },
          ]
        : []),
    // eslint-config-prettier must be last — disables any ESLint formatting rules
    // that would conflict with Prettier.
    prettierConfig,
]);

export default eslintConfig;
