import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "@/test/sourceTree";

/**
 * CHAOS-8434 (ruling 107): a component never renders the text of a backend or thrown error. A failed
 * read shows `READ_FAILED_MESSAGE` (or `readFailureMessage` in a server loader, which also logs).
 *
 * This scan checks one thing: a `.tsx` file under src/ reads a `.message` / `?.message` property
 * (any object name, so `(a.error || b.error)?.message` is caught too) unless the file is in the
 * allow-list with a reason. It does NOT see error text that reaches a component as a plain string
 * prop (`error={result.error}`); those are covered by the tests of each place and, in the actions PR,
 * by the guard for strings made in `.ts` files.
 */
const ALLOW: Record<string, string> = {
    "components/evidence/EvidencePanel.tsx":
        "the text goes to the log and to the dev-diagnostics block (flag-gated), not to users",
    "components/admin/llm/ByoLlmSpendSummary.tsx":
        "locked.message: the 402/403 card text, kept only when it is a plan-gate sentence (isPlanGateMessage)",
    "components/admin/llm/ByoLlmSettings.tsx":
        "locked.message: the 402/403 card text, kept only when it is a plan-gate sentence (isPlanGateMessage)",
    "components/admin/billing/PlanManager.tsx":
        "client-side JSON validation text authored by this page (parsePriceJson), not backend text",
    "components/admin/integrations/customer-push/RejectedRecordsTable.tsx":
        "a stored rejected-record message shown as table data, not an error of this read",
    "components/admin/integrations/EditCredentialModal.tsx":
        "the result of a connection test (success flag + message): data of a completed test, not an error text",
    "components/admin/integrations/wizard/VerifyConnectionStep.tsx":
        "the result of a connection test (success flag + message): data of a completed test, not an error text",
    "components/admin/sync/CreateCredentialModal.tsx":
        "the result of a connection test (success flag + message): data of a completed test, not an error text",
    "components/admin/sync/config-form/PagerDutyServiceMappings.tsx":
        "validity sentences authored by this form",
    "components/admin/sync/config-form/CreateSyncConfigWizard.tsx":
        "validity sentence authored by this form",
    "components/admin/identities/IdentityForm.tsx": "validation sentence authored by this form",
    "app/(app)/prs/[pr_id]/page.tsx": "a commit message shown as data, not an error",
};

const SRC = join(process.cwd(), "src");
const MESSAGE_PROPERTY = /\??\.message\b/u;

const files = sourceFiles(SRC).filter(
    (f) =>
        /\.tsx$/u.test(f) && !/\.(test|spec)\.tsx$/u.test(f) && !/__(tests|generated)__/u.test(f),
);

describe("components read no .message property outside the allow-list", () => {
    it("scans a real set of files (a scan of nothing is a failure)", () => {
        expect(files.length).toBeGreaterThan(200);
    });

    it("catches the shape that reached AIImpactDashboard (a parenthesised error)", () => {
        expect(MESSAGE_PROPERTY.test("(a.error || b.error)?.message ?? 'x'")).toBe(true);
        expect(MESSAGE_PROPERTY.test("error.message")).toBe(true);
        expect(MESSAGE_PROPERTY.test("readFailureMessage(error)")).toBe(false);
    });

    it("finds no .message read outside the allow-list", () => {
        const offenders = files
            .map((f) => relative(SRC, f))
            .filter((rel) => !(rel in ALLOW))
            .filter((rel) => MESSAGE_PROPERTY.test(readFileSync(join(SRC, rel), "utf8")));
        expect(offenders).toEqual([]);
    });

    it("logs nothing while rendering: readFailureMessage (which logs) is called in server files only", () => {
        const users = files
            .map((f) => relative(SRC, f))
            .filter((rel) => /\breadFailureMessage\(/u.test(readFileSync(join(SRC, rel), "utf8")));
        expect(users.length).toBeGreaterThan(0);
        const clientUsers = users.filter((rel) =>
            /^\s*["']use client["']/u.test(readFileSync(join(SRC, rel), "utf8")),
        );
        expect(clientUsers).toEqual([]);
    });

    it("keeps the allow-list honest: every entry exists and still reads .message", () => {
        for (const rel of Object.keys(ALLOW)) {
            const text = readFileSync(join(SRC, rel), "utf8");
            expect(MESSAGE_PROPERTY.test(text), `${rel} no longer needs its allow-list entry`).toBe(
                true,
            );
        }
    });
});
