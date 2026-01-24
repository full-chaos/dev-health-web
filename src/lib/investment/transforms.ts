/**
 * Investment view transform utilities.
 *
 * Extracted from InvestmentView.tsx to reduce component size
 * and enable reuse across investment-related views.
 */

import type {
    WorkUnitInvestment,
    SankeyResponse,
    SankeyNode,
    SankeyLink,
} from "@/lib/types";
import { formatNumber, formatTimestamp } from "@/lib/formatters";
import type { MetricFilter } from "@/lib/filters/types";

// ============================================================================
// Theme / Subcategory label utilities
// ============================================================================

export const THEME_LABELS: Record<string, string> = {
    feature_delivery: "Feature Delivery",
    operational: "Operational / Support",
    maintenance: "Maintenance / Tech Debt",
    quality: "Quality / Reliability",
    risk: "Risk / Security",
};

export const THEME_KEYS_BY_LABEL = Object.fromEntries(
    Object.entries(THEME_LABELS).map(([key, label]) => [label.toLowerCase(), key])
) as Record<string, string>;

export const UNASSIGNED_TEAM_LABEL = "Unassigned team";
export const UNASSIGNED_REPO_LABEL = "Unassigned repo";
export const UNASSIGNED_THEME_LABEL = "Unassigned theme";
export const UNASSIGNED_SUBCATEGORY_LABEL = "Unassigned subcategory";
export const OTHER_REPOS_LABEL = "Other repos";
export const TOP_N_REPOS = 12;

/**
 * Title case a string, converting underscores/hyphens to spaces.
 */
export const titleCase = (value: string): string =>
    value
        .replace(/[_-]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

/**
 * Normalize a theme key to its canonical form.
 */
export const normalizeThemeKey = (value: string | null): string | null => {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const lower = trimmed.toLowerCase();
    if (THEME_LABELS[lower]) {
        return lower;
    }
    if (THEME_KEYS_BY_LABEL[lower]) {
        return THEME_KEYS_BY_LABEL[lower];
    }
    const slug = lower.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return slug || null;
};

/**
 * Format a subcategory label, optionally including the theme prefix.
 */
export const formatSubcategoryLabel = (value: string, includeTheme = true): string => {
    if (!value.includes(".")) {
        return titleCase(value);
    }
    const [theme, sub] = value.split(".", 2);
    const subLabel = titleCase(sub ?? value);
    if (!includeTheme) {
        return subLabel;
    }
    return `${titleCase(theme)} · ${subLabel}`;
};

/**
 * Normalize labels containing "unassigned" to consistent canonical labels.
 */
export const normalizeUnassignedLabel = (value: string, group?: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
        return value;
    }
    const lower = trimmed.toLowerCase();
    if (!lower.includes("unassigned")) {
        return trimmed;
    }
    if (group === "team") return UNASSIGNED_TEAM_LABEL;
    if (group === "repo") return UNASSIGNED_REPO_LABEL;
    if (group === "category") return UNASSIGNED_THEME_LABEL;
    if (group === "subcategory") return UNASSIGNED_SUBCATEGORY_LABEL;
    return trimmed;
};

/**
 * Strip Sankey node prefixes (team:, repo:, category:, subcategory:).
 */
export const stripSankeyPrefix = (value: string): string =>
    value.replace(/^(team|repo|subcategory|category):\s*/i, "");

/**
 * Check if a label indicates unassigned status.
 */
export const isUnassignedLabel = (value: string): boolean =>
    value.toLowerCase().includes("unassigned");

// ============================================================================
// Time range utilities
// ============================================================================

/**
 * Build an optional time range label from start/end dates.
 */
export const buildOptionalTimeRangeLabel = (start?: string, end?: string): string | null => {
    if (!start || !end) return null;
    const startLabel = formatTimestamp(start);
    const endLabel = formatTimestamp(end);
    if (startLabel === "Unavailable" || endLabel === "Unavailable") {
        return null;
    }
    return `${startLabel} – ${endLabel}`;
};

/**
 * Build a time range label from start/end dates.
 */
export const buildTimeRangeLabel = (start?: string, end?: string): string => {
    const startLabel = formatTimestamp(start ?? null);
    const endLabel = formatTimestamp(end ?? null);
    return `${startLabel} – ${endLabel}`;
};

// ============================================================================
// Work unit formatting utilities
// ============================================================================

/**
 * Format evidence quality band label.
 */
export const formatBandLabel = (band: WorkUnitInvestment["evidence_quality"]["band"]): string =>
    titleCase((band ?? "").replace("_", " "));

/**
 * Format a quality value.
 */
export const formatQuality = (value: number): string =>
    formatNumber(value, { maximumFractionDigits: 2 });

/**
 * Format effort unit label.
 */
export const formatEffortUnit = (metric: WorkUnitInvestment["effort"]["metric"]): string =>
    metric === "active_hours" ? "hours" : "loc";

/**
 * Format a work unit's display label.
 */
export const formatWorkUnitLabel = (unit: WorkUnitInvestment): string => {
    const candidates = [
        unit.work_unit_name,
        unit.display_name,
        unit.title,
        unit.summary,
    ]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);

    if (candidates.length) {
        return candidates[0];
    }

    const provider = typeof unit.provider === "string" ? unit.provider.trim() : "";
    const itemType = typeof unit.item_type === "string" ? unit.item_type.trim() : "";
    const keyCandidate = [
        typeof unit.key === "string" ? unit.key.trim() : "",
        typeof unit.external_key === "string" ? unit.external_key.trim() : "",
    ].find(Boolean) ?? "";

    if (provider && itemType && keyCandidate) {
        return `${provider}:${itemType}:${keyCandidate}`;
    }

    if (provider && itemType) {
        return `${provider}:${itemType}`;
    }

    const idValue = typeof unit.work_unit_id === "string" ? unit.work_unit_id.trim() : "";
    if (idValue.includes(":")) {
        return idValue;
    }

    return "Work unit";
};

/**
 * Format a work unit's type label.
 */
export const formatWorkUnitTypeLabel = (unit: WorkUnitInvestment): string => {
    const primary = typeof unit.work_unit_type === "string" ? unit.work_unit_type.trim() : "";
    const fallback = typeof unit.item_type === "string" ? unit.item_type.trim() : "";
    const value = primary || fallback;
    if (!value) return "";
    return titleCase(value.replace(/_/g, " "));
};

/**
 * Format a work unit ID token for display.
 */
export const formatWorkUnitIdToken = (workUnitId: string): string => {
    if (!workUnitId) return "";
    const trimmed = workUnitId.trim();
    if (trimmed.length <= 14) {
        return trimmed;
    }
    return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
};

// ============================================================================
// Color utilities
// ============================================================================

/**
 * Clamp a value between min and max.
 */
export const clamp = (value: number, min = 0, max = 1): number =>
    Math.min(max, Math.max(min, value));

/**
 * Adjust a hex color by an amount.
 */
export const adjustHex = (hex: string, amount: number): string => {
    const normalized = hex.replace("#", "");
    if (normalized.length !== 6) {
        return hex;
    }
    const value = Number.parseInt(normalized, 16);
    const clampChannel = (channel: number) => Math.max(0, Math.min(255, channel));
    const r = clampChannel((value >> 16) + amount);
    const g = clampChannel(((value >> 8) & 0xff) + amount);
    const b = clampChannel((value & 0xff) + amount);
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

// ============================================================================
// Complex Sankey construction (extracted from InvestmentView.tsx)
// ============================================================================

/**
 * Build a Sankey diagram structure for Repo -> Team flow based on work units.
 */
export const buildRepoTeamSankey = (
    units: WorkUnitInvestment[],
    repoTeamMap: Record<string, string>,
    categoryColorMap: Map<string, string>
): SankeyResponse & { hasTeamAssociations: boolean } => {
    const nodesByName = new Map<string, SankeyNode>();
    const linkTotals = new Map<string, number>();
    let hasTeamAssociations = false;

    const addNode = (name: string, group: string, color?: string) => {
        if (nodesByName.has(name)) {
            return;
        }
        nodesByName.set(name, {
            name,
            group,
            itemStyle: color ? { color } : undefined,
        });
    };

    const addLink = (source: string, target: string, value: number) => {
        if (!Number.isFinite(value) || value <= 0) {
            return;
        }
        const key = `${source}|||${target}`;
        linkTotals.set(key, (linkTotals.get(key) ?? 0) + value);
    };

    units.forEach((unit) => {
        const effortValue = unit.effort?.value ?? 0;
        if (!Number.isFinite(effortValue) || effortValue <= 0) {
            return;
        }

        const repoIds = (unit.evidence?.contextual ?? [])
            .flatMap((entry) => {
                if (!entry || typeof entry !== "object") {
                    return [];
                }
                const record = entry as { type?: unknown; repo_ids?: unknown };
                if (record.type !== "repo_scope") {
                    return [];
                }
                return Array.isArray(record.repo_ids) ? record.repo_ids : [];
            })
            .filter((repoId): repoId is string => typeof repoId === "string");
        const uniqueRepos = Array.from(new Set(repoIds));
        const teamNames = (unit.evidence?.contextual ?? [])
            .flatMap((entry) => {
                if (!entry || typeof entry !== "object") {
                    return [];
                }
                const record = entry as {
                    type?: unknown;
                    team_name?: unknown;
                    team_id?: unknown;
                    team?: unknown;
                    teams?: unknown;
                    team_names?: unknown;
                    team_ids?: unknown;
                };
                const type = typeof record.type === "string" ? record.type : "";
                if (type && type !== "team_scope" && type !== "team") {
                    return [];
                }
                const nameList: string[] = [];
                const idList: string[] = [];
                if (typeof record.team_name === "string") nameList.push(record.team_name);
                if (Array.isArray(record.team_names)) {
                    record.team_names.forEach((team) => {
                        if (typeof team === "string") nameList.push(team);
                    });
                }
                if (typeof record.team_id === "string") idList.push(record.team_id);
                if (typeof record.team === "string") idList.push(record.team);
                if (Array.isArray(record.teams)) {
                    record.teams.forEach((team) => {
                        if (typeof team === "string") idList.push(team);
                    });
                }
                if (Array.isArray(record.team_ids)) {
                    record.team_ids.forEach((team) => {
                        if (typeof team === "string") idList.push(team);
                    });
                }
                return nameList.length ? nameList : idList;
            })
            .map((team) => team.trim())
            .filter(Boolean);
        const uniqueTeams = Array.from(new Set(teamNames))
            .map((team) => normalizeUnassignedLabel(team, "team"))
            .filter(Boolean);
        const hasRepos = uniqueRepos.length > 0;
        const repoTargets = hasRepos ? uniqueRepos : [UNASSIGNED_REPO_LABEL];
        const repoShare = repoTargets.length ? 1 / repoTargets.length : 0;
        if (!repoShare) {
            return;
        }

        Object.entries(unit.investment?.subcategories ?? {}).forEach(([subcategory, weight]) => {
            if (!Number.isFinite(weight) || weight <= 0) {
                return;
            }
            const sourceLabel = formatSubcategoryLabel(subcategory, true);
            const sourceColor = categoryColorMap.get(subcategory);
            const sourceKey = `subcategory:${sourceLabel}`;
            addNode(sourceKey, "subcategory", sourceColor);

            repoTargets.forEach((repoId) => {
                const repoLabel = normalizeUnassignedLabel(
                    repoId === UNASSIGNED_REPO_LABEL ? UNASSIGNED_REPO_LABEL : repoId.replace(/^repo:/, ""),
                    "repo"
                );
                const repoKey = `repo:${repoLabel}`;
                const mappedTeam = repoId === UNASSIGNED_REPO_LABEL ? null : repoTeamMap[repoId];
                const teamTargets = mappedTeam
                    ? [normalizeUnassignedLabel(mappedTeam, "team")]
                    : uniqueTeams.length
                        ? uniqueTeams
                        : [UNASSIGNED_TEAM_LABEL];
                const teamShare = 1 / teamTargets.length;
                const value = effortValue * weight * repoShare;

                addNode(repoKey, "repo");
                addLink(sourceKey, repoKey, value);

                teamTargets.forEach((teamLabel) => {
                    const teamKey = `team:${teamLabel}`;
                    addNode(teamKey, "team");
                    addLink(repoKey, teamKey, value * teamShare);
                    hasTeamAssociations = true;
                });
            });
        });
    });

    const links: SankeyLink[] = Array.from(linkTotals, ([key, value]) => {
        const [source, target] = key.split("|||");
        return { source, target, value };
    });

    return {
        mode: "investment",
        nodes: Array.from(nodesByName.values()),
        links,
        hasTeamAssociations,
    };
};

/**
 * Calculate baseline filters for comparison (shift back by the same duration).
 */
export const getBaselineFilters = (filters: MetricFilter): MetricFilter => {
    const { start_date, end_date, range_days } = filters.time;
    let baselineStart: string;
    let baselineEnd: string;

    if (start_date && end_date) {
        const start = new Date(start_date);
        const end = new Date(end_date);
        const durationMs = end.getTime() - start.getTime();
        // Shift back by duration + 1 day
        const bEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
        const bStart = new Date(bEnd.getTime() - durationMs);
        baselineStart = bStart.toISOString().split("T")[0];
        baselineEnd = bEnd.toISOString().split("T")[0];
    } else {
        const bEnd = new Date(new Date().getTime() - range_days * 24 * 60 * 60 * 1000);
        const bStart = new Date(bEnd.getTime() - (range_days - 1) * 24 * 60 * 60 * 1000);
        baselineStart = bStart.toISOString().split("T")[0];
        baselineEnd = bEnd.toISOString().split("T")[0];
    }

    return {
        ...filters,
        time: {
            ...filters.time,
            start_date: baselineStart,
            end_date: baselineEnd,
        },
    };
};
