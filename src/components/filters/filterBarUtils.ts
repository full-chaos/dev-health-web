import type { MetricFilter } from "@/lib/filters/types";

export const DATE_PRESETS = [
    { label: "7d", days: 7 },
    { label: "14d", days: 14 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
];

export type FilterOptions = {
    teams: string[];
    /** Served team id -> display name. A team with no name is absent. */
    team_names: Record<string, string>;
    repos: string[];
    services: string[];
    developers: string[];
    work_category: string[];
};

export const EMPTY_FILTER_OPTIONS: FilterOptions = {
    teams: [],
    team_names: {},
    repos: [],
    services: [],
    developers: [],
    work_category: [],
};

export const toList = (value: string) =>
    value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

const EMAIL_VALUE_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export const toEmailList = (value: string) =>
    toList(value).filter((item) => EMAIL_VALUE_PATTERN.test(item));

export const toValue = (value?: string[]) => (value && value.length ? value.join(", ") : "");

export const formatSelection = (values: string[], emptyLabel: string) => {
    if (!values.length) {
        return emptyLabel;
    }
    if (values.length <= 2) {
        return values.join(", ");
    }
    return `${values.length} selected`;
};

export const UNRESOLVED_TEAM_LABEL = "Unresolved";

/**
 * The text the team menu shows for each team id: the served name, else "Unresolved", never the
 * id. Two teams that read the same get a counter so each option stays distinct.
 */
export function teamMenuLabels(
    ids: string[],
    teamNames: Record<string, string>,
    selected: string[],
) {
    const labelById = new Map<string, string>();
    const idByLabel = new Map<string, string>();
    const seen = new Map<string, number>();
    for (const id of new Set([...ids, ...selected])) {
        const base = teamNames[id]?.trim() || UNRESOLVED_TEAM_LABEL;
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const label = n > 1 ? `${base} (${n})` : base;
        labelById.set(id, label);
        idByLabel.set(label, id);
    }
    return {
        all: ids.map((id) => labelById.get(id) as string),
        selected: selected.map((id) => labelById.get(id) as string),
        toIds: (labels: string[]) => labels.map((label) => idByLabel.get(label) ?? label),
    };
}

export const toggleValue = (values: string[], value: string) => {
    if (values.includes(value)) {
        return values.filter((item) => item !== value);
    }
    return [...values, value];
};

export const scopeLabelMap: Record<MetricFilter["scope"]["level"], string> = {
    org: "Org",
    team: "Team",
    repo: "Repo",
    service: "Service",
    developer: "Developer",
};
