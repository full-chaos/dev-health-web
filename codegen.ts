import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * GraphQL Code Generator configuration.
 *
 * Generates TypeScript types from the local SDL schema file.
 * The schema file (src/lib/graphql/schema.graphql) must be kept
 * in sync with the backend Strawberry schema in dev-health-ops.
 *
 * Commands:
 *   npm run codegen          - generate types
 *   npm run codegen:check    - verify generated files are up-to-date (CI)
 *
 * Sync procedure (when backend schema changes):
 *   1. Start the dev-health-ops API.
 *   2. npx graphql-codegen introspect \
 *        --endpoint http://localhost:8000/graphql \
 *        --output src/lib/graphql/schema.graphql
 *   3. npm run codegen
 *   4. Commit schema.graphql + __generated__/ together.
 */
const config: CodegenConfig = {
  schema: "src/lib/graphql/schema.graphql",
  documents: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.graphql"],
  ignoreNoDocuments: true,
  generates: {
    "src/lib/graphql/__generated__/": {
      preset: "client",
      presetConfig: {
        // Use fragment masking for stronger type safety
        fragmentMasking: { unmaskFunctionName: "getFragmentData" },
      },
      config: {
        // Use TypeScript strict types
        strictScalars: true,
        scalars: {
          Date: "string",
          DateTime: "string",
          JSON: "Record<string, unknown>",
        },
        // Emit enum values as TypeScript const enums for tree-shaking
        enumsAsTypes: true,
        // Use default import from graphql-tag
        documentMode: "string",
      },

    },
    // Also generate a single types file for direct import convenience
    "src/lib/graphql/__generated__/types.ts": {
      plugins: ["typescript"],
      config: {
        strictScalars: true,
        scalars: {
          Date: "string",
          DateTime: "string",
          JSON: "Record<string, unknown>",
        },
        enumsAsTypes: true,
        avoidOptionals: false,
        maybeValue: "T | null | undefined",
      },
    },
  },
};

export default config;
