import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * GraphQL Code Generator configuration.
 *
 * Generates TypeScript types from the local SDL schema file.
 * The schema file (src/lib/graphql/schema.graphql) is a verbatim copy of the
 * ops contract pin, contracts/graphql/v1/schema.graphql in dev-health-ops
 * (the Go gqlgen schema is the source of truth). The live-e2e.yml workflow
 * fails when the two files differ.
 *
 * Commands:
 *   pnpm codegen          - generate types
 *   pnpm codegen:check    - verify generated files are up-to-date (CI)
 *
 * Sync procedure (when the ops contract changes), from a dev-health-ops
 * checkout beside this one:
 *   1. cp ../dev-health-ops/contracts/graphql/v1/schema.graphql \
 *        src/lib/graphql/schema.graphql
 *   2. pnpm codegen
 *   3. Commit schema.graphql + __generated__/ together.
 * No running API is needed, and the copy is never edited by hand.
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
