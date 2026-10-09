import type { MetricFilter } from "@/lib/filters/types";
import { UNASSIGNED_TEAM_LABEL } from "@/lib/investment/transforms";

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
    /** Served repository id -> name. A repository with no name is absent. */
    repo_names: Record<string, string>;
    /** Served developer email -> display name. A developer with no name is absent. */
    developer_names: Record<string, string>;
    repos: string[];
    services: string[];
    developers: string[];
    work_category: string[];
};

export const EMPTY_FILTER_OPTIONS: FilterOptions = {
    teams: [],
    team_names: {},
    repo_names: {},
    developer_names: {},
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
    /** A value with no served name that is itself a readable name (a repository name the filter keeps). */
    isName: (value: string) => boolean = () => false,
) {
    const labelById = new Map<string, string>();
    const idByLabel = new Map<string, string>();
    const seen = new Map<string, number>();
    for (const id of new Set([...ids, ...selected])) {
        const base = teamNames[id]?.trim() || (isName(id) ? id : UNRESOLVED_TEAM_LABEL);
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const label = n > 1 ? `${base} (${n})` : base;
        labelById.set(id, label);
        idByLabel.set(label, id);
    }
    return {
        all: ids.map((id) => labelById.get(id) as string),
        selected: selected.map((id) => labelById.get(id) as string),
        labelOf: (id: string) => labelById.get(id) ?? UNRESOLVED_TEAM_LABEL,
        toIds: (labels: string[]) => labels.map((label) => idByLabel.get(label) ?? label),
    };
}

/** The served team id for work with no team. It is not a team: it has its own label. */
export const UNASSIGNED_TEAM_ID = "unassigned";

/**
 * The team menu and the team state of the scope bar. Only a team with a served name is a row.
 * `unassigned` is a row with the unassigned-work label, last. Any other id with no served name is
 * no row; if the filter selects such an id (an old link) the bar shows one "Unresolved" state with
 * no number, and `toIds` keeps those ids in the filter. Never the id itself.
 */
export function teamScopeLabels(
    ids: string[],
    teamNames: Record<string, string>,
    selected: string[],
) {
    const isNamed = (id: string) => id !== UNASSIGNED_TEAM_ID && Boolean(teamNames[id]?.trim());
    const rows = [...new Set(ids)];
    const listed = [
        ...rows.filter(isNamed),
        ...(rows.includes(UNASSIGNED_TEAM_ID) ? [UNASSIGNED_TEAM_ID] : []),
    ];
    const selectedListed = selected.filter((id) => isNamed(id) || id === UNASSIGNED_TEAM_ID);
    const unresolvedIds = selected.filter((id) => !isNamed(id) && id !== UNASSIGNED_TEAM_ID);
    const names = { ...teamNames, [UNASSIGNED_TEAM_ID]: UNASSIGNED_TEAM_LABEL };
    const base = teamMenuLabels(listed, names, selectedListed);
    const unresolved = unresolvedIds.length ? [UNRESOLVED_TEAM_LABEL] : [];
    return {
        all: base.all,
        selected: [...base.selected, ...unresolved],
        labelOf: (id: string) =>
            id === UNASSIGNED_TEAM_ID || isNamed(id) ? base.labelOf(id) : UNRESOLVED_TEAM_LABEL,
        toIds: (labels: string[]) => [
            ...base.toIds(labels.filter((label) => label !== UNRESOLVED_TEAM_LABEL)),
            ...(labels.includes(UNRESOLVED_TEAM_LABEL) ? unresolvedIds : []),
        ],
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
