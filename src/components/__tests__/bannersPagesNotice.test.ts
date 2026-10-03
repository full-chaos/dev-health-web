import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-7734: load-error banners on org admin and superadmin pages are `Notice variant="danger"`.
 * Banner text is the production text (byte-equal); a title exists only where production had a heading.
 * Server pages render with the page, so they pass `live={false}`; the two client pages keep the
 * default `role="alert"` (new compared with production, see RISK-NOTES).
 */
const BANNERS: Array<{ file: string; text: string; title?: string }> = [
    {
        file: "app/(app)/org/admin/identities/page.tsx",
        text: "Failed to load identities: {result.error}",
    },
    {
        file: "app/(app)/org/admin/integrations/[provider]/customer-push/[source_id]/batches/page.tsx",
        text: "Failed to load batches: {batchesResult.error}",
    },
    {
        file: "app/(app)/org/admin/integrations/[provider]/customer-push/[source_id]/credentials/page.tsx",
        text: "Failed to load credentials: {tokensResult.error}",
    },
    {
        file: "app/(app)/org/admin/integrations/[provider]/page.tsx",
        text: "Failed to load credentials: {credentialsResult.error}",
    },
    {
        file: "app/(app)/org/admin/integrations/[provider]/page.tsx",
        text: "Failed to load customer-push sources: {customerPushSourcesResult.error}",
    },
    {
        // A11: one plain sentence + Retry; the backend text goes to the server log.
        file: "app/(app)/org/admin/integrations/page.tsx",
        text: "Providers could not be loaded.",
    },
    { file: "app/(app)/org/admin/ip-allowlist/page.tsx", text: "{error}" },
    { file: "app/(app)/org/admin/retention/page.tsx", text: "{error}" },
    {
        file: "app/(app)/org/admin/settings/page.tsx",
        text: "Failed to load organization: {result.error}",
    },
    { file: "app/(app)/org/admin/teams/page.tsx", text: "Failed to load teams: {result.error}" },
    // One plain sentence + Retry; the backend text goes to the server log (CHAOS-8235).
    { file: "app/(app)/org/admin/users/page.tsx", text: "Users could not be loaded." },
    { file: "app/(app)/superadmin/audit/page.tsx", text: "Error loading audit logs: {error}" },
    {
        file: "app/(app)/superadmin/billing/invoices/page.tsx",
        text: "Failed to load invoices: {result.error}",
    },
    {
        file: "app/(app)/superadmin/billing/plans/page.tsx",
        text: "Failed to load plans: {plansResult.error}",
    },
    {
        file: "app/(app)/superadmin/billing/refunds/page.tsx",
        text: "Failed to load refunds: {result.error}",
    },
    {
        file: "app/(app)/superadmin/billing/subscriptions/page.tsx",
        text: "Failed to load subscriptions: {result.error}",
    },
    {
        file: "app/(app)/superadmin/licensing/page.tsx",
        text: "Error loading organizations: {error}",
    },
    { file: "app/(app)/superadmin/orgs/page.tsx", text: "Error loading organizations: {error}" },
    { file: "app/(app)/superadmin/page.tsx", text: "{error}", title: "Error loading stats" },
    {
        file: "app/(app)/superadmin/settings/page.tsx",
        text: "Error loading settings: {categoriesError}",
    },
    { file: "app/(app)/superadmin/users/page.tsx", text: "Error loading users: {error}" },
];
const CLIENT_PAGES = new Set([
    "app/(app)/org/admin/ip-allowlist/page.tsx",
    "app/(app)/org/admin/retention/page.tsx",
]);
const src = (p: string) =>
    readFileSync(join(process.cwd(), "src", p), "utf8")
        .replace(/<Notice\s+variant/gu, "<Notice variant")
        .replace(/"\s+live=/gu, '" live=');

describe("page error banners use Notice danger", () => {
    for (const { file, text, title } of BANNERS) {
        it(`${file}: ${text.slice(0, 40)}`, () => {
            const s = src(file);
            expect(s).toContain('import { Notice } from "@/components/ui/Notice";');
            expect(s).toContain('<Notice variant="danger"');
            expect(s.replace(/\s+/gu, " ")).toContain(text);
            expect(s).not.toMatch(/(?:bg|border)-red-\d+/u);
            if (title) expect(s).toContain(`title="${title}"`);
            if (CLIENT_PAGES.has(file)) {
                expect(s).not.toMatch(/<Notice variant="danger" live=\{false\}[^>]*>\s*\{error\}/u);
            }
        });
    }
    it("server pages pass live={false}", () => {
        for (const { file } of BANNERS) {
            if (CLIENT_PAGES.has(file)) continue;
            expect(src(file), file).toMatch(/<Notice variant="danger" live=\{false\}/u);
        }
    });
});
