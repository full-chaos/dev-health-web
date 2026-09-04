import { PROVIDER_SYNC_TARGETS, type Provider } from "@/lib/admin/types";

export const ALL_SYNC_TARGETS = [
    {
        id: "git",
        label: "Git Data (Commits, Branches)",
        description:
            "Pulls commit history, branches, and authorship for delivery and ownership metrics.",
    },
    {
        id: "prs",
        label: "Pull Requests",
        description: "Pulls pull/merge request activity, reviews, and cycle time.",
    },
    {
        id: "cicd",
        label: "CI/CD Pipelines",
        description: "Pulls pipeline runs, build status, and duration for delivery health.",
    },
    {
        id: "tests",
        label: "Test Results (JUnit reports)",
        description:
            "Downloads CI test-report artifacts to pull test suite/case results and job-level CI data. Heavier than other datasets and off by default -- artifact retention is typically 14 days, so backfills only recover a recent window.",
    },
    {
        id: "deployments",
        label: "Deployments",
        description: "Pulls deployment events for release frequency and stability tracking.",
    },
    {
        id: "incidents",
        label: "Incidents",
        description: "Pulls incident records for reliability and on-call load metrics.",
    },
    {
        id: "work-items",
        label: "Work Items (Issues, Tickets)",
        description: "Pulls issues and tickets for work-item tracking and investment analysis.",
    },
    {
        id: "feature-flags",
        label: "Feature Flags",
        description: "Pulls feature-flag state and evaluation activity for rollout tracking.",
    },
    {
        id: "operational",
        label: "PagerDuty operational data",
        description:
            "Pulls PagerDuty services, incidents, responders, schedules, and operational history.",
    },
];

export const DATASET_LABELS: Record<string, string> = Object.fromEntries(
    ALL_SYNC_TARGETS.map((t) => [t.id, t.label]),
);

// Category metadata for the "Import from provider during sync" checkboxes
// (CHAOS-4323). Whether a given provider supports a category (and, if not,
// why) comes from the live `GET /sync-configs/auto-import-capabilities`
// endpoint (AutoImportCapabilities), not a static frontend list -- this is
// just the fixed id/label/description per checkbox.
export const AUTO_IMPORT_CATEGORIES: {
    id: "teams" | "projects" | "members";
    label: string;
    description: string;
}[] = [
    {
        id: "teams",
        label: "Import teams",
        description: "Discover and import teams from this provider during sync.",
    },
    {
        id: "projects",
        label: "Import projects",
        description: "Import projects and set team ownership for attribution.",
    },
    {
        id: "members",
        label: "Import members",
        description: "Import members and team memberships to populate identities.",
    },
];

export function getSyncTargetsForProvider(provider: string) {
    const allowed =
        PROVIDER_SYNC_TARGETS[provider as Provider] ?? Object.values(PROVIDER_SYNC_TARGETS).flat();
    return ALL_SYNC_TARGETS.filter((t) => allowed.includes(t.id));
}

export function sameRepoSelection(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every((repo) => rightSet.has(repo));
}

export type InitialDepthTier = "team" | "enterprise" | null;

export const INITIAL_DEPTH_OPTIONS: {
    label: string;
    value: number;
    tier: InitialDepthTier;
}[] = [
    { label: "30 days", value: 30, tier: null },
    { label: "90 days", value: 90, tier: "team" },
    { label: "6 months", value: 180, tier: "team" },
    { label: "1 year", value: 365, tier: "enterprise" },
    { label: "All time", value: 0, tier: "enterprise" },
];

/**
 * Numeric ordering for tier gating (higher = more access). Any tier string
 * not present here (including "community"/"free") ranks lowest, so an
 * unrecognized or entry-level tier never unlocks a gated option.
 */
const DEPTH_TIER_RANK: Record<string, number> = {
    community: 0,
    free: 0,
    team: 1,
    enterprise: 2,
};

export const DEPTH_TIER_LABELS: Record<"team" | "enterprise", string> = {
    team: "Team",
    enterprise: "Enterprise",
};

/**
 * Whether an initial-depth option is locked for the given account tier.
 * Compares tier RANK (not a single feature boolean) so a Team-tier account
 * unlocks Team-gated options but NOT Enterprise-gated ones (CHAOS-2838
 * review fix — the prior boolean-only check let Team accounts through to
 * Enterprise-only ranges).
 */
export function isDepthOptionGated(currentTier: string, optionTier: InitialDepthTier): boolean {
    if (!optionTier) return false;
    return (DEPTH_TIER_RANK[currentTier] ?? 0) < DEPTH_TIER_RANK[optionTier];
}

export function formatDepthLabel(value: number | null | undefined): string {
    const match = INITIAL_DEPTH_OPTIONS.find((opt) => opt.value === (value ?? 30));
    return match?.label ?? `${value} days`;
}

export function formatScheduleLabel(cron: string | null | undefined): string {
    return cron ? cron : "Manual only";
}
