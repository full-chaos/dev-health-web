import { describe, it, expect } from "vitest";

import { CTA_LABELS, CTA_LABEL_VALUES, backToArea } from "@/lib/design/cta";

describe("CTA registry (Part D)", () => {
    it("exposes the approved Part D verbs with canonical phrasing", () => {
        expect(CTA_LABELS).toMatchObject({
            openEvidence: "Open evidence",
            inspectAssociations: "Inspect associations",
            openArtifact: "Open artifact",
            exportReport: "Export report",
            applyFilters: "Apply filters",
            resetFilters: "Reset filters",
            copy: "Copy",
            backToCockpit: "Back to Cockpit",
            continue: "Continue",
            back: "Back",
            saving: "Saving...",
            runNow: "Run Now",
            confirmMapping: "Confirm Mapping",
            deleteUser: "Delete User",
            editUser: "Edit User",
            editProfile: "Edit Profile",
            pullRequests: "PRs",
            issues: "Issues",
            clone: "Clone",
            tryAgain: "Try again",
            dashboard: "Dashboard",
            createOrganization: "Create Organization",
            orgAdminSettings: "Org Admin Settings",
            search: "Search",
            createUser: "Create User",
            signingIn: "Signing in...",
            devHealthHome: "Full Chaos Dev Health home",
            solutions: "Solutions",
            pricing: "Pricing",
            getStarted: "Get started",
            startForFree: "Start for free",
            viewOnGitHub: "View on GitHub",
            getStartedFree: "Get started free",
            starOnGitHub: "Star on GitHub",
            seePricing: "See pricing",
            talkToSales: "Talk to sales",
            stopImpersonating: "Stop Impersonating",
            resolve: "Resolve",
            view: "View",
            voidInvoice: "Void",
            cancelEdit: "Cancel edit",
            pullFromStripe: "Pull from Stripe",
            syncStripe: "Sync Stripe",
            archive: "Archive",
            issueRefund: "Issue Refund",
            approveAll: "Approve All",
            dismissAll: "Dismiss All",
            approve: "Approve",
            dismiss: "Dismiss",
            closeEvidenceDrilldown: "Close evidence drilldown",
            createAccount: "Create account",
            termsOfService: "Terms of Service",
            privacyPolicy: "Privacy Policy",
            continueWithGitHub: "Continue with GitHub",
            continueWithGoogle: "Continue with Google",
            continueWithGitLab: "Continue with GitLab",
            decreaseEntities: "Decrease entities",
            increaseEntities: "Increase entities",
            expandLegend: "Expand legend",
            collapseLegend: "Collapse legend",
            filters: "Filters",
            openAiWorkflows: "Open AI Workflows",
            startWithAiImpact: "Start with AI Impact",
            weeklyReview: "Weekly review",
            viewAll: "View all",
            provenance: "Provenance",
            apply: "Apply",
            saveOverride: "Save Override",
            manageEntitlements: "Manage Entitlements",
            clearThemeScope: "Clear theme scope",
        });
    });

    it("does not retain the retired drift labels", () => {
        const values = Object.values(CTA_LABELS);
        expect(values).not.toContain("Re-orient in cockpit");
        expect(values).not.toContain("Open Landscapes");
        expect(values).not.toContain("Explore Work");
        expect(values).not.toContain("Open Flame");
        expect(values).not.toContain("Open in Explore");
    });

    it("renders a canonical contextual return path via backToArea", () => {
        expect(backToArea("Metrics")).toBe("Back to Metrics");
        expect(backToArea("Explore")).toBe("Back to Explore");
    });

    it("exports the literal registry values for tests / allowlisting", () => {
        expect(CTA_LABEL_VALUES).toContain("Open evidence");
        expect(CTA_LABEL_VALUES).toHaveLength(Object.keys(CTA_LABELS).length);
    });
});
