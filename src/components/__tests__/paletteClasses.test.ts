import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-7677: raw Tailwind palette classes ignore the theme. This scan counts them per
 * file under `src` and holds each file to its allow-listed count. A count may only go
 * down; a file that reaches 0 must be removed from the list (a stale entry fails), so the
 * list shrinks slice by slice until it is empty.
 */
const SRC = join(process.cwd(), "src");
const RAW =
    /\b(?:text|bg|border|ring|from|via|to|fill|stroke|divide|outline|shadow|accent|decoration)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/gu;

const ALLOWLIST: Record<string, number> = {
    "app/(app)/cognitive-load/page.tsx": 14,
    "app/(app)/data-health/_components/AliasSuggestionRow.tsx": 2,
    "app/(app)/data-health/_components/CoverageBar.tsx": 3,
    "app/(app)/data-health/connectors/page.tsx": 3,
    "app/(app)/data-health/mapping/page.tsx": 3,
    "app/(app)/operating-review/page.tsx": 28,
    "app/(app)/org/admin/identities/page.tsx": 3,
    "app/(app)/org/admin/integrations/[provider]/customer-push/[source_id]/batches/page.tsx": 3,
    "app/(app)/org/admin/integrations/[provider]/customer-push/[source_id]/credentials/page.tsx": 3,
    "app/(app)/org/admin/integrations/[provider]/page.tsx": 6,
    "app/(app)/org/admin/integrations/page.tsx": 9,
    "app/(app)/org/admin/ip-allowlist/IpAllowlistTable.tsx": 6,
    "app/(app)/org/admin/ip-allowlist/page.tsx": 3,
    "app/(app)/org/admin/page.tsx": 7,
    "app/(app)/org/admin/retention/RetentionPolicyTable.tsx": 6,
    "app/(app)/org/admin/retention/page.tsx": 3,
    "app/(app)/org/admin/settings/page.tsx": 3,
    "app/(app)/org/admin/teams/page.tsx": 4,
    "app/(app)/org/admin/users/[id]/DeleteUserButton.tsx": 6,
    "app/(app)/org/admin/users/[id]/page.tsx": 8,
    "app/(app)/org/admin/users/page.tsx": 3,
    "app/(app)/people/[person_id]/metrics/[metric]/page.tsx": 3,
    "app/(app)/people/[person_id]/page.tsx": 5,
    "app/(app)/people/page.tsx": 3,
    "app/(app)/plan/backlog-risk/_components.tsx": 4,
    "app/(app)/plan/page.tsx": 6,
    "app/(app)/reports/[id]/page.tsx": 19,
    "app/(app)/reports/new/page.tsx": 3,
    "app/(app)/risk/compounding/page.tsx": 6,
    "app/(app)/superadmin/audit/page.tsx": 3,
    "app/(app)/superadmin/billing/invoices/page.tsx": 3,
    "app/(app)/superadmin/billing/plans/page.tsx": 3,
    "app/(app)/superadmin/billing/refunds/page.tsx": 3,
    "app/(app)/superadmin/billing/subscriptions/page.tsx": 3,
    "app/(app)/superadmin/licensing/page.tsx": 3,
    "app/(app)/superadmin/orgs/[id]/page.tsx": 1,
    "app/(app)/superadmin/orgs/page.tsx": 3,
    "app/(app)/superadmin/page.tsx": 7,
    "app/(app)/superadmin/settings/page.tsx": 3,
    "app/(app)/superadmin/users/page.tsx": 3,
    "app/(auth)/auth/onboard/complete/page.tsx": 3,
    "app/(auth)/auth/reset-password/page.tsx": 3,
    "app/(auth)/auth/signin/page.tsx": 6,
    "app/(auth)/auth/verify/page.tsx": 6,
    "components/admin/billing/AuditDetailPanel.tsx": 2,
    "components/admin/billing/VoidConfirmDialog.tsx": 2,
    "components/admin/identities/IdentityTable.tsx": 1,
    "components/admin/identities/ProviderIdentitySection.tsx": 2,
    "components/admin/integrations/EditCredentialModal.tsx": 2,
    "components/admin/integrations/GitHubAppConnect.tsx": 6,
    "components/admin/integrations/customer-push/CustomerPushBatchDetailLive.tsx": 1,
    "components/admin/integrations/customer-push/CustomerPushSourceOverview.tsx": 3,
    "components/admin/integrations/customer-push/RejectedRecordsTable.tsx": 4,
    "components/admin/integrations/customer-push/TokenRevealPanel.tsx": 2,
    "components/admin/settings/CancelSubscriptionDialog.tsx": 4,
    "components/admin/settings/DangerZone.tsx": 3,
    "components/admin/settings/billing/SubscriptionSummaryCard.tsx": 6,
    "components/admin/settings/billing/TrialStatusBanner.tsx": 5,
    "components/admin/sync/CreateCredentialModal.tsx": 2,
    "components/admin/sync/RepoSelector.tsx": 3,
    "components/admin/sync/SyncRunDetailLive.tsx": 2,
    "components/admin/sync/config-form/CredentialSection.tsx": 1,
    "components/admin/teams/ImportTeamsDialog.tsx": 2,
    "components/admin/teams/TeamTable.tsx": 1,
    "components/admin/users/ImpersonateUserButton.tsx": 4,
    "components/ai/AIAttributionBadge.tsx": 12,
    "components/ai/AIComparisonCard.tsx": 4,
    "components/ai/AIComparisonMetricCard.tsx": 2,
    "components/ai/AIEvidenceExplorer.tsx": 6,
    "components/ai/AIOpportunityList.tsx": 4,
    "components/ai/AIRiskDashboard.tsx": 2,
    "components/auth/ForgotPasswordForm.tsx": 3,
    "components/auth/LoginForm.tsx": 4,
    "components/auth/PasswordStrength.tsx": 1,
    "components/auth/ResetPasswordForm.tsx": 3,
    "components/auth/UserMenu.tsx": 1,
    "components/capacity/InsufficientHistoryNotice.tsx": 2,
    "components/evidence/EvidenceContext.tsx": 6,
    "components/evidence/EvidencePanel.tsx": 2,
    "components/feature-flags/ConfidenceBadge.tsx": 9,
    "components/feature-flags/FeatureFlagTable.tsx": 4,
    "components/navigation/OrgSwitcher.tsx": 1,
    "components/onboarding/OnboardIntegrationStep.tsx": 4,
    "components/risk/CompoundingRiskDashboard.tsx": 12,
    "components/security/KpiTile.tsx": 2,
    "components/settings/SettingsSection.tsx": 8,
    "components/testops/PrTestOpsSummary.tsx": 19,
    "components/ui/Notice.tsx": 2,
    "components/work/CapacityView.tsx": 6,
    "components/work/GraphView.tsx": 13,
    "components/work/investment/ConfidencePanel.tsx": 8,
    "components/work/investment/InvestmentExplainer.tsx": 8,
};

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__tests__" || entry.name === "__generated__") continue;
            walk(full, out);
        } else if (/\.(ts|tsx)$/u.test(entry.name) && !/\.(test|stories)\./u.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

const counts = new Map<string, number>();
for (const file of walk(SRC)) {
    const n = (readFileSync(file, "utf8").match(RAW) ?? []).length;
    if (n > 0) counts.set(relative(SRC, file), n);
}

describe("raw Tailwind palette classes", () => {
    it("no file has more than its allow-listed count", () => {
        const over = [...counts].filter(([f, n]) => n > (ALLOWLIST[f] ?? 0));
        expect(over.map(([f, n]) => `${f}: ${n} > ${ALLOWLIST[f] ?? 0}`)).toEqual([]);
    });

    it("no allow-list entry is stale or above the real count", () => {
        const stale = Object.entries(ALLOWLIST).filter(([f, n]) => (counts.get(f) ?? 0) < n);
        expect(stale.map(([f, n]) => `${f}: list ${n}, real ${counts.get(f) ?? 0}`)).toEqual([]);
    });
});
