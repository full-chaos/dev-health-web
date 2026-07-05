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
    /** Inspect the associations (edges) linked to an entity. */
    inspectAssociations: "Inspect associations",
    /** Open a single artifact (flame diagram, PR, deployment, …). */
    openArtifact: "Open artifact",
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
    inviteUser: "Invite User",
    addTeam: "Add Team",
    importTeams: "Import Teams",
    addIdentity: "Add Identity",
    reviewIssues: "Review issues",
    reviewSyncHealth: "Review sync health",
    manageConnections: "Manage connections",
    reviewIdentities: "Review identities",
    openSyncStatus: "Open sync status",
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
