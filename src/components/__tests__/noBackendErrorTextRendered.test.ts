import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-8434 (ruling 107): a component never renders the text of a backend or thrown error. A failed
 * read shows `readFailureMessage(error, "<operation>")`; a failed action shows
 * `actionFailureMessage` / `failureResult`, which keep the served text ONLY for a 4xx other than
 * 401/403 (or a plan-gate sentence). The detail goes to the log. This scan fails when a `.ts` or
 * `.tsx` file under src/ reads `<error>.message` or `graphQLErrors`, except for the files below.
 */
const ALLOW: Record<string, string> = {
    "components/evidence/EvidencePanel.tsx":
        "the text goes to the log and to the dev-diagnostics block (flag-gated), not to users",
    "components/admin/billing/PlanManager.tsx":
        "client-side JSON validation text authored by this page (parsePriceJson), not backend text",
    "lib/graphql/server.ts":
        "builds the thrown Error from the GraphQL error; callers log it and show a plain sentence",
    "lib/graphql/validate.ts": "builds the schema-validation Error (thrown, then logged)",
    "lib/graphql/urqlExchanges.ts": "passes graphQLErrors to the logger only",
    "lib/acr/contracts.ts": "ajv schema error text for a developer-facing contract check",
    "lib/result.ts": "withResult: not used by a screen (test-only helper)",
    "lib/admin/api/_request.ts":
        "reads the served detail into AdminApiError; failureResult gates it",
    "lib/admin/server/orgs.ts":
        "reads the served detail into AdminApiError; failureResult gates it",
    "lib/actionFailure.ts": "the one place that decides whether served text is shown (4xx rule)",
};

const SRC = join(process.cwd(), "src");
const RENDERED = /\b\w*(?:[eE]rr|[eE]rror|cause)\w*\??\.message\b|graphQLErrors/u;

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (["__tests__", "generated", "__generated__"].includes(name)) continue;
            walk(full, out);
        } else if (/\.tsx?$/u.test(name) && !/\.(test|spec)\.tsx?$/u.test(name)) {
            out.push(full);
        }
    }
    return out;
}

describe("no component renders backend error text", () => {
    const files = walk(SRC);

    it("scans a real set of files (a scan of nothing is a failure)", () => {
        expect(files.length).toBeGreaterThan(200);
    });

    it("finds no error.message / graphQLErrors read outside the allow-list (.ts and .tsx)", () => {
        const offenders = files
            .map((f) => relative(SRC, f))
            .filter((rel) => !(rel in ALLOW))
            .filter((rel) => RENDERED.test(readFileSync(join(SRC, rel), "utf8")));
        expect(offenders).toEqual([]);
    });

    it("keeps the allow-list honest: every entry exists and still reads error text", () => {
        for (const rel of Object.keys(ALLOW)) {
            const text = readFileSync(join(SRC, rel), "utf8");
            expect(RENDERED.test(text), `${rel} no longer needs its allow-list entry`).toBe(true);
        }
    });
});
