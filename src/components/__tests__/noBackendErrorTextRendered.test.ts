import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "@/test/sourceTree";

/**
 * CHAOS-8434 (ruling 107): a component never renders the text of a backend or thrown error. A failed
 * read shows `READ_FAILED_MESSAGE` (or `readFailureMessage` in a server loader, which also logs).
 *
 * This scan checks one thing: a `.tsx` file under src/ reads a `.message` / `?.message` property
 * (any object name, so `(a.error || b.error)?.message` is caught too) unless the allow-list names
 * that exact expression, with its count, for that file. It does NOT see error text that reaches a
 * component as a plain string prop (`error={result.error}`); those are covered by the tests of each place and, in the actions PR,
 * by the guard for strings made in `.ts` files.
 */
type Allowed = { reason: string; reads: Record<string, number> };

/** Per file: the EXPRESSIONS whose `.message` may be read, and how many times. A second read of the
 *  same expression, or a read of another one, fails the scan even in an allow-listed file. */
const ALLOW: Record<string, Allowed> = {
    "components/evidence/EvidencePanel.tsx": {
        reason: "the text goes to the log and to the dev-diagnostics block (flag-gated), not to users",
        reads: { err: 1 },
    },
    "components/admin/llm/ByoLlmSpendSummary.tsx": {
        reason: "locked.message: the 402/403 card text, kept only when it is a plan-gate sentence (isPlanGateMessage)",
        reads: { locked: 1 },
    },
    "components/admin/llm/ByoLlmSettings.tsx": {
        reason: "locked.message: the 402/403 card text, kept only when it is a plan-gate sentence (isPlanGateMessage)",
        reads: { locked: 1 },
    },
    "components/admin/billing/PlanManager.tsx": {
        reason: "client-side JSON validation text authored by this page (parsePriceJson), not backend text",
        reads: { error: 1 },
    },
    "components/admin/integrations/customer-push/RejectedRecordsTable.tsx": {
        reason: "a stored rejected-record message shown as table data, not an error of this read",
        reads: { record: 1 },
    },
    "components/admin/integrations/EditCredentialModal.tsx": {
        reason: "the result of a connection test (success flag + message): data of a completed test",
        reads: { testResult: 1 },
    },
    "components/admin/integrations/wizard/VerifyConnectionStep.tsx": {
        reason: "the result of a connection test (success flag + message): data of a completed test",
        reads: { testResult: 1 },
    },
    "components/admin/sync/CreateCredentialModal.tsx": {
        reason: "the result of a connection test (success flag + message): data of a completed test",
        reads: { testResult: 1 },
    },
    "components/admin/sync/config-form/PagerDutyServiceMappings.tsx": {
        reason: "validity sentences authored by this form",
        reads: { validity: 1, structuralValidity: 1 },
    },
    "components/admin/sync/config-form/CreateSyncConfigWizard.tsx": {
        reason: "validity sentence authored by this form",
        reads: { serviceRepositoryMappingsValidity: 1 },
    },
    "components/admin/identities/IdentityForm.tsx": {
        reason: "validation sentence authored by this form",
        reads: { validation: 1 },
    },
    "app/(app)/prs/[pr_id]/page.tsx": {
        reason: "a commit message shown as data, not an error",
        reads: { commit: 1 },
    },
};

const SRC = join(process.cwd(), "src");
/** The expression before `.message` ("" when a `)` or `]` stands there). */
const READ = /([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)?\??\.message\b/gu;

/** `expression -> count` of every `.message` read in a source text. */
function readsOf(source: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const m of source.matchAll(READ)) out[m[1] ?? ""] = (out[m[1] ?? ""] ?? 0) + 1;
    return out;
}

/** True when `"use client"` is the first statement (comments and blank lines before it are fine). */
function hasUseClient(source: string): boolean {
    const rest = source.replace(/^(?:\s+|\/\/[^\n]*\n?|\/\*[\s\S]*?\*\/)*/u, "");
    return /^["']use client["']/u.test(rest);
}

const all = sourceFiles(SRC).filter(
    (f) => !/\.(test|spec)\.tsx?$/u.test(f) && !/__(tests|generated)__/u.test(f),
);
const files = all.filter((f) => /\.tsx$/u.test(f));

describe("components read no .message property outside the allow-list", () => {
    it("scans a real set of files (a scan of nothing is a failure)", () => {
        expect(files.length).toBeGreaterThan(200);
    });

    it("catches the shape that reached AIImpactDashboard (a parenthesised error)", () => {
        expect(readsOf("(a.error || b.error)?.message ?? 'x'")).toEqual({ "": 1 });
        expect(readsOf("error.message")).toEqual({ error: 1 });
        expect(readsOf("readFailureMessage(error)")).toEqual({});
    });

    it("finds no .message read outside the allow-list (by expression and count)", () => {
        const offenders = files.flatMap((f) => {
            const r = relative(SRC, f);
            const reads = readsOf(readFileSync(f, "utf8"));
            const allowed = ALLOW[r]?.reads ?? {};
            return Object.entries(reads)
                .filter(([expr, n]) => n !== (allowed[expr] ?? 0))
                .map(
                    ([expr, n]) =>
                        `${r}: ${n} read(s) of "${expr}".message, allowed ${allowed[expr] ?? 0}`,
                );
        });
        expect(offenders).toEqual([]);
    });

    it("counts expressions: a second read in an allow-listed file is seen", () => {
        expect(readsOf("a(commit.message); b(commit.message); c((x || y)?.message)")).toEqual({
            commit: 2,
            "": 1,
        });
    });

    it("logs nothing while rendering: readFailureMessage (which logs) is called in server files only", () => {
        const users = all.filter((f) => /\breadFailureMessage\(/u.test(readFileSync(f, "utf8")));
        expect(users.length).toBeGreaterThan(0);
        expect(
            users.filter((f) => hasUseClient(readFileSync(f, "utf8"))).map((f) => relative(SRC, f)),
        ).toEqual([]);
    });

    it("sees a use client directive after a comment, and in .ts files", () => {
        expect(hasUseClient('"use client";\nimport x')).toBe(true);
        expect(hasUseClient('// note\n/* block */\n"use client";\nimport x')).toBe(true);
        expect(hasUseClient('import x from "y";\n"use client";')).toBe(false);
        expect(all.some((f) => f.endsWith(".ts"))).toBe(true);
    });

    it("keeps the allow-list honest: every entry exists and reads exactly what it lists", () => {
        for (const [rel, entry] of Object.entries(ALLOW)) {
            expect(readsOf(readFileSync(join(SRC, rel), "utf8")), rel).toEqual(entry.reads);
        }
    });
});
