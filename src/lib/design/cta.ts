/**
 * CTA registry (Investment View / nav framework — Part D).
 *
 * Every call-to-action label rendered in a button or link MUST come from this
 * registry. This keeps the verb surface small, consistent, and auditable:
 * one canonical phrasing per action, no per-screen drift.
 *
 * Approved Part D verbs are fixed. Do NOT invent new CTA phrasings inline —
 * add the verb here first (with team sign-off) and reference it from the UI.
 *
 * The design lint `cta-from-registry` rule and `scripts/design-lint.mjs`
 * intentionally skip this file: it is the single source of truth for the
 * literal strings, so the labels live here and nowhere else.
 */
export const CTA_LABELS = {
    /** Open the evidence trail behind a signal / metric / work unit. */
    openEvidence: "Open evidence",
    generateContext: "Generate context",
    markContextIncorrect: "Mark context as incorrect",
    markContextStale: "Mark context as stale",
    markContextIrrelevant: "Mark context as irrelevant",
    /** Inspect the associations (edges) linked to an entity. */
    inspectAssociations: "Inspect associations",
    /** Open a single artifact (flame diagram, PR, deployment, …). */
    openArtifact: "Open artifact",
    /** Open the server-approved provenance URI for a sanitized evidence record. */
    viewSafeSource: "View safe source",
    /** Export the current report. */
    exportReport: "Export report",
    /** Apply the staged filter selection. */
    applyFilters: "Apply filters",
    /** Reset filters back to defaults. */
    resetFilters: "Reset filters",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    clear: "Clear",
    cancel: "Cancel",
    addOneFirst: "Add one first",
    createOneNow: "Create One Now",
    importSelected: "Import Selected",
    /** Copy the current selection / link to the clipboard. */
    copy: "Copy",
    edit: "Edit",
    save: "Save",
    delete: "Delete",
    confirmDelete: "Confirm delete?",
    monteCarloView: "Monte Carlo view",
    viewGuide: "View guide",
    reset: "Reset",
    retry: "Retry",
    clearContext: "Clear context",
    clearTheme: "Clear theme",
    allThemes: "All themes",
    openWorkGraph: "Open Work Graph",
    openMetrics: "Open metrics",
    openWorkView: "Open Work view",
    openInExplore: "Open in Explore",
    evidence: "Evidence",
    aiImpact: "Impact",
    aiReviewLoad: "Review Load",
    aiRisk: "Risk",
    aiAutomations: "Automations",
    /** Navigate to the AI Automations workflow from a cross-panel CTA. */
    seeAIAutomations: "See AI Automations",
    checkDataConnections: "Check data connections",
    flameDiagram: "Flame Diagram",
    landscape: "Landscape",
    week: "Week",
    month: "Month",
    newReport: "New Report",
    createReport: "Create Report",
    /** Paginate to the previous page of a list. */
    previousPage: "Previous",
    /** Paginate to the next page of a list. */
    nextPage: "Next",
    /** Dismiss the evidence panel. */
    closeEvidencePanel: "Close evidence panel",
    /** Dismiss a generic panel. */
    closePanel: "Close panel",
    /** Return to the cockpit (home) — the canonical single return path. */
    backToCockpit: "Back to Cockpit",
    /** Start the frictionless one-click GitHub App install (CHAOS-2235). */
    connectGitHubApp: "Connect GitHub App",
    /** Advance to the next step of the guided onboarding flow (CHAOS-2675). */
    continueStep: "Continue",
    /** Continue the guided first-run setup from the dashboard (CHAOS-2678). */
    continueSetup: "Continue setup",
    /** Choose which repositories to sync during first-run setup (CHAOS-2681). */
    selectRepositories: "Select repositories",
    /** Begin the first repository sync after explicit confirmation (CHAOS-2681). */
    startSync: "Start sync",
    lightTheme: "Light",
    darkTheme: "Dark",
    enabled: "Enabled",
    disabled: "Disabled",
    /** Edit a sync configuration from its detail page (CHAOS-2791). */
    editConfig: "Edit config",
    /** Generic backfill entry point from the coverage summary header (CHAOS-2791). */
    backfill: "Backfill",
    /** Gap-scoped backfill deep-link from the coverage timeline (CHAOS-2793). */
    backfillThisGap: "Backfill this gap",
    allDatasets: "All datasets",
    allSources: "All sources",
    /** Reset the run-detail unit table status filter (CHAOS-2794). */
    allStatuses: "All statuses",
    viewRun: "View run",
    /** Advance the backfill wizard to the previous step (CHAOS-2796). */
    backButton: "Back",
    /** Submit the backfill wizard's final step (CHAOS-2796). */
    runBackfill: "Run backfill",
    /** Dismiss the backfill wizard modal (CHAOS-2796). */
    closeWizard: "Close",
    /** Dismiss the wizard's post-submit result step (CHAOS-2796). */
    done: "Done",
    addUser: "Add User",
    addTeam: "Add Team",
    importTeams: "Import Teams",
    addIdentity: "Add Identity",
    reviewIssues: "Review issues",
    reviewSyncHealth: "Review sync health",
    manageConnections: "Manage connections",
    reviewIdentities: "Review identities",
    openSyncStatus: "Open sync status",
    /** Open the row-level detail surface for an audit-log event (CHAOS-2843). */
    openDetails: "Open details",
    /** Schedule the subscription to end at the current billing period's close (CHAOS-2839). */
    cancelAtPeriodEnd: "Cancel at period end",
    /** End the subscription right away, forfeiting remaining paid time (CHAOS-2839). */
    cancelImmediately: "Cancel immediately",
    /** Restore a subscription that was scheduled to cancel at period end (CHAOS-2839). */
    reactivateSubscription: "Reactivate",
    /** Generic affirmative action for the shared ConfirmDialog primitive (CHAOS-2845). */
    confirm: "Confirm",
    /** Submit the guided sync-config creation wizard's review step (CHAOS-2838). */
    createConfiguration: "Create Configuration",
    /** Submit the sync-config edit form (CHAOS-2838). */
    updateConfiguration: "Update Configuration",
    /** In-flight label while a sync-config create/update request is pending (CHAOS-2838). */
    savingConfiguration: "Saving...",
    /** Link to plan settings from a tier-gated/locked option's upgrade copy (CHAOS-2838). */
    upgradePlan: "Upgrade plan",
    /** Discoverable row-level remove action for a mapping entry (provider identity row, CHAOS-2841). */
    remove: "Remove",
    /** Add another provider identity row to the identity mapping form (CHAOS-2841). */
    addProviderIdentity: "+ Add Identity",
    /** Open the create-entry form on the IP allowlist admin page (CHAOS-2842). */
    addIpAllowlistEntry: "Add IP Rule",
    /** Open the create-policy form on the data retention admin page (CHAOS-2842). */
    addRetentionPolicy: "Add Policy",
    /** Turn on a currently-inactive IP rule or retention policy (CHAOS-2842). */
    enableEntry: "Enable",
    /** Turn off a currently-active IP rule or retention policy (CHAOS-2842). */
    disableEntry: "Disable",
    /** Trigger the dry-run-then-confirm manual retention run flow (CHAOS-2842). */
    runPolicyNow: "Run Now",
    /** Proceed with a safety-critical change despite an explicit lockout-risk warning (CHAOS-2842). */
    acknowledgeAndSave: "Save anyway",
    /** Open the guided Add Provider workflow (CHAOS-2837). */
    addProvider: "Add Provider",
    /** Advance the Add Provider wizard's provider-select step (CHAOS-2837). */
    chooseProvider: "Choose provider",
    /** Pick the recommended, one-click GitHub App auth method (CHAOS-2837). */
    useGitHubApp: "Use GitHub App",
    /** Secondary, manual-credential auth method path (CHAOS-2837). */
    useManualToken: "Use a personal access token instead",
    /** Row action opening the manage/edit modal for a healthy credential (CHAOS-2837). */
    manageCredential: "Manage",
    /** Row action opening the manage/edit modal for a failing/untested credential (CHAOS-2837). */
    resolveCredential: "Resolve",
    /** Row action re-running a connection test from the credentials table (CHAOS-2837). */
    testCredential: "Test",
    /** Submit the Add Provider wizard's verify-connection step (CHAOS-2837). */
    verifyConnection: "Verify connection",
    /** Submit the Add Provider wizard's final review step (CHAOS-2837). */
    finishAddProvider: "Finish",
    /** Finish-step follow-up: jump straight into creating a sync configuration (CHAOS-2837). */
    createSyncConfig: "Create sync configuration",
    newSyncConfig: "New Config",
    manageSyncConfig: "Manage",
    pauseSync: "Pause",
    resumeSync: "Resume",
    syncNow: "Sync Now",
    syncing: "Syncing...",
    confirmDeleteSyncConfig: "Yes, Delete",
    /** Start the managed-sync connection flow from the provider mode-choice card (CHAOS-2714). */
    setUpManagedSync: "Set up managed sync",
    /** Start the customer-push source setup flow from the provider mode-choice card (CHAOS-2714). */
    setUpCustomerPush: "Set up customer push",
    /** Submit the customer-push source registration form (CHAOS-2714). */
    createCustomerPushSource: "Create customer-push source",
    /** Submit the customer-push ingest credential creation form (CHAOS-2714). */
    createCredential: "Create credential",
    /** Revoke a customer-push ingest credential (CHAOS-2714). */
    revoke: "Revoke",
    /** Rotate a customer-push ingest credential, issuing a new one-time token (CHAOS-2714). */
    rotate: "Rotate",
    /** Jump from the token reveal panel to the runner setup examples (CHAOS-2714). */
    viewSetupExamples: "View setup examples",
    /** Submit the customer-push payload validation form (CHAOS-2714, validate-only in v1). */
    validatePayload: "Validate payload",
    /** Clear the active producer-bucket filter chip on the batch list (CHAOS-2714 D8). */
    allProducers: "All producers",
    /** Inline link to the Validate screen from the empty batch-list state (CHAOS-2714). */
    goToValidate: "Validate",
    /** Inline link to the runner setup examples from the empty batch-list state (CHAOS-2714). */
    goToCiJob: "CI job",
} as const;

export type CtaKey = keyof typeof CTA_LABELS;
export type CtaLabel = (typeof CTA_LABELS)[CtaKey];

/**
 * Contextual return path to a named decision area, e.g. `Back to Metrics`,
 * `Back to Explore`. Use this instead of bespoke "Back to <area> view" strings
 * so every screen exposes exactly one, consistently-phrased return path.
 */
export function backToArea(area: string): string {
    return `Back to ${area}`;
}

/**
 * All canonical literal CTA strings (registry values only — not the
 * `backToArea` template). Useful for tests and lint allowlisting.
 */
export const CTA_LABEL_VALUES: readonly CtaLabel[] = Object.values(CTA_LABELS);
