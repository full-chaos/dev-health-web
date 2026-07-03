import { PROVIDER_SYNC_TARGETS, type Provider } from "@/lib/admin/types";

export const ALL_SYNC_TARGETS = [
    { id: "git", label: "Git Data (Commits, Branches)" },
    { id: "prs", label: "Pull Requests" },
    { id: "cicd", label: "CI/CD Pipelines" },
    { id: "deployments", label: "Deployments" },
    { id: "incidents", label: "Incidents" },
    { id: "work-items", label: "Work Items (Issues, Tickets)" },
    { id: "feature-flags", label: "Feature Flags" },
];

export const DATASET_LABELS: Record<string, string> = Object.fromEntries(
    ALL_SYNC_TARGETS.map((t) => [t.id, t.label]),
);

// Providers where work-item / team attribution applies, so auto-importing
// teams, projects & members is meaningful. Pure feature-flag providers
// (e.g. launchdarkly) and pure-git/local sources are excluded.
export const AUTO_IMPORT_PROVIDERS = ["github", "gitlab", "jira", "linear"];

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

export function formatDepthLabel(value: number | null | undefined): string {
    const match = INITIAL_DEPTH_OPTIONS.find((opt) => opt.value === (value ?? 30));
    return match?.label ?? `${value} days`;
}

export function formatScheduleLabel(cron: string | null | undefined): string {
    return cron ? cron : "Manual only";
}
