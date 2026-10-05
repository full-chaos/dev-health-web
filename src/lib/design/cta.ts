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
    /** Return to the Dev Health cockpit from global brand navigation. */
    devHealthCockpit: "Full Chaos Dev Health home",
    /** Cognitive Load overview: jump to the Load Drivers tab. */
    exploreLoadDrivers: "Explore load drivers",
    /** Theme switch while the theme is dark: the click switches to light. */
    themeSwitchToLight: "Switch to light theme",
    /** Theme switch while the theme is light: the click switches to dark. */
    themeSwitchToDark: "Switch to dark theme",
    /** Keyboard skip link: move focus past the app shell to the page content. */
    skipToMainContent: "Skip to main content",
    /** Open the evidence trail behind a signal / metric / work unit. */
    openEvidence: "Open evidence",
    /** Evidence drawer: open the provider page of the one repository in scope (served URL). */
    viewOriginalSource: "View original source",
    /** Page header action: open the shared evidence drawer for the page as a whole. */
    viewEvidence: "View evidence",
    /** Home Monitoring: link to the full diagnostic page of the chosen metric group. */
    jumpToDiagnosticViews: "Jump to full diagnostic views",
    /** Primary-signal hero action for the Code destination (approved copy, app.js line 97). */
    inspectCode: "Inspect code",
    /** Primary-signal hero action for the Opportunities destination (approved copy, app.js line 108). */
    reviewOpportunities: "Review opportunities",
    /** Primary-signal hero action for the Flow destination (ruling 93: "Inspect <item>"). */
    inspectFlow: "Inspect flow",
    /** Primary-signal hero action for the Investment destination (ruling 93: "Inspect <item>"). */
    inspectInvestment: "Inspect investment",
    /** Primary-signal hero action for the Landscape destination (ruling 93: "Inspect <item>"). */
    inspectLandscape: "Inspect landscape",
    /** Primary-signal hero action for the Complexity destination (ruling 93: "Inspect <item>"). */
    inspectComplexity: "Inspect complexity",
    /** Primary-signal hero action for the Cognitive Load destination (ruling 93: "Inspect <item>"). */
    inspectCognitiveLoad: "Inspect cognitive load",
    /** Primary-signal hero action for the Bottlenecks destination (ruling 93: "Inspect <item>"). */
    inspectBottlenecks: "Inspect bottlenecks",
    /** Primary-signal hero action for the Operating Review destination (ruling 93: "Inspect <item>"). */
    inspectOperatingReview: "Inspect operating review",
    /** Primary-signal hero action for the Experiments destination (ruling 93: "Inspect <item>"). */
    inspectExperiments: "Inspect experiments",
    /** Primary-signal hero action for the Automations (Improve and AI) destination (ruling 93: "Inspect <item>"). */
    inspectAutomations: "Inspect automations",
    /** Primary-signal hero action for the TestOps destination (ruling 93: "Inspect <item>"). */
    inspectTestOps: "Inspect TestOps",
    /** Primary-signal hero action for the Quality destination (ruling 93: "Inspect <item>"). */
    inspectQuality: "Inspect quality",
    /** Primary-signal hero action for the Security destination (ruling 93: "Inspect <item>"). */
    inspectSecurity: "Inspect security",
    /** Primary-signal hero action for the Delivery Risk destination (ruling 93: "Inspect <item>"). */
    inspectDeliveryRisk: "Inspect delivery risk",
    /** Primary-signal hero action for the Compounding Risk destination (ruling 93: "Inspect <item>"). */
    inspectCompoundingRisk: "Inspect compounding risk",
    /** Primary-signal hero action for the Incident Correlation destination (ruling 93: "Inspect <item>"). */
    inspectIncidentCorrelation: "Inspect incident correlation",
    /** Primary-signal hero action for the Feature Flags destination (ruling 93: "Inspect <item>"). */
    inspectFeatureFlags: "Inspect feature flags",
    /** Primary-signal hero action for the AI Impact destination (ruling 93: "Inspect <item>"). */
    inspectAiImpact: "Inspect AI impact",
    /** Primary-signal hero action for the Review Load destination (ruling 93: "Inspect <item>"). */
    inspectReviewLoad: "Inspect review load",
    /** Primary-signal hero action for the Governance Risk destination (ruling 93: "Inspect <item>"). */
    inspectGovernanceRisk: "Inspect governance risk",
    generateContext: "Generate context",
    markContextIncorrect: "Mark context as incorrect",
    markContextStale: "Mark context as stale",
    markContextIrrelevant: "Mark context as irrelevant",
    /** Open the Investment Confidence tab (classification confidence, evidence quality, coverage). */
    inspectConfidence: "Inspect confidence",
    /** Inspect the associations (edges) linked to an entity. */
    inspectAssociations: "Inspect associations",
    /** Landscape investigation: the throughput flame breakdown (was a second "Inspect associations"). */
    inspectThroughputBreakdown: "Inspect throughput breakdown",
    /** Landscape investigation: the code-hotspots flame (was a second "Inspect associations"). */
    inspectCodeHotspots: "Inspect code hotspots",
    /** Code page: from the repository hotspots to the file-level hotspots (approved copy, app.js:103). */
    fileLevelHotspots: "File-level hotspots",
    /** Code page evidence row (approved copy, app.js:103). */
    ownershipRisk: "Ownership risk",
    /** Code page evidence row (approved copy, app.js:103). */
    thirtyDayFileChurn: "30-day file churn",
    /** Open the Work Graph Artifacts tab (the table form of the graph's entities). */
    browseArtifacts: "Browse artifacts",
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
    continue: "Continue",
    back: "Back",
    saving: "Saving...",
    runNow: "Run now",
    addOneFirst: "Add one first",
    createOneNow: "Create One Now",
    importSelected: "Import Selected",
    /** Copy the current selection / link to the clipboard. */
    copy: "Copy",
    /** Copy the current page URL, with its scope and filter state. */
    copyLink: "Copy link",
    edit: "Edit",
    save: "Save",
    delete: "Delete",
    confirmDelete: "Confirm delete?",
    monteCarloView: "Monte Carlo view",
    viewGuide: "View guide",
    reset: "Reset",
    retry: "Retry",
    reportIssue: "Report issue",
    closeIssueReportPanel: "Close issue report panel",
    close: "Close",
    clearContext: "Clear context",
    clearTheme: "Clear theme",
    allThemes: "All themes",
    openWorkGraph: "Open Work Graph",
    /** Open the Investment view (allocation tab from the Diagnose overview). */
    openInvestment: "Open Investment",
    /** Diagnose overview "Follow a question into evidence": the Work Graph (approved copy, app.js line 97). */
    exploreWorkGraph: "Explore the work graph",
    /** Diagnose overview "Follow a question into evidence": the Review Latency evidence page (approved copy, app.js line 97). */
    inspectReviewLatency: "Inspect review latency",
    /** Diagnose overview "Follow a question into evidence": the Investment Allocation tab (approved copy, app.js line 97). */
    traceEffortAllocation: "Trace effort allocation",
    openMetrics: "Open metrics",
    /** Row action of the Home investigation threads (approved copy, app.js line 100). */
    inspect: "Inspect",
    openWorkView: "Open Work view",
    /** Row action of a worklist: open the destination named by the row (approved copy, app.js line 113). */
    open: "Open",
    evidence: "Evidence",
    /** Section action on a Flow tab: the evidence page of the tab's metric (approved copy, app.js line 98). */
    metricEvidence: "Metric evidence",
    /** Investment Confidence, "Low-confidence areas" action: the Evidence tab (approved copy, app.js line 74). */
    evidenceDrilldown: "Evidence drilldown",
    /** Metric evidence page, Context card: back to the Flow tab of the metric (approved copy, app.js line 99). */
    returnToInvestigation: "Return to investigation",
    /** Investment Allocation, selected-path aside: the Evidence tab (approved copy, app.js line 71). */
    inspectAllocationEvidence: "Inspect allocation evidence",
    /** Investment "Read this with context": open the collapsed AI explanation. */
    showAiExplanation: "Show AI explanation",
    /** Investment "Read this with context": collapse the AI explanation again. */
    hideAiExplanation: "Hide AI explanation",
    /** Investment AI explanation: ask for a new explanation of the same window. */
    regenerate: "Regenerate",
    /** Investment AI explanation: shown on the Regenerate button while the request runs. */
    generating: "Generating...",
    aiImpact: "Impact",
    aiReviewLoad: "Review Load",
    aiRisk: "Risk",
    aiAutomations: "Automations",
    /** Navigate to the AI Automations workflow from a cross-panel CTA. */
    seeAIAutomations: "See AI Automations",
    /** Improve / Automations foot notice: go to the AI Automations destination. */
    viewAIAutomations: "View AI automations",
    /** Open the shared evidence drawer for an opportunity or experiment metric. */
    viewMetricEvidence: "View metric evidence",
    /** Review the evidence behind a suggested experiment (opens the shared drawer). */
    reviewEvidence: "Review evidence",
    /** From an opportunity to the experiments derived from it. */
    exploreExperiments: "Explore experiments",
    checkDataConnections: "Check data connections",
    /** Empty state of a page with no connected source: open the data connections page (approved copy, Govern D6). */
    howToConnect: "How to connect",
    /** Open the Plan / Completion Forecast destination (Plan overview). */
    completionForecast: "Completion Forecast",
    /** Recompute the Completion Forecast (page header action). */
    refreshForecast: "Refresh Forecast",
    /** Plan overview destination: the Completion Forecast page. */
    forecastCompletion: "Forecast completion",
    /** Plan overview destination: the Backlog Risk page. */
    inspectBacklogRisk: "Inspect backlog risk",
    flameDiagram: "Flame Diagram",
    landscape: "Landscape",
    week: "Week",
    month: "Month",
    newReport: "New report",
    createReport: "Create report",
    /** Paginate to the previous page of a list. */
    previousPage: "Previous",
    /** Paginate to the next page of a list. */
    nextPage: "Next",
    /** Dismiss the evidence panel. */
    closeEvidencePanel: "Close evidence panel",
    /** Dismiss a generic panel. */
    closePanel: "Close panel",
    /** Return to the cockpit (home) — the canonical single return path. */
    backToCockpit: "Back to Home",
    /** Start the frictionless one-click GitHub App install (CHAOS-2235). */
    connectGitHubApp: "Connect GitHub App",
    connectPagerDuty: "Connect PagerDuty",
    checkConnectionStatus: "Check connection status",
    disconnect: "Disconnect",
    runPreflight: "Run preflight",
    /** Trigger the org-scoped BYO-LLM preflight (CHAOS-3265). */
    runByoPreflight: "Run BYO preflight",
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
    systemTheme: "System",
    enabled: "Enabled",
    disabled: "Disabled",
    /** Edit a sync configuration from its detail page (CHAOS-2791). */
    editConfig: "Edit config",
    /** Generic backfill entry point from the coverage summary header (CHAOS-2791). */
    backfill: "Backfill",
    /** Gap-scoped backfill deep-link from the coverage timeline (CHAOS-2793). */
    backfillThisGap: "Backfill this gap",
    /** Failure-scoped backfill deep-link from the coverage timeline. */
    backfillThisFailure: "Backfill this failure",
    /** Server-owned config-wide backfill window from the coverage timeline. */
    backfillThisWindow: "Backfill this window",
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
    accountOptions: "Account options",
    preferences: "Preferences",
    signIn: "Sign In",
    signingIn: "Signing in...",
    signOut: "Sign out",
    platformAdmin: "Platform Admin",
    adminPanel: "Admin Panel",
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
    addServiceMapping: "Add service mapping",
    addRepositoryTarget: "Add repository target",
    removeServiceMapping: "Remove service",
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
    addCredential: "Add credential",
    /** Advance the Add Provider wizard's provider-select step (CHAOS-2837). */
    chooseProvider: "Choose provider",
    /** Pick the recommended, one-click GitHub App auth method (CHAOS-2837). */
    useGitHubApp: "Use GitHub App",
    /** Secondary, manual-credential auth method path (CHAOS-2837). */
    useManualToken: "Use a personal access token instead",
    /** PagerDuty fallback for accounts using a REST API token. */
    usePagerDutyApiToken: "Use API token instead",
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
    newSyncConfig: "Add sync config",
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
    /** Marketing link to the customer doc explaining Ask Dev / Context Fabric (CHAOS-3215). */
    viewAskDevDocs: "Learn more",
    confirmMapping: "Confirm Mapping",
    mapIdentity: "Map identity",
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
    /** Work Graph, layered drawing: one width step wider. */
    zoomIn: "Zoom in",
    /** Work Graph, layered drawing: one width step narrower. */
    zoomOut: "Zoom out",
    /** Work Graph, layered drawing: back to the width that fits the box. */
    resetZoom: "Reset zoom",
    filters: "Filters",
    openAiWorkflows: "Open AI Workflows",
    startWithAiImpact: "Start with AI Impact",
    weeklyReview: "Weekly review",
    viewAll: "View all",
    /** Home ranked signals table: show the rows after the first five, in place. */
    showAllSignals: "Show all signals",
    /** Home ranked signals table: back to the first five rows. */
    showFewerSignals: "Show fewer signals",
    provenance: "Provenance",
    apply: "Apply",
    saveOverride: "Save Override",
    manageEntitlements: "Manage Entitlements",
    clearThemeScope: "Clear theme scope",
    exploreContextFabricUseCases: "Explore use cases",
    openContextFabricOverview: "Context Fabric overview",
    seeContextFabricInAction: "See Context Fabric in action",
    readAskDevGuide: "Read the Ask Dev guide",
    configureAcrMcpSidecar: "Configure the ACR MCP sidecar",
    configureAcrAndMcp: "Configure ACR and MCP",
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

export function upgradeToPlan(plan: string): string {
    return `Upgrade to ${plan}`;
}

/**
 * All canonical literal CTA strings (registry values only — not the
 * `backToArea` template). Useful for tests and lint allowlisting.
 */
export const CTA_LABEL_VALUES: readonly CtaLabel[] = Object.values(CTA_LABELS);
