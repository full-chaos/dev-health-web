"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChartTypeToggle, TREEMAP_SUNBURST_OPTIONS, type TreemapSunburstType } from "@/components/charts/ChartTypeToggle";
import { InvestmentMixSunburst } from "@/components/charts/InvestmentMixSunburst";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { TreemapChart, type TreemapNode } from "@/components/charts/TreemapChart";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { buildTooltipHtml, calcPercent } from "@/lib/chartUtils";
import { investmentMixSample, investmentRepoTeamMapSample, workUnitInvestmentsSample } from "@/data/devHealthOpsSample";
import {
    explainInvestmentMix,
    getInvestment,
    getWorkUnits,
    getWorkUnitExplanation,
    getInvestmentFlow,
    getInvestmentRepoTeamFlow,
} from "@/lib/api";
import { getSortedSubcategories, getSortedThemes, normalizeInvestmentMix, type InvestmentMixAggregate } from "@/lib/investmentMix";
import { formatNumber, formatTimestamp } from "@/lib/formatters";
import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentMixExplanation, WorkUnitInvestment, WorkUnitExplanation, SankeyLink, SankeyNode, SankeyResponse } from "@/lib/types";

type InvestmentViewProps = {
    filters: MetricFilter;
};

type CategorizationMode = "text_metadata" | "metadata_only";

type TreemapSelection = {
    key: string;
    type: "theme" | "subcategory";
    themeLabel: string;
    themeKey: string | null;
    subcategoryLabel?: string;
    subcategoryId?: string | null;
};

type EvidenceUnit = {
    unit: WorkUnitInvestment;
    weightedEffort: number;
    weight: number;
};

const CATEGORIZATION_OPTIONS: Array<{ id: CategorizationMode; label: string }> = [
    { id: "text_metadata", label: "Text + metadata" },
    { id: "metadata_only", label: "Metadata only" },
];

const EVIDENCE_QUALITY_BANDS = [
    { id: "high", label: "High (0.80–1.00)", opacityClass: "opacity-100" },
    { id: "moderate", label: "Moderate (0.60–0.79)", opacityClass: "opacity-75" },
    { id: "low", label: "Low (0.40–0.59)", opacityClass: "opacity-50" },
    { id: "very_low", label: "Very low (<0.40)", opacityClass: "opacity-30" },
] as const;

const TOP_N_REPOS = 12;
const OTHER_REPOS_LABEL = "Other repos";
const UNASSIGNED_TEAM_LABEL = "Unassigned team";
const UNASSIGNED_REPO_LABEL = "Unassigned repo";
const UNASSIGNED_THEME_LABEL = "Unassigned theme";
const UNASSIGNED_SUBCATEGORY_LABEL = "Unassigned subcategory";

const titleCase = (value: string) =>
    value
        .replace(/[_-]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

const THEME_LABELS: Record<string, string> = {
    feature_delivery: "Feature Delivery",
    operational: "Operational / Support",
    maintenance: "Maintenance / Tech Debt",
    quality: "Quality / Reliability",
    risk: "Risk / Security",
};

const THEME_KEYS_BY_LABEL = Object.fromEntries(
    Object.entries(THEME_LABELS).map(([key, label]) => [label.toLowerCase(), key])
) as Record<string, string>;

const normalizeThemeKey = (value: string | null) => {
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

const formatSubcategoryLabel = (value: string, includeTheme = true) => {
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

const normalizeUnassignedLabel = (value: string, group?: string) => {
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

const isUnassignedLabel = (value: string) => value.toLowerCase().includes("unassigned");

const buildOptionalTimeRangeLabel = (start?: string, end?: string) => {
    if (!start || !end) return null;
    const startLabel = formatTimestamp(start);
    const endLabel = formatTimestamp(end);
    if (startLabel === "Unavailable" || endLabel === "Unavailable") {
        return null;
    }
    return `${startLabel} – ${endLabel}`;
};

const computeSankeyMetrics = (nodes: SankeyNode[], links: SankeyLink[]) => {
    const incomingTotals = new Map<string, number>();
    const outgoingTotals = new Map<string, number>();
    const nodeValueByName = new Map<string, number>();

    links.forEach((link) => {
        outgoingTotals.set(link.source, (outgoingTotals.get(link.source) ?? 0) + link.value);
        incomingTotals.set(link.target, (incomingTotals.get(link.target) ?? 0) + link.value);
    });

    nodes.forEach((node) => {
        const incoming = incomingTotals.get(node.name) ?? 0;
        const outgoing = outgoingTotals.get(node.name) ?? 0;
        nodeValueByName.set(node.name, Math.max(incoming, outgoing));
    });

    const rootTotal = nodes.reduce((total, node) => {
        const incoming = incomingTotals.get(node.name) ?? 0;
        if (incoming === 0) {
            return total + (outgoingTotals.get(node.name) ?? 0);
        }
        return total;
    }, 0);

    const totalFlow =
        rootTotal > 0
            ? rootTotal
            : links.reduce((total, link) => total + link.value, 0);

    return { incomingTotals, outgoingTotals, nodeValueByName, totalFlow };
};

const limitRepoNodes = (
    nodes: SankeyNode[],
    links: SankeyLink[],
    topN: number
) => {
    const repoNodes = nodes.filter((node) => node.group === "repo");
    if (repoNodes.length <= topN) {
        return { nodes, links };
    }

    const groupByName = new Map(nodes.map((node) => [node.name, node.group]));
    const repoTotals = new Map<string, number>();
    links.forEach((link) => {
        if (groupByName.get(link.target) !== "repo") {
            return;
        }
        const sourceGroup = groupByName.get(link.source);
        if (sourceGroup !== "category" && sourceGroup !== "subcategory") {
            return;
        }
        repoTotals.set(link.target, (repoTotals.get(link.target) ?? 0) + link.value);
    });

    const orderedRepos = repoNodes
        .map((node) => node.name)
        .sort((a, b) => {
            const aValue = repoTotals.get(a) ?? 0;
            const bValue = repoTotals.get(b) ?? 0;
            if (bValue !== aValue) {
                return bValue - aValue;
            }
            return a.localeCompare(b);
        });
    const topRepos = orderedRepos.slice(0, topN);
    const keepRepos = new Set(topRepos);
    const hasOther = repoNodes.length > topN;

    const linkTotals = new Map<string, number>();
    links.forEach((link) => {
        let source = link.source;
        let target = link.target;
        if (groupByName.get(target) === "repo" && !keepRepos.has(target)) {
            target = OTHER_REPOS_LABEL;
        }
        if (groupByName.get(source) === "repo" && !keepRepos.has(source)) {
            source = OTHER_REPOS_LABEL;
        }
        const key = `${source}|||${target}`;
        linkTotals.set(key, (linkTotals.get(key) ?? 0) + link.value);
    });

    const repoNodeByName = new Map(repoNodes.map((node) => [node.name, node]));
    const nonRepoNodes = nodes.filter((node) => node.group !== "repo");
    const orderedRepoNodes = topRepos
        .map((name) => repoNodeByName.get(name))
        .filter((node): node is SankeyNode => Boolean(node));

    if (hasOther && !repoNodeByName.has(OTHER_REPOS_LABEL)) {
        orderedRepoNodes.push({ name: OTHER_REPOS_LABEL, group: "repo" });
    }

    const limitedNodes = [...nonRepoNodes, ...orderedRepoNodes];
    const nodeNames = new Set(limitedNodes.map((node) => node.name));
    const limitedLinks = Array.from(linkTotals, ([key, value]) => {
        const [source, target] = key.split("|||");
        return { source, target, value };
    }).filter((link) => nodeNames.has(link.source) && nodeNames.has(link.target));

    return { nodes: limitedNodes, links: limitedLinks };
};

const buildRepoTeamSankey = (
    units: WorkUnitInvestment[],
    repoTeamMap: Record<string, string>,
    categoryColorMap: Map<string, string>
) => {
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
            addNode(sourceLabel, "subcategory", sourceColor);
            repoTargets.forEach((repoId) => {
                const repoLabel = normalizeUnassignedLabel(
                    repoId === UNASSIGNED_REPO_LABEL ? UNASSIGNED_REPO_LABEL : repoId.replace(/^repo:/, ""),
                    "repo"
                );
                const mappedTeam = repoId === UNASSIGNED_REPO_LABEL ? null : repoTeamMap[repoId];
                const teamTargets = mappedTeam
                    ? [normalizeUnassignedLabel(mappedTeam, "team")]
                    : uniqueTeams.length
                        ? uniqueTeams
                        : [UNASSIGNED_TEAM_LABEL];
                const teamShare = 1 / teamTargets.length;
                const value = effortValue * weight * repoShare;

                addNode(repoLabel, "repo");
                addLink(sourceLabel, repoLabel, value);

                teamTargets.forEach((teamLabel) => {
                    addNode(teamLabel, "team");
                    addLink(repoLabel, teamLabel, value * teamShare);
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

const filterSankeyToTeam = (
    flow: SankeyResponse | null,
    teamName: string | null
) => {
    if (!flow || !teamName) {
        return flow;
    }
    const hasTeamNode = flow.nodes.some(
        (node) => node.group === "team" && node.name === teamName
    );
    if (!hasTeamNode) {
        return flow;
    }
    const adjacency = new Map<string, string[]>();
    flow.links.forEach((link) => {
        const targets = adjacency.get(link.source) ?? [];
        targets.push(link.target);
        adjacency.set(link.source, targets);
    });
    const allowed = new Set<string>([teamName]);
    const queue = [teamName];
    while (queue.length) {
        const current = queue.shift();
        if (!current) {
            continue;
        }
        const targets = adjacency.get(current) ?? [];
        targets.forEach((target) => {
            if (!allowed.has(target)) {
                allowed.add(target);
                queue.push(target);
            }
        });
    }
    return {
        ...flow,
        nodes: flow.nodes.filter((node) => allowed.has(node.name)),
        links: flow.links.filter(
            (link) => allowed.has(link.source) && allowed.has(link.target)
        ),
    };
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const formatBandLabel = (band: WorkUnitInvestment["evidence_quality"]["band"]) =>
    titleCase((band ?? "").replace("_", " "));

const formatQuality = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });

const formatEffortUnit = (metric: WorkUnitInvestment["effort"]["metric"]) =>
    metric === "active_hours" ? "hours" : "loc";

const formatWorkUnitLabel = (unit: WorkUnitInvestment) => {
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

const formatWorkUnitTypeLabel = (unit: WorkUnitInvestment) => {
    const primary = typeof unit.work_unit_type === "string" ? unit.work_unit_type.trim() : "";
    const fallback = typeof unit.item_type === "string" ? unit.item_type.trim() : "";
    const value = primary || fallback;
    if (!value) return "";
    return titleCase(value.replace(/_/g, " "));
};

const formatWorkUnitIdToken = (workUnitId: string) => {
    if (!workUnitId) return "";
    const trimmed = workUnitId.trim();
    if (trimmed.length <= 14) {
        return trimmed;
    }
    return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
};

const adjustHex = (hex: string, amount: number) => {
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


const buildTimeRangeLabel = (start?: string, end?: string) => {
    const startLabel = formatTimestamp(start ?? null);
    const endLabel = formatTimestamp(end ?? null);
    return `${startLabel} – ${endLabel}`;
};

const getBaselineFilters = (filters: MetricFilter): MetricFilter => {
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

export function InvestmentView({ filters }: InvestmentViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();
    const useSampleData = process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const [categorizationMode, setCategorizationMode] = useState<CategorizationMode>("text_metadata");
    const [workUnits, setWorkUnits] = useState<WorkUnitInvestment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [investmentMix, setInvestmentMix] = useState<InvestmentMixAggregate | null>(null);
    const [isMixLoading, setIsMixLoading] = useState(true);
    const [mixChartType, setMixChartType] = useState<TreemapSunburstType>("treemap");
    const [treemapSelection, setTreemapSelection] = useState<TreemapSelection | null>(null);
    const [mixExplanation, setMixExplanation] = useState<{
        data: InvestmentMixExplanation | null;
        filtersKey: string;
        focus: { theme: string | null; subcategory: string | null };
    }>({
        data: null,
        filtersKey: "",
        focus: { theme: null, subcategory: null },
    });
    const [focusTheme, setFocusTheme] = useState<string | null>(null);
    const [focusSubcategory, setFocusSubcategory] = useState<string | null>(null);
    const [explanation, setExplanation] = useState<WorkUnitExplanation | null>(null);
    const [isExplaining, setIsExplaining] = useState(false);
    const [isExplainingMix, setIsExplainingMix] = useState(false);
    const [teamCategoryFlow, setTeamCategoryFlow] = useState<SankeyResponse | null>(null);
    const [baselineSankeyFlow, setBaselineSankeyFlow] = useState<SankeyResponse | null>(null);
    const [isCategoryFlowLoading, setIsCategoryFlowLoading] = useState(true);
    const [repoTeamFlow, setRepoTeamFlow] = useState<SankeyResponse | null>(null);
    const [isRepoTeamLoading, setIsRepoTeamLoading] = useState(false);
    const [repoTeamFlowFailed, setRepoTeamFlowFailed] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [focusedTeam, setFocusedTeam] = useState<string | null>(null);
    const showSubcategories = Boolean(selectedCategory);
    const selectedThemeKey = useMemo(
        () => normalizeThemeKey(selectedCategory),
        [selectedCategory]
    );

    const sankeyFilters = useMemo(() => {
        if (!focusedTeam) return filters;
        return {
            ...filters,
            scope: { level: "team" as const, ids: [focusedTeam] },
        };
    }, [filters, focusedTeam]);

    const includeTextual = categorizationMode === "text_metadata";
    const selectedId = searchParams.get("work_unit_id");

    useEffect(() => {
        if (!focusTheme) {
            setFocusSubcategory(null);
        }
    }, [focusTheme]);

    const requestKey = useMemo(
        () => JSON.stringify({ filters, includeTextual }),
        [filters, includeTextual]
    );

    const mixRequestKey = useMemo(() => JSON.stringify({ filters }), [filters]);
    const mixExplainKey = useMemo(() => JSON.stringify({ filters }), [filters]);

    useEffect(() => {
        setTreemapSelection(null);
    }, [mixRequestKey]);

    useEffect(() => {
        let active = true;

        const fetchMix = async () => {
            setIsMixLoading(true);
            if (useSampleData) {
                if (active) {
                    setInvestmentMix(investmentMixSample);
                    setIsMixLoading(false);
                }
                return;
            }

            try {
                const data = await getInvestment(filters);
                if (active) {
                    setInvestmentMix(normalizeInvestmentMix(data));
                }
            } catch {
                if (active) {
                    setInvestmentMix(null);
                }
            } finally {
                if (active) {
                    setIsMixLoading(false);
                }
            }
        };

        fetchMix();
        return () => {
            active = false;
        };
    }, [filters, mixRequestKey, useSampleData]);

    const regenerateMixExplanation = useCallback(async () => {
        setIsExplainingMix(true);
        try {
            const payload = await explainInvestmentMix({
                filters,
                theme: focusTheme,
                subcategory: focusSubcategory,
            });
            setMixExplanation({
                data: payload,
                filtersKey: mixExplainKey,
                focus: { theme: focusTheme, subcategory: focusSubcategory },
            });
        } catch {
            setMixExplanation((current) => ({
                ...current,
                data: null,
                filtersKey: mixExplainKey,
                focus: { theme: focusTheme, subcategory: focusSubcategory },
            }));
        } finally {
            setIsExplainingMix(false);
        }
    }, [filters, focusSubcategory, focusTheme, mixExplainKey]);

    useEffect(() => {
        let active = true;

        const fetchExplanation = async () => {
            if (useSampleData) {
                if (active) {
                    setMixExplanation({
                        data: {
                            summary: "This view suggests effort leans toward a small number of dominant themes, with subcategories providing the specific intent behind that allocation.",
                            top_findings: [
                                {
                                    finding: "Subcategory distribution appears concentrated in the leading theme families.",
                                    evidence: {
                                        theme: Object.keys(investmentMixSample.theme_distribution)[0] || "Unknown",
                                        share_pct: 40,
                                        evidence_quality_band: "moderate",
                                    },
                                },
                                {
                                    finding: "Repo scope destinations are derived from connected work-unit evidence only.",
                                    evidence: { theme: "Cross-cutting", share_pct: 15 },
                                },
                            ],
                            confidence: {
                                level: "moderate",
                                drivers: ["high_uncertainty_spread"],
                                band_mix: { moderate: 0.6, low: 0.4 },
                            },
                            what_to_check_next: [
                                {
                                    action: "Review low-confidence units",
                                    why: "Evidence quality bands indicate uncertainty varies.",
                                    where: "Work Unit drill-down",
                                },
                            ],
                            anti_claims: [
                                "This does not measure individual performance.",
                                "This is not a code quality assessment.",
                            ],
                        },
                        filtersKey: mixExplainKey,
                        focus: { theme: null, subcategory: null },
                    });
                }
                return;
            }

            try {
                const payload = await explainInvestmentMix({
                    filters,
                    theme: null,
                    subcategory: null,
                });
                if (active) {
                    setMixExplanation({
                        data: payload,
                        filtersKey: mixExplainKey,
                        focus: { theme: null, subcategory: null },
                    });
                }
            } catch {
                if (active) {
                    setMixExplanation({
                        data: null,
                        filtersKey: mixExplainKey,
                        focus: { theme: null, subcategory: null },
                    });
                }
            }
        };

        if (mixExplanation.filtersKey === mixExplainKey) {
            return;
        }

        fetchExplanation();
        return () => {
            active = false;
        };
    }, [filters, mixExplainKey, mixExplanation.filtersKey, useSampleData]);

    useEffect(() => {
        let active = true;

        const fetchUnits = async () => {
            setIsLoading(true);
            if (useSampleData) {
                if (active) {
                    setWorkUnits(workUnitInvestmentsSample);
                    setIsLoading(false);
                }
                return;
            }

            try {
                const data = await getWorkUnits({
                    filters,
                    include_textual: includeTextual,
                    limit: 200,
                });
                if (active) {
                    setWorkUnits(Array.isArray(data) ? data : []);
                }
            } catch {
                if (active) {
                    setWorkUnits([]);
                }
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };

        fetchUnits();
        return () => {
            active = false;
        };
    }, [filters, includeTextual, requestKey, useSampleData]);

    useEffect(() => {
        let active = true;

        const fetchTeamCategoryFlow = async () => {
            setIsCategoryFlowLoading(true);
            if (useSampleData) {
                if (active) {
                    setTeamCategoryFlow(null);
                    setBaselineSankeyFlow(null);
                    setIsCategoryFlowLoading(false);
                }
                return;
            }

            try {
                const baselineFilters = getBaselineFilters(sankeyFilters);
                const [current, baseline] = await Promise.all([
                    getInvestmentFlow({
                        filters: sankeyFilters,
                        flow_mode: showSubcategories ? "team_category_subcategory_repo" : "team_category_repo",
                        theme: selectedThemeKey,
                        top_n_repos: TOP_N_REPOS,
                    }),
                    getInvestmentFlow({
                        filters: baselineFilters,
                        flow_mode: showSubcategories ? "team_category_subcategory_repo" : "team_category_repo",
                        theme: selectedThemeKey,
                        top_n_repos: TOP_N_REPOS,
                    }),
                ]);

                if (active) {
                    setTeamCategoryFlow(current);
                    setBaselineSankeyFlow(baseline);
                }
            } catch {
                if (active) {
                    setTeamCategoryFlow(null);
                    setBaselineSankeyFlow(null);
                }
            } finally {
                if (active) {
                    setIsCategoryFlowLoading(false);
                }
            }
        };

        fetchTeamCategoryFlow();
        return () => {
            active = false;
        };
    }, [filters, useSampleData, selectedThemeKey, focusedTeam, showSubcategories]);



    useEffect(() => {
        let active = true;

        const fetchRepoTeamFlow = async () => {
            if (useSampleData) {
                if (active) {
                    setRepoTeamFlow(null);
                    setRepoTeamFlowFailed(false);
                }
                return;
            }
            setIsRepoTeamLoading(true);
            setRepoTeamFlowFailed(false);
            try {
                const flow = await getInvestmentRepoTeamFlow({ filters: sankeyFilters });
                if (active) {
                    setRepoTeamFlow(flow);
                }
            } catch {
                if (active) {
                    setRepoTeamFlow(null);
                    setRepoTeamFlowFailed(true);
                }
            } finally {
                if (active) {
                    setIsRepoTeamLoading(false);
                }
            }
        };

        fetchRepoTeamFlow();
        return () => {
            active = false;
        };
    }, [filters, useSampleData]);

    const selectedUnit = useMemo(() => {
        if (!selectedId) return null;
        return workUnits.find((unit) => unit.work_unit_id === selectedId) ?? null;
    }, [selectedId, workUnits]);

    const selectedUnitTypeLabel = useMemo(() => {
        if (!selectedUnit) return "";
        return formatWorkUnitTypeLabel(selectedUnit);
    }, [selectedUnit]);

    useEffect(() => {
        if (!selectedId || !selectedUnit) {
            setExplanation(null);
            return;
        }

        let active = true;
        const fetchExplanation = async () => {
            setIsExplaining(true);
            try {
                const data = await getWorkUnitExplanation({
                    workUnitId: selectedId,
                    filters,
                });
                if (active) {
                    setExplanation(data);
                }
            } catch (err) {
                console.error("Failed to fetch explanation:", err);
                if (active) {
                    setExplanation(null);
                }
            } finally {
                if (active) {
                    setIsExplaining(false);
                }
            }
        };

        fetchExplanation();
        return () => {
            active = false;
        };
    }, [selectedId, selectedUnit, filters]);

    const allSubcategoryIds = useMemo(() => {
        const ids = new Set<string>();
        workUnits.forEach((unit) => {
            Object.keys(unit.investment?.subcategories ?? {}).forEach((key) => ids.add(key));
        });
        return Array.from(ids).sort();
    }, [workUnits]);

    const themeColorMap = useMemo(() => {
        const map = new Map<string, string>();
        if (!investmentMix) return map;
        const themes = getSortedThemes(investmentMix);
        themes.forEach((theme, index) => {
            map.set(theme.key, chartColors[index % chartColors.length]);
        });
        return map;
    }, [investmentMix, chartColors]);

    const categoryColorMap = useMemo(() => {
        const map = new Map<string, string>();
        if (!investmentMix) return map;
        const themes = getSortedThemes(investmentMix);
        const subcategories = getSortedSubcategories(investmentMix);

        themes.forEach((theme, index) => {
            const baseColor = chartColors[index % chartColors.length];
            map.set(theme.key, baseColor);

            const subs = subcategories.filter((s) => s.themeKey === theme.key);
            subs.forEach((sub, subIdx) => {
                map.set(sub.key, adjustHex(baseColor, 18 + (subIdx % 3) * 10));
            });
        });
        return map;
    }, [investmentMix, chartColors]);

    const resolveSubcategoryIdForColor = useCallback(
        (label: string) => {
            const normalized = label.trim().toLowerCase();
            if (!normalized) {
                return null;
            }
            return (
                allSubcategoryIds.find((id) => {
                    const [themeKey] = id.split(".", 1);
                    if (selectedThemeKey && themeKey !== selectedThemeKey) {
                        return false;
                    }
                    const withTheme = formatSubcategoryLabel(id, true).toLowerCase();
                    const withoutTheme = formatSubcategoryLabel(id, false).toLowerCase();
                    return withTheme === normalized || withoutTheme === normalized;
                }) ?? null
            );
        },
        [allSubcategoryIds, selectedThemeKey]
    );

    const applySankeyNodeColor = useCallback(
        (node: SankeyNode) => {
            if (node.itemStyle?.color) {
                return node;
            }
            if (node.group === "category") {
                const themeKey = normalizeThemeKey(node.name);
                const color = themeKey ? themeColorMap.get(themeKey) : undefined;
                if (color) {
                    return { ...node, itemStyle: { ...node.itemStyle, color } };
                }
            }
            if (node.group === "subcategory") {
                const subId = resolveSubcategoryIdForColor(node.name);
                const color = subId ? categoryColorMap.get(subId) : undefined;
                if (color) {
                    return { ...node, itemStyle: { ...node.itemStyle, color } };
                }
            }
            return node;
        },
        [categoryColorMap, resolveSubcategoryIdForColor, themeColorMap]
    );

    const prepareSankeyFlow = useCallback(
        (flow: SankeyResponse | null, topN: number) => {
            if (!flow) {
                return null;
            }

            const groupByOriginalName = new Map<string, string | undefined>();
            flow.nodes.forEach((node) => {
                groupByOriginalName.set(node.name, node.group);
            });
            const normalizeName = (name: string, group?: string) =>
                normalizeUnassignedLabel(name, group ?? groupByOriginalName.get(name));

            const nodeMap = new Map<string, SankeyNode>();
            flow.nodes.forEach((node) => {
                const normalizedName = normalizeName(node.name, node.group);
                const coloredNode = applySankeyNodeColor({ ...node, name: normalizedName });
                const existing = nodeMap.get(normalizedName);
                if (!existing) {
                    nodeMap.set(normalizedName, coloredNode);
                    return;
                }
                nodeMap.set(normalizedName, {
                    ...existing,
                    group: existing.group ?? coloredNode.group,
                    itemStyle: existing.itemStyle?.color ? existing.itemStyle : coloredNode.itemStyle,
                });
            });

            const linkTotals = new Map<string, number>();
            flow.links.forEach((link) => {
                if (!Number.isFinite(link.value) || link.value <= 0) {
                    return;
                }
                const source = normalizeName(link.source, groupByOriginalName.get(link.source));
                const target = normalizeName(link.target, groupByOriginalName.get(link.target));
                const key = `${source}|||${target}`;
                linkTotals.set(key, (linkTotals.get(key) ?? 0) + link.value);
                if (!nodeMap.has(source)) {
                    nodeMap.set(source, {
                        name: source,
                        group: groupByOriginalName.get(link.source),
                    });
                }
                if (!nodeMap.has(target)) {
                    nodeMap.set(target, {
                        name: target,
                        group: groupByOriginalName.get(link.target),
                    });
                }
            });

            let nodes = Array.from(nodeMap.values());
            let links = Array.from(linkTotals, ([key, value]) => {
                const [source, target] = key.split("|||");
                return { source, target, value };
            });

            if (topN > 0) {
                const limited = limitRepoNodes(nodes, links, topN);
                nodes = limited.nodes;
                links = limited.links;
            }

            const metrics = computeSankeyMetrics(nodes, links);
            nodes = nodes.map((node) => ({
                ...node,
                value: metrics.nodeValueByName.get(node.name) ?? node.value,
            }));

            return { ...flow, nodes, links };
        },
        [applySankeyNodeColor]
    );

    const mixThemes = useMemo(() => (investmentMix ? getSortedThemes(investmentMix) : []), [investmentMix]);
    const mixSubcategories = useMemo(
        () => (investmentMix ? getSortedSubcategories(investmentMix) : []),
        [investmentMix]
    );
    const mixTotalValue = useMemo(
        () => mixThemes.reduce((sum, entry) => sum + entry.value, 0),
        [mixThemes]
    );
    const focusedThemeTotalValue = useMemo(() => {
        if (!focusTheme || !investmentMix) return 0;
        return investmentMix.theme_distribution[focusTheme] ?? 0;
    }, [focusTheme, investmentMix]);
    const focusedThemeSubcategories = useMemo(() => {
        if (!focusTheme) return [];
        return mixSubcategories.filter((entry) => entry.themeKey === focusTheme);
    }, [focusTheme, mixSubcategories]);

    const handleThemeClick = useCallback((themeKey: string) => {
        setFocusTheme((current) => (current === themeKey ? null : themeKey));
    }, []);

    const handleSubcategoryClick = useCallback((subcategoryKey: string) => {
        const [themeKey] = subcategoryKey.split(".", 1);
        setFocusTheme(themeKey || null);
        setFocusSubcategory(subcategoryKey);
    }, []);

    const handleTreemapSelection = useCallback((node: {
        name: string;
        value: number;
        path: string[];
        percent: number;
        data?: TreemapNode;
    }) => {
        const nodeData = node.data as (TreemapNode & {
            nodeType?: "theme" | "subcategory";
            themeKey?: string;
            categoryId?: string;
            categoryLabel?: string;
        }) | undefined;

        const nodeType = nodeData?.nodeType === "subcategory" ? "subcategory" : "theme";
        const categoryId = nodeData?.categoryId ?? null;
        const themeKey = nodeData?.themeKey ?? (categoryId ? categoryId.split(".", 1)[0] : null);
        const themeLabel = themeKey ? titleCase(themeKey) : (node.path[0] ?? node.name);
        const subcategoryLabel = nodeType === "subcategory"
            ? (nodeData?.categoryLabel ?? node.name)
            : undefined;
        const selectionKey = nodeType === "subcategory"
            ? `subcategory:${categoryId ?? node.name}`
            : `theme:${themeKey ?? node.name}`;

        setTreemapSelection((current) => {
            if (current?.key === selectionKey) {
                return null;
            }
            return {
                key: selectionKey,
                type: nodeType,
                themeLabel,
                themeKey,
                subcategoryLabel,
                subcategoryId: categoryId,
            };
        });
    }, []);

    const clearTreemapSelection = useCallback(() => {
        setTreemapSelection(null);
    }, []);

    const focusTreemapTheme = useCallback(() => {
        setTreemapSelection((current) => {
            if (!current || current.type !== "subcategory") {
                return current;
            }
            const themeKey = current.themeKey ?? current.themeLabel;
            return {
                key: `theme:${themeKey}`,
                type: "theme",
                themeLabel: current.themeLabel,
                themeKey: current.themeKey,
            };
        });
    }, []);
    const treemapData = useMemo<TreemapNode>(() => {
        if (!investmentMix) {
            return { name: "Investment", value: 0, children: [] };
        }

        const themes = getSortedThemes(investmentMix);
        const subcategories = getSortedSubcategories(investmentMix);
        const qualityDist = investmentMix.evidence_quality_distribution ?? {};

        const children = themes.map((theme) => {
            const themeLabel = titleCase(theme.key);
            const baseColor = themeColorMap.get(theme.key) ?? chartTheme.grid;
            const themeOpacity = qualityDist[theme.key];

            const themeSubcategories = subcategories
                .filter((sub) => sub.themeKey === theme.key)
                .map((sub, idx) => {
                    const subLabel = formatSubcategoryLabel(sub.key, false);
                    const subFullLabel = formatSubcategoryLabel(sub.key, true);
                    const subOpacity = qualityDist[sub.key];

                    return {
                        name: subLabel,
                        value: sub.value,
                        itemStyle: {
                            color: adjustHex(baseColor, 18 + (idx % 3) * 10),
                            opacity: typeof subOpacity === "number" ? clamp(subOpacity) : undefined,
                        },
                        nodeType: "subcategory",
                        categoryId: sub.key,
                        categoryLabel: subLabel,
                        categoryFullLabel: subFullLabel,
                        qualityValue: subOpacity,
                    } as TreemapNode;
                });

            return {
                name: themeLabel,
                value: theme.value,
                itemStyle: {
                    color: baseColor,
                    opacity: typeof themeOpacity === "number" ? clamp(themeOpacity) : undefined,
                },
                nodeType: "theme",
                themeKey: theme.key,
                children: themeSubcategories.length ? themeSubcategories : undefined,
            } as TreemapNode;
        });

        return {
            name: "Investment",
            value: mixTotalValue,
            children,
        };
    }, [
        investmentMix,
        mixTotalValue,
        themeColorMap,
        chartTheme.grid,
    ]);

    const rawSankeyFlow = useMemo(
        () => filterSankeyToTeam(teamCategoryFlow, focusedTeam),
        [teamCategoryFlow, focusedTeam]
    );
    const rawBaselineFlow = useMemo(
        () => filterSankeyToTeam(baselineSankeyFlow, focusedTeam),
        [baselineSankeyFlow, focusedTeam]
    );
    const sankeyFlow = useMemo(
        () => prepareSankeyFlow(rawSankeyFlow, TOP_N_REPOS),
        [rawSankeyFlow, prepareSankeyFlow]
    );
    const baselineFlow = useMemo(
        () => prepareSankeyFlow(rawBaselineFlow, TOP_N_REPOS),
        [rawBaselineFlow, prepareSankeyFlow]
    );
    const isSankeyLoading = isCategoryFlowLoading;

    const sankeyMetrics = useMemo(
        () => (sankeyFlow ? computeSankeyMetrics(sankeyFlow.nodes, sankeyFlow.links) : null),
        [sankeyFlow]
    );
    const baselineMetrics = useMemo(
        () => (baselineFlow ? computeSankeyMetrics(baselineFlow.nodes, baselineFlow.links) : null),
        [baselineFlow]
    );

    const currentSankeyTotal = sankeyMetrics?.totalFlow ?? 0;
    const baselineSankeyTotal = baselineMetrics?.totalFlow ?? 0;

    const sankeyNodeMap = useMemo(() => {
        const map = new Map<string, SankeyNode>();
        (sankeyFlow?.nodes ?? []).forEach((node) => map.set(node.name, node));
        return map;
    }, [sankeyFlow]);

    const showBaselineDelta = !selectedCategory && baselineSankeyTotal > 0;

    const sankeyCoverage = useMemo(() => {
        const coverage = sankeyFlow?.coverage;
        return {
            team: coverage?.team ?? sankeyFlow?.team_coverage ?? 0,
            repo: coverage?.repo ?? sankeyFlow?.repo_coverage ?? 0,
        };
    }, [sankeyFlow]);

    const categoryShareSummary = useMemo(() => {
        if (!sankeyFlow || !sankeyFlow.links.length) return [];
        const targetGroup = showSubcategories ? "subcategory" : "category";
        const groupNames = new Set(
            sankeyFlow.nodes
                .filter((node) => node.group === targetGroup)
                .map((node) => node.name)
        );
        if (!groupNames.size) return [];
        const totals = new Map<string, number>();
        let total = 0;
        sankeyFlow.links.forEach((link) => {
            if (!groupNames.has(link.target)) return;
            totals.set(link.target, (totals.get(link.target) ?? 0) + link.value);
            total += link.value;
        });
        if (total === 0) {
            sankeyFlow.links.forEach((link) => {
                if (!groupNames.has(link.source)) return;
                totals.set(link.source, (totals.get(link.source) ?? 0) + link.value);
                total += link.value;
            });
        }
        return Array.from(totals.entries())
            .map(([name, value]) => ({
                name,
                value,
                share: total > 0 ? (value / total) * 100 : 0,
            }))
            .sort((a, b) => b.value - a.value);
    }, [sankeyFlow, showSubcategories]);

    const isSingleTeamScope = filters.scope.level === "team" && filters.scope.ids.length === 1;
    const summaryLimit = showSubcategories ? 3 : isSingleTeamScope ? 1 : 3;
    const topCategorySummary = useMemo(
        () => categoryShareSummary.slice(0, summaryLimit),
        [categoryShareSummary, summaryLimit]
    );
    const topSummaryLabel = showSubcategories
        ? "Top subcategories:"
        : isSingleTeamScope
            ? "Top theme:"
            : "Top themes:";

    const rawRepoTeamSankey = useMemo(() => {
        if (repoTeamFlow) {
            const hasTeams = repoTeamFlow.nodes.some((node) => node.group === "team");
            return { ...repoTeamFlow, hasTeamAssociations: hasTeams };
        }
        if (!useSampleData && !repoTeamFlowFailed) {
            return null;
        }
        const units = useSampleData ? workUnitInvestmentsSample : workUnits;
        if (!units.length) {
            return null;
        }
        const repoTeamMap = useSampleData ? investmentRepoTeamMapSample : {};
        return buildRepoTeamSankey(units, repoTeamMap, categoryColorMap);
    }, [repoTeamFlow, useSampleData, repoTeamFlowFailed, workUnits, categoryColorMap]);
    const repoTeamSankey = useMemo(
        () => prepareSankeyFlow(rawRepoTeamSankey, TOP_N_REPOS),
        [prepareSankeyFlow, rawRepoTeamSankey]
    );
    const repoTeamLinks = repoTeamSankey?.links ?? [];
    const repoTeamNodes = repoTeamSankey?.nodes ?? [];
    const repoTeamHasTeams = rawRepoTeamSankey?.hasTeamAssociations ?? false;

    const evidenceUnits = useMemo<EvidenceUnit[]>(() => {
        if (!focusSubcategory) return [];
        return workUnits
            .map((unit) => {
                const weight = unit.investment?.subcategories?.[focusSubcategory] ?? 0;
                if (weight <= 0) {
                    return null;
                }
                return {
                    unit,
                    weight,
                    weightedEffort: unit.effort.value * weight,
                };
            })
            .filter((entry): entry is EvidenceUnit => Boolean(entry))
            .sort((a, b) => b.weightedEffort - a.weightedEffort);
    }, [workUnits, focusSubcategory]);

    const selectableUnits = useMemo(
        () => (focusSubcategory ? evidenceUnits.map((entry) => entry.unit) : workUnits),
        [evidenceUnits, focusSubcategory, workUnits]
    );


    const handleSelect = useCallback(
        (workUnitId: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("work_unit_id", workUnitId);
            router.replace(`/work?${params.toString()}`);
        },
        [router, searchParams]
    );

    const handleTeamFocus = useCallback(
        (teamName: string) => {
            if (!teamName || teamName === UNASSIGNED_TEAM_LABEL) {
                return;
            }
            setSelectedCategory(null);
            setFocusSubcategory(null);
            setFocusedTeam(teamName);
        },
        []
    );

    const handleCategoryFocus = useCallback((categoryName: string) => {
        if (!categoryName || isUnassignedLabel(categoryName)) {
            return;
        }
        setFocusSubcategory(null);
        setSelectedCategory((current) => (current === categoryName ? null : categoryName));
    }, []);

    const resolveSubcategoryIdFromLabel = useCallback(
        (label: string) => {
            const normalized = label.trim().toLowerCase();
            if (!normalized) {
                return null;
            }
            const includeTheme = !selectedThemeKey;
            return (
                allSubcategoryIds.find((id) => {
                    const [themeKey] = id.split(".", 1);
                    if (selectedThemeKey && themeKey !== selectedThemeKey) {
                        return false;
                    }
                    const formatted = formatSubcategoryLabel(id, includeTheme);
                    return formatted.toLowerCase() === normalized;
                }) ?? null
            );
        },
        [allSubcategoryIds, selectedThemeKey]
    );

    const treemapLabelFormatter = useCallback(
        (params: unknown, totalValue: number) => {
            if (!params || typeof params !== "object") return "";
            const entry = params as { data?: { name?: string; value?: number; nodeType?: string } };
            const nodeData = entry.data ?? {};
            const name = typeof nodeData.name === "string" ? nodeData.name : "";
            const value = typeof nodeData.value === "number" ? nodeData.value : 0;
            const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
            if (!name || pct < 2) return "";
            return `${name}\n${pct.toFixed(0)}%`;
        },
        []
    );


    const buildSankeyTooltipFormatter = useCallback(
        (context: {
            nodeMap: Map<string, SankeyNode>;
            metrics: ReturnType<typeof computeSankeyMetrics> | null;
            baselineFlow?: SankeyResponse | null;
            baselineMetrics?: ReturnType<typeof computeSankeyMetrics> | null;
            timeRange: MetricFilter["time"];
            showBaselineDelta?: boolean;
        }) => {
            return (params: unknown, unit: string) => {
                if (!params || typeof params !== "object" || !context.metrics) return "";
                const entry = params as {
                    dataType?: string;
                    data?: {
                        name?: string;
                        value?: number;
                        source?: string;
                        target?: string;
                    };
                    name?: string;
                };
                const data = entry.data ?? {};
                const isEdge = entry.dataType === "edge";
                const nodeName = data.name ?? entry.name ?? "";
                const currentValue = typeof data.value === "number" ? data.value : 0;
                const nodeValue = context.metrics.nodeValueByName.get(nodeName) ?? currentValue;
                const resolvedValue = isEdge ? currentValue : nodeValue;
                const shareRatio =
                    context.metrics.totalFlow > 0 ? resolvedValue / context.metrics.totalFlow : null;
                const clampedShare =
                    shareRatio === null
                        ? null
                        : Math.min(1, Math.max(0, shareRatio));
                const timeLabel = buildOptionalTimeRangeLabel(
                    context.timeRange.start_date,
                    context.timeRange.end_date
                );

                const groupLabel = (name?: string) => {
                    const group = name ? context.nodeMap.get(name)?.group : undefined;
                    if (group === "team") return "Team";
                    if (group === "category") return "Theme";
                    if (group === "subcategory") return "Subcategory";
                    if (group === "repo") return "Repo";
                    return "";
                };

                const typeBadge = (name: string) => {
                    const type = groupLabel(name);
                    if (!type) return "";
                    return `<span style="margin-left: 6px; padding: 2px 6px; border-radius: 999px; background: ${chartTheme.grid}; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: ${chartTheme.text};">${type}</span>`;
                };

                const unassignedLine = (name: string) => {
                    if (name === UNASSIGNED_TEAM_LABEL) {
                        return "Missing team attribution in source data";
                    }
                    if (name === UNASSIGNED_REPO_LABEL) {
                        return "Missing repo association in source data";
                    }
                    return "";
                };

                let deltaHtml = "";
                if (
                    context.showBaselineDelta &&
                    context.baselineFlow &&
                    context.baselineMetrics &&
                    clampedShare !== null
                ) {
                    let baselineValue = 0;
                    if (isEdge) {
                        const baseLink = context.baselineFlow.links.find(
                            (l) => l.source === data.source && l.target === data.target
                        );
                        baselineValue = baseLink?.value ?? 0;
                    } else {
                        baselineValue = context.baselineMetrics.nodeValueByName.get(nodeName) ?? 0;
                    }
                    const baselineRatio =
                        context.baselineMetrics.totalFlow > 0
                            ? baselineValue / context.baselineMetrics.totalFlow
                            : null;
                    const baselineShare = baselineRatio === null
                        ? null
                        : Math.min(1, Math.max(0, baselineRatio));
                    if (baselineShare !== null) {
                        const delta = clampedShare - baselineShare;
                        const deltaSign = delta > 0 ? "↑ +" : delta < 0 ? "↓ " : "";
                        const deltaColor =
                            delta > 0 ? chartTheme.accent2 : delta < 0 ? chartTheme.accent1 : chartTheme.muted;

                        deltaHtml = `
                            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${chartTheme.grid}; font-size: 11px;">
                                <div><span style="color: ${chartTheme.muted}">Current allocation share:</span> ${(clampedShare * 100).toFixed(1)}%</div>
                                <div><span style="color: ${chartTheme.muted}">Baseline allocation share:</span> ${(baselineShare * 100).toFixed(1)}%</div>
                                <div style="font-weight: 600; color: ${deltaColor};">
                                    Delta: ${deltaSign}${(delta * 100).toFixed(1)}%
                                </div>
                                <div style="margin-top: 6px; font-size: 10px; color: ${chartTheme.muted}; font-style: italic; line-height: 1.3;">
                                    Delta reflects change in allocation share vs the prior window. It does not indicate cause, impact, or priority.
                                </div>
                            </div>
                        `;
                    }
                }

                if (isEdge) {
                    const lines = [
                        `<strong>Allocated:</strong> ${formatNumber(currentValue)} ${unit}`,
                        `<strong>From:</strong> ${data.source ?? ""}${groupLabel(data.source) ? ` (${groupLabel(data.source)})` : ""}`,
                        `<strong>To:</strong> ${data.target ?? ""}${groupLabel(data.target) ? ` (${groupLabel(data.target)})` : ""}`,
                    ];
                    if (timeLabel) {
                        lines.push(`<strong>Window:</strong> ${timeLabel}`);
                    }
                    const edgeUnassigned = unassignedLine(data.source ?? "") || unassignedLine(data.target ?? "");
                    if (edgeUnassigned) {
                        lines.push(`<span style="color: ${chartTheme.muted}; font-size: 10px;">${edgeUnassigned}</span>`);
                    }
                    const meaning = `<div style="margin-top: 8px; font-size: 10px; color: ${chartTheme.muted};">
                        Attribution under current filters (not dependency or causation).
                    </div>`;
                    return `<div style="padding: 4px;">${lines.join("<br/>")}${deltaHtml}${meaning}</div>`;
                }

                const lines = [`<strong>Total allocated:</strong> ${formatNumber(nodeValue)} ${unit}`];
                if (clampedShare !== null) {
                    lines.push(`<strong>Share:</strong> ${(clampedShare * 100).toFixed(1)}%`);
                }
                if (timeLabel) {
                    lines.push(`<strong>Window:</strong> ${timeLabel}`);
                }
                const nodeUnassigned = unassignedLine(nodeName);
                if (nodeUnassigned) {
                    lines.push(`<span style="color: ${chartTheme.muted}; font-size: 10px;">${nodeUnassigned}</span>`);
                }
                const meaning = `<div style="margin-top: 8px; font-size: 10px; color: ${chartTheme.muted};">
                    Attribution under current filters (not dependency or causation).
                </div>`;
                return `<div style="padding: 4px;"><div style="font-weight: 600;">${nodeName}${typeBadge(
                    nodeName
                )}</div><div style="margin-top: 6px;">${lines.join("<br/>")}</div>${deltaHtml}${meaning}</div>`;
            };
        },
        [chartTheme.accent1, chartTheme.accent2, chartTheme.grid, chartTheme.muted, chartTheme.text]
    );

    const repoTeamNodeMap = useMemo(() => {
        const map = new Map<string, SankeyNode>();
        (repoTeamSankey?.nodes ?? []).forEach((node) => map.set(node.name, node));
        return map;
    }, [repoTeamSankey]);
    const repoTeamMetrics = useMemo(
        () => (repoTeamSankey ? computeSankeyMetrics(repoTeamSankey.nodes, repoTeamSankey.links) : null),
        [repoTeamSankey]
    );
    const sankeyTooltipFormatter = useMemo(
        () =>
            buildSankeyTooltipFormatter({
                nodeMap: sankeyNodeMap,
                metrics: sankeyMetrics,
                baselineFlow,
                baselineMetrics,
                timeRange: filters.time,
                showBaselineDelta,
            }),
        [
            baselineFlow,
            baselineMetrics,
            buildSankeyTooltipFormatter,
            filters.time,
            sankeyMetrics,
            sankeyNodeMap,
            showBaselineDelta,
        ]
    );
    const repoTeamTooltipFormatter = useMemo(
        () =>
            buildSankeyTooltipFormatter({
                nodeMap: repoTeamNodeMap,
                metrics: repoTeamMetrics,
                timeRange: filters.time,
            }),
        [buildSankeyTooltipFormatter, filters.time, repoTeamMetrics, repoTeamNodeMap]
    );

    const formatTreemapTooltip = useCallback(
        (params: unknown, _totalValue: number, unitLabel: string) => {
            if (!params || typeof params !== "object") return "";
            const entry = params as {
                data?: Record<string, unknown>;
                treePathInfo?: Array<{ name: string }>;
            };
            const data = entry.data ?? {};
            const treePath = entry.treePathInfo ?? [];

            // Path: Investment -> Theme -> Subcategory
            const pathSegments = treePath.slice(1).map(p => p.name);
            const title = pathSegments.join(" · ");
            if (!title) return "";

            const value = typeof data.value === "number" ? data.value : 0;
            const qualityValue = typeof data.qualityValue === "number" ? data.qualityValue : null;
            const qualityLabel = qualityValue !== null ? formatQuality(qualityValue) : "Unknown";
            const effortUnitLabel = unitLabel;

            const qualityExtra = qualityValue !== null
                ? `Avg evidence quality: ${qualityLabel}<br/><div style="margin-top: 6px; font-size: 11px; opacity: 0.8;">Evidence quality reflects average across contributing units.</div>`
                : `<div style="opacity: 0.7;">Evidence quality: Unknown<br/>Insufficient evidence to compute quality.</div>`;

            return buildTooltipHtml({
                title,
                value,
                unit: effortUnitLabel,
                percent: calcPercent(value, mixTotalValue),
                mutedColor: chartTheme.muted,
                accentColor: chartTheme.accent2,
                extra: qualityExtra
            });
        },
        [chartTheme.muted, chartTheme.accent2, mixTotalValue]
    );


    const effortUnit = useMemo(() => {
        const metrics = new Set(workUnits.map((unit) => unit.effort.metric));
        if (metrics.size === 1) {
            const metric = metrics.values().next().value ?? "churn_loc";
            return formatEffortUnit(metric);
        }
        return "effort";
    }, [workUnits]);

    const categoryScopeLabel = focusTheme ? "Subcategory" : "Theme";
    const focusSubcategoryLabel = focusSubcategory
        ? formatSubcategoryLabel(focusSubcategory, true)
        : "";

    const selectedUnitId = useMemo(() => {
        if (!selectedUnit) return "";
        return selectableUnits.some((unit) => unit.work_unit_id === selectedUnit.work_unit_id)
            ? selectedUnit.work_unit_id
            : "";
    }, [selectableUnits, selectedUnit]);

    return (
        <section className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="font-(--font-display) text-xl">Work Unit Investment</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        These views surface probabilistic investment themes and subcategories inferred from connected work units.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <ChartTypeToggle
                        options={CATEGORIZATION_OPTIONS}
                        value={categorizationMode}
                        onChange={setCategorizationMode}
                        className="flex-wrap"
                    />
                    <a
                        href="#work-unit-calculation"
                        className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                    >
                        How this was calculated
                    </a>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-4">
                    <summary className="cursor-pointer list-none font-(--font-display) text-base">
                        What this investment view represents
                    </summary>
                    <div className="mt-2">
                        <p className="text-sm text-(--ink-muted)">
                            These views show investment intent inferred from connected work activity across issues, pull requests, commits, and files.
                        </p>
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            Investment reflects how work appears to be aimed, based on text-first intent plus structural and contextual corroboration.
                            It is not a label, a verdict, or an assessment of people.
                        </p>
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            Because real work is messy, investment views are shown with evidence quality and uncertainty rather than as fixed categories.
                        </p>
                        <ul className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                            <li>Investment describes effort allocation, not individual performance.</li>
                            <li>Categories are probabilistic, not exclusive. Work can span multiple categories at once.</li>
                            <li>Evidence quality reflects corroboration strength, not correctness.</li>
                            <li>Low evidence quality indicates mixed or incomplete evidence, not bad data.</li>
                        </ul>
                        <p className="mt-3 text-xs text-(--ink-muted)">
                            These views do not assign intent, measure productivity, or evaluate individuals.
                        </p>
                    </div>
                </details>
                <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-4">
                    <summary className="cursor-pointer list-none font-(--font-display) text-base">
                        How to read the visuals
                    </summary>
                    <div className="mt-2">
                        <ul className="space-y-2 text-sm text-(--ink-muted)">
                            <li>Size represents effort associated with a theme or subcategory.</li>
                            <li>Color indicates which theme or subcategory the work leans toward.</li>
                            <li>Opacity represents evidence quality for the interpretation.</li>
                            <li>Flows show how effort appears to move from teams into themes and repos.</li>
                            <li>Use the investment mix chart to drill from themes into subcategories and evidence.</li>
                        </ul>
                    </div>
                </details>
            </div>

            <details open className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <summary className="cursor-pointer list-none font-(--font-display) text-lg">
                    What this investment mix indicates
                </summary>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-(--ink-muted)">
                        {mixExplanation.focus.subcategory
                            ? `Focused: ${formatSubcategoryLabel(mixExplanation.focus.subcategory, true)}`
                            : mixExplanation.focus.theme
                                ? `Focused: ${titleCase(mixExplanation.focus.theme)}`
                                : "Focused: All themes"}
                    </div>
                    <button
                        type="button"
                        onClick={regenerateMixExplanation}
                        disabled={isExplainingMix}
                        className="rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted) disabled:opacity-50"
                    >
                        {isExplainingMix ? "Generating…" : "Regenerate explanation"}
                    </button>
                </div>
                <div className="mt-4 space-y-4">
                    {!mixExplanation.data || mixExplanation.filtersKey !== mixExplainKey ? (
                        <p className="text-sm text-(--ink-muted)">
                            {mixExplanation.filtersKey === mixExplainKey
                                ? "Explanation unavailable for this window."
                                : "Generating investment explanation…"}
                        </p>
                    ) : (
                        <>
                            {/* Summary */}
                            <p className="text-sm text-foreground">{mixExplanation.data.summary}</p>

                            {/* Top Findings */}
                            {(mixExplanation.data.top_findings?.length ?? 0) > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Findings</p>
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {mixExplanation.data.top_findings.slice(0, 3).map((finding, idx) => (
                                            <div
                                                key={idx}
                                                className="rounded-lg border border-(--card-stroke) bg-background/50 p-3"
                                            >
                                                <p className="text-sm">{finding.finding}</p>
                                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-(--ink-muted)">
                                                    <span className="rounded-full bg-(--card-stroke)/50 px-2 py-0.5">
                                                        {finding.evidence.theme}
                                                    </span>
                                                    <span>{finding.evidence.share_pct}%</span>
                                                    {finding.evidence.evidence_quality_band && (
                                                        <span className="opacity-70">
                                                            Quality: {finding.evidence.evidence_quality_band}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Confidence Block */}
                            <div className="rounded-lg border border-(--card-stroke) bg-background/30 p-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Confidence</span>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${mixExplanation.data.confidence?.level === "high"
                                            ? "bg-emerald-500/20 text-emerald-600"
                                            : mixExplanation.data.confidence?.level === "moderate"
                                                ? "bg-amber-500/20 text-amber-600"
                                                : mixExplanation.data.confidence?.level === "low"
                                                    ? "bg-red-500/20 text-red-600"
                                                    : "bg-gray-500/20 text-gray-500"
                                            }`}
                                    >
                                        {mixExplanation.data.confidence?.level ?? "unknown"}
                                    </span>
                                    {mixExplanation.data.confidence?.quality_mean != null && (
                                        <span className="text-[10px] text-(--ink-muted)">
                                            Mean: {(mixExplanation.data.confidence.quality_mean * 100).toFixed(0)}%
                                            {mixExplanation.data.confidence.quality_stddev != null &&
                                                ` ± ${(mixExplanation.data.confidence.quality_stddev * 100).toFixed(0)}%`}
                                        </span>
                                    )}
                                </div>
                                {(mixExplanation.data.confidence?.drivers?.length ?? 0) > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {(mixExplanation.data.confidence?.drivers ?? []).map((driver, idx) => (
                                            <span
                                                key={idx}
                                                className="rounded-full bg-(--card-stroke)/50 px-2 py-0.5 text-[10px] text-(--ink-muted)"
                                                title={
                                                    driver === "low_text_signal"
                                                        ? "Short descriptions lack categorization signals"
                                                        : driver === "weak_cross_links"
                                                            ? "Few issue↔PR↔commit links detected"
                                                            : driver === "missing_evidence_metadata"
                                                                ? "Over 30% of units have unknown quality"
                                                                : driver === "high_uncertainty_spread"
                                                                    ? "Quality varies significantly across units"
                                                                    : driver
                                                }
                                            >
                                                {driver.replace(/_/g, " ")}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* What to check next */}
                            {(mixExplanation.data.what_to_check_next?.length ?? 0) > 0 && (
                                <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">What to check next</p>
                                    <ul className="mt-2 space-y-2">
                                        {mixExplanation.data.what_to_check_next.slice(0, 3).map((action, idx) => (
                                            <li key={idx} className="text-sm">
                                                <span className="font-medium">{action.action}</span>
                                                <span className="text-(--ink-muted)"> — {action.why}</span>
                                                <span className="block text-[11px] text-(--ink-muted) opacity-70">
                                                    {action.where}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Anti-claims (collapsible) */}
                            {(mixExplanation.data.anti_claims?.length ?? 0) > 0 && (
                                <details className="text-xs text-(--ink-muted)">
                                    <summary className="cursor-pointer">What this does NOT say</summary>
                                    <ul className="mt-2 list-disc space-y-1 pl-5">
                                        {mixExplanation.data.anti_claims.map((claim, idx) => (
                                            <li key={idx}>{claim}</li>
                                        ))}
                                    </ul>
                                </details>
                            )}

                            {/* Status indicator for invalid outputs */}
                            {mixExplanation.data.status && mixExplanation.data.status !== "valid" && (
                                <p className="text-[10px] italic text-(--ink-muted)">
                                    ⚠ Fallback explanation shown ({mixExplanation.data.status})
                                </p>
                            )}
                        </>
                    )}
                </div>
            </details>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3">
                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Evidence quality bands</span>
                {EVIDENCE_QUALITY_BANDS.map((band) => (
                    <div key={band.id} className="flex items-center gap-2 text-xs text-(--ink-muted)">
                        <span
                            className={`h-2.5 w-2.5 rounded-full ${band.opacityClass}`}
                            style={{ backgroundColor: chartTheme.accent2 }}
                        />
                        <span>{band.label}</span>
                    </div>
                ))}
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 className="font-(--font-display) text-lg">
                            {mixChartType === "treemap" ? "Treemap" : "Investment mix"}
                        </h3>
                        <span className="text-xs text-(--ink-muted)">
                            {mixChartType === "treemap"
                                ? `Effort size · Evidence quality opacity · ${categoryScopeLabel} view`
                                : "Theme → Subcategory (depth 2)"}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {mixChartType === "sunburst" && focusTheme && (
                            <button
                                type="button"
                                onClick={() => setFocusTheme(null)}
                                className="rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                            >
                                Clear theme
                            </button>
                        )}
                        <ChartTypeToggle
                            options={TREEMAP_SUNBURST_OPTIONS}
                            value={mixChartType}
                            onChange={setMixChartType}
                        />
                    </div>
                </div>
                <div className="mt-4">
                    {mixChartType === "treemap" ? (
                        <>
                            <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
                                <button
                                    type="button"
                                    onClick={treemapSelection ? clearTreemapSelection : undefined}
                                    className={`rounded-full px-2 py-0.5 text-[11px] ${treemapSelection
                                        ? "text-(--accent-2) hover:underline"
                                        : "bg-(--card-stroke) text-foreground"
                                        }`}
                                >
                                    All themes
                                </button>
                                {treemapSelection && (
                                    <>
                                        <span className="text-(--ink-muted)">/</span>
                                        {treemapSelection.type === "subcategory" ? (
                                            <button
                                                type="button"
                                                onClick={focusTreemapTheme}
                                                className="rounded-full px-2 py-0.5 text-[11px] text-(--accent-2) hover:underline"
                                            >
                                                {treemapSelection.themeLabel}
                                            </button>
                                        ) : (
                                            <span className="rounded-full bg-(--card-stroke) px-2 py-0.5 text-[11px] text-foreground">
                                                {treemapSelection.themeLabel}
                                            </span>
                                        )}
                                        {treemapSelection.type === "subcategory" && treemapSelection.subcategoryLabel && (
                                            <>
                                                <span className="text-(--ink-muted)">/</span>
                                                <span className="rounded-full bg-(--card-stroke) px-2 py-0.5 text-[11px] text-foreground">
                                                    {treemapSelection.subcategoryLabel}
                                                </span>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                            {isLoading ? (
                                <p className="text-sm text-(--ink-muted)">Loading work units…</p>
                            ) : workUnits.length === 0 ? (
                                <p className="text-sm text-(--ink-muted)">No work unit investments available.</p>
                            ) : (
                                <TreemapChart
                                    data={treemapData}
                                    unit={effortUnit}
                                    height={360}
                                    useInputColors
                                    showBreadcrumb={false}
                                    tooltipFormatter={formatTreemapTooltip}
                                    labelFormatter={treemapLabelFormatter}
                                    onNodeClick={handleTreemapSelection}
                                />
                            )}
                        </>
                    ) : isMixLoading ? (
                        <p className="text-sm text-(--ink-muted)">Loading investment mix…</p>
                    ) : !investmentMix || mixThemes.length === 0 ? (
                        <p className="text-sm text-(--ink-muted)">No investment mix available.</p>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:items-start">
                            <InvestmentMixSunburst
                                themeDistribution={investmentMix.theme_distribution}
                                subcategoryDistribution={investmentMix.subcategory_distribution}
                                evidenceQualityDistribution={investmentMix.evidence_quality_distribution}
                                unit={investmentMix.unit ?? effortUnit}
                                height={360}
                                focusedTheme={focusTheme}
                                onThemeClick={handleThemeClick}
                                onSubcategoryClick={handleSubcategoryClick}
                            />
                            <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                                        {focusTheme ? "Subcategory breakdown" : "Themes"}
                                    </p>
                                    {focusTheme && (
                                        <span className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                                            {titleCase(focusTheme)}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3 space-y-2 text-sm">
                                    {focusTheme ? (
                                        focusedThemeSubcategories.length ? (
                                            focusedThemeSubcategories.map((entry) => {
                                                const pctOfTheme = focusedThemeTotalValue
                                                    ? (entry.value / focusedThemeTotalValue) * 100
                                                    : 0;
                                                return (
                                                    <button
                                                        key={entry.key}
                                                        type="button"
                                                        onClick={() => handleSubcategoryClick(entry.key)}
                                                        className="flex w-full items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-3 py-2 text-left transition hover:border-(--accent-2)"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm text-foreground">
                                                                {formatSubcategoryLabel(entry.key, false)}
                                                            </div>
                                                            <div className="mt-1 text-xs text-(--ink-muted)">
                                                                {formatNumber(entry.value)} {investmentMix.unit ?? effortUnit}
                                                            </div>
                                                            <div className="text-xs text-(--accent-2)">
                                                                {formatNumber(pctOfTheme, { maximumFractionDigits: 1 })}% of theme
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <p className="text-sm text-(--ink-muted)">
                                                No subcategories observed for this theme.
                                            </p>
                                        )
                                    ) : (
                                        mixThemes.slice(0, 8).map((entry) => {
                                            const pct = mixTotalValue ? (entry.value / mixTotalValue) * 100 : 0;
                                            return (
                                                <button
                                                    key={entry.key}
                                                    type="button"
                                                    onClick={() => handleThemeClick(entry.key)}
                                                    className="flex w-full items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-3 py-2 text-left transition hover:border-(--accent-2)"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm text-foreground">{titleCase(entry.key)}</div>
                                                        <div className="mt-1 text-xs text-(--ink-muted)">
                                                            {formatNumber(entry.value)} {investmentMix.unit ?? effortUnit}
                                                        </div>
                                                        <div className="text-xs text-(--accent-2)">
                                                            {formatNumber(pct, { maximumFractionDigits: 1 })}% of total
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                            <h3 className="font-(--font-display) text-lg">Team burden flow</h3>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-(--ink-muted)">
                                <span>Team coverage: <strong className="text-(--ink)">{formatNumber(sankeyCoverage.team * 100)}%</strong></span>
                                <span>Repo coverage: <strong className="text-(--ink)">{formatNumber(sankeyCoverage.repo * 100)}%</strong></span>
                            </div>
                        </div>
                        <p className="mt-1 text-xs text-(--ink-muted)">
                            {showSubcategories
                                ? "Team → Theme → Subcategory → Repo"
                                : "Team → Theme → Repo"
                            }
                        </p>

                        {(focusedTeam || selectedCategory) && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {focusedTeam && (
                                    <button
                                        type="button"
                                        onClick={() => setFocusedTeam(null)}
                                        className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                                    >
                                        Drilldown: Team = {focusedTeam}
                                        <span className="text-xs">×</span>
                                    </button>
                                )}
                                {selectedCategory && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedCategory(null);
                                            setFocusSubcategory(null);
                                        }}
                                        className="inline-flex items-center gap-2 rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                                    >
                                        Drilldown: Theme = {selectedCategory}
                                        <span className="text-xs">×</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col items-start gap-2 text-xs text-(--ink-muted)">
                        {selectedCategory && (
                            <span>Theme focus: <strong className="text-(--ink)">{selectedCategory}</strong></span>
                        )}
                        {topCategorySummary.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span>{topSummaryLabel}</span>
                                {topCategorySummary.map((entry) => (
                                    <span key={entry.name} className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[10px]">
                                        {entry.name} {entry.share.toFixed(0)}%
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="mt-2 mb-4 text-[11px] text-(--ink-muted) leading-relaxed border-l-2 border-(--card-stroke) pl-3 py-1">
                    This view shows where effort appears to land across teams, themes, and repos for the selected window.
                    Allocation reflects attribution, not dependency or impact.
                </div>
                <div className="mt-0">
                    {isSankeyLoading ? (
                        <p className="text-sm text-(--ink-muted)">Loading flow data…</p>
                    ) : !sankeyFlow || !sankeyFlow.links.length ? (
                        <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-center text-sm text-(--ink-muted)">
                            No team burden flow available for this scope and window.
                        </div>
                    ) : (
                        <SankeyChart
                            nodes={sankeyFlow.nodes}
                            links={sankeyFlow.links}
                            unit={effortUnit}
                            height={320}
                            tooltipFormatter={sankeyTooltipFormatter}
                            onItemClick={(item) => {
                                if (!sankeyFlow) return;
                                if (item.type === "node") {
                                    const node = sankeyFlow.nodes.find((n) => n.name === item.name);
                                    if (node?.group === "team") {
                                        handleTeamFocus(node.id ?? node.name);
                                        return;
                                    }
                                    if (node?.group === "category") {
                                        handleCategoryFocus(node.name);
                                        return;
                                    }
                                    if (node?.group === "subcategory") {
                                        const subId = resolveSubcategoryIdFromLabel(node.name);
                                        if (subId) {
                                            setFocusSubcategory(subId);
                                        }
                                    }
                                } else if (item.type === "link" && selectedCategory) {
                                    const subId = resolveSubcategoryIdFromLabel(item.source ?? "");
                                    if (subId) {
                                        setFocusSubcategory(subId);
                                    }
                                }
                            }}
                        />
                    )}
                </div>
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="font-(--font-display) text-lg">Where effort lands</h3>
                        <p className="mt-1 text-xs text-(--ink-muted)">Subcategory → Repo → Team</p>
                    </div>
                    <span className="text-xs text-(--ink-muted)">Two-hop allocation to highlight team ownership behind repos.</span>
                </div>
                <div className="mt-2 mb-4 text-[11px] text-(--ink-muted) leading-relaxed border-l-2 border-(--card-stroke) pl-3 py-1">
                    This view uses repo-to-team mapping when available. Missing repo associations flow through an unassigned repo node.
                </div>
                <div className="mt-0">
                    {isRepoTeamLoading && !useSampleData ? (
                        <p className="text-sm text-(--ink-muted)">Loading destination view…</p>
                    ) : repoTeamHasTeams && repoTeamLinks.length ? (
                        <SankeyChart
                            nodes={repoTeamNodes}
                            links={repoTeamLinks}
                            unit={effortUnit}
                            height={320}
                            tooltipFormatter={repoTeamTooltipFormatter}
                            onItemClick={(item) => {
                                if (item.type === "node") {
                                    const link = repoTeamLinks.find(l => l.source === item.name);
                                    if (link) {
                                        const subId = allSubcategoryIds.find(id => formatSubcategoryLabel(id, true) === item.name);
                                        if (subId) setFocusSubcategory(subId);
                                    }
                                } else if (item.type === "link") {
                                    const subId = allSubcategoryIds.find(id => formatSubcategoryLabel(id, true) === item.source);
                                    if (subId) setFocusSubcategory(subId);
                                }
                            }}
                        />
                    ) : (
                        <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-center text-sm text-(--ink-muted)">
                            <div>
                                <p>We currently have no teams associated with work items.</p>
                                <p className="mt-2 text-[11px] text-(--ink-muted)">Investment categories still compute from evidence.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="font-(--font-display) text-lg">Evidence drill-down</h3>
                        <span className="text-xs text-(--ink-muted)">
                            {focusSubcategory
                                ? `Work units that contributed to: ${focusSubcategoryLabel}.`
                                : "Select a subcategory to inspect supporting work units."}
                        </span>
                    </div>
                    {focusSubcategory && (
                        <button
                            type="button"
                            onClick={() => setFocusSubcategory(null)}
                            className="rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                        >
                            Clear subcategory
                        </button>
                    )}
                </div>
                <div className="mt-4">
                    {!focusSubcategory ? (
                        <p className="text-sm text-(--ink-muted)">
                            Drill down into a theme and choose a subcategory to see the work units that support it.
                        </p>
                    ) : evidenceUnits.length === 0 ? (
                        <p className="text-sm text-(--ink-muted)">
                            No work units are currently linked to {focusSubcategoryLabel}.
                        </p>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {evidenceUnits.slice(0, 6).map((entry) => {
                                const hasTextual = (entry.unit.evidence?.textual ?? []).length > 0;
                                const hasContextual = (entry.unit.evidence?.contextual ?? []).length > 0;
                                const hasStructural = (entry.unit.evidence?.structural ?? []).length > 0;
                                const signals: string[] = [];
                                if (hasTextual) signals.push("text");
                                if (hasContextual || hasStructural) signals.push("metadata");
                                const signalsLabel = signals.length
                                    ? `Evidence signals: ${signals.join(" + ")}`
                                    : "Evidence signals: inferred from available inputs";
                                const workUnitLabel = formatWorkUnitLabel(entry.unit);
                                const workUnitTypeLabel = formatWorkUnitTypeLabel(entry.unit);
                                const workUnitIdToken = formatWorkUnitIdToken(entry.unit.work_unit_id);
                                return (
                                    <div
                                        key={entry.unit.work_unit_id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleSelect(entry.unit.work_unit_id)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                handleSelect(entry.unit.work_unit_id);
                                            }
                                        }}
                                        className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4 text-left transition hover:border-(--accent-2)"
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-medium text-foreground">{workUnitLabel}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                                                {workUnitTypeLabel ? (
                                                    <span className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[9px] uppercase tracking-[0.2em]">
                                                        {workUnitTypeLabel}
                                                    </span>
                                                ) : null}
                                                <span>ID: <span className="font-mono text-[11px] tracking-normal text-(--ink)">{workUnitIdToken}</span></span>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void navigator.clipboard?.writeText(entry.unit.work_unit_id);
                                                    }}
                                                    className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[9px] uppercase tracking-[0.2em]"
                                                >
                                                    Copy ID
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mt-3 text-sm">
                                            <span className="text-(--ink-muted)">Weighted effort:</span>{" "}
                                            {formatNumber(entry.weightedEffort)} {effortUnit}
                                        </div>
                                        <div className="mt-1 text-xs text-(--ink-muted)">
                                            Evidence quality: {entry.unit.evidence_quality.value !== null
                                                ? `${formatQuality(entry.unit.evidence_quality.value)} (${formatBandLabel(entry.unit.evidence_quality.band ?? "unknown")})`
                                                : "Unknown"}
                                        </div>
                                        <div className="mt-2 text-[11px] text-(--ink-muted)">
                                            {signalsLabel}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div
                id="work-unit-calculation"
                className="rounded-3xl border border-(--card-stroke) bg-card p-5"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="font-(--font-display) text-lg">How this was calculated</h3>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            This interpretation is text-first, with provider metadata and contextual structure used
                            to corroborate the investment mix. Evidence quality reflects how strongly those inputs
                            align.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)" htmlFor="work-unit-select">
                            Work unit
                        </label>
                        <select
                            id="work-unit-select"
                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs"
                            value={selectedUnitId}
                            onChange={(event) => {
                                if (event.target.value) {
                                    handleSelect(event.target.value);
                                }
                            }}
                        >
                            <option value="" disabled>
                                Select a work unit
                            </option>
                            {selectableUnits.map((unit) => {
                                const label = formatWorkUnitLabel(unit);
                                return (
                                    <option key={unit.work_unit_id} value={unit.work_unit_id}>
                                        {label} — {unit.work_unit_id}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                </div>

                {selectedUnit ? (
                    <div className="mt-6 grid gap-6 lg:grid-cols-3">
                        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Overview</p>
                            <div className="mt-3 space-y-2 text-sm">
                                <div>
                                    <span className="text-(--ink-muted)">Work unit:</span>{" "}
                                    {formatWorkUnitLabel(selectedUnit)}
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-(--ink-muted)">
                                        {selectedUnitTypeLabel ? (
                                            <span className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[9px] uppercase tracking-[0.2em]">
                                                {selectedUnitTypeLabel}
                                            </span>
                                        ) : null}
                                        <span>
                                            ID: <span className="font-mono text-(--ink)">{selectedUnit.work_unit_id}</span>
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-(--ink-muted)">Time range:</span>{" "}
                                    {buildTimeRangeLabel(
                                        selectedUnit.time_range?.start,
                                        selectedUnit.time_range?.end
                                    )}
                                </div>
                                <div>
                                    <span className="text-(--ink-muted)">Effort:</span>{" "}
                                    {formatNumber(selectedUnit.effort.value)} {formatEffortUnit(selectedUnit.effort.metric)}
                                </div>
                                <div>
                                    <span className="text-(--ink-muted)">Evidence quality:</span>{" "}
                                    {selectedUnit.evidence_quality.value !== null
                                        ? `${formatQuality(selectedUnit.evidence_quality.value)} (${formatBandLabel(selectedUnit.evidence_quality.band ?? "unknown")})`
                                        : "Unknown"}
                                </div>
                                {(selectedUnit.evidence?.textual ?? []).length > 0 && (
                                    <div className="text-xs text-(--ink-muted)">
                                        Textual phrases informed the categorization.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Structural evidence</p>
                            <div className="mt-3 space-y-2 text-xs">
                                {(selectedUnit.evidence?.structural ?? []).length === 0 && (
                                    <p className="text-(--ink-muted)">No structural evidence reported.</p>
                                )}
                                {(selectedUnit.evidence?.structural ?? []).map((entry, index) => (
                                    <div key={`structural-${index}`} className="rounded-lg border border-(--card-stroke) bg-card px-3 py-2 font-mono text-[11px]">
                                        {JSON.stringify(entry)}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Contextual evidence</p>
                            <div className="mt-3 space-y-2 text-xs">
                                {(selectedUnit.evidence?.contextual ?? []).length === 0 && (
                                    <p className="text-(--ink-muted)">No contextual evidence reported.</p>
                                )}
                                {(selectedUnit.evidence?.contextual ?? []).map((entry, index) => (
                                    <div key={`contextual-${index}`} className="rounded-lg border border-(--card-stroke) bg-card px-3 py-2 font-mono text-[11px]">
                                        {JSON.stringify(entry)}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4 lg:col-span-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Textual evidence</p>
                            <div className="mt-3 space-y-2 text-xs">
                                {(selectedUnit.evidence?.textual ?? []).length === 0 && (
                                    <p className="text-(--ink-muted)">No textual evidence reported.</p>
                                )}
                                {(selectedUnit.evidence?.textual ?? []).map((entry, index) => (
                                    <div key={`textual-${index}`} className="rounded-lg border border-(--card-stroke) bg-card px-3 py-2 font-mono text-[11px]">
                                        {JSON.stringify(entry)}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {(isExplaining || explanation) && (
                            <div className="lg:col-span-3 mt-4 overflow-hidden rounded-2xl border border-dashed border-(--accent-2) bg-(--accent-2-10)">
                                <div className="flex items-center justify-between border-b border-dashed border-(--accent-2) bg-(--accent-2-15) px-4 py-2">
                                    <div className="flex items-center gap-2">
                                        <div className="rounded bg-(--accent-2) px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                            AI-Generated
                                        </div>
                                        <span className="text-xs font-medium text-(--accent-2)">Investment Explanation</span>
                                    </div>
                                    <span className="text-[10px] text-(--ink-muted)">Phase 3 · Non-Authoritative</span>
                                </div>
                                <div className="p-5">
                                    {isExplaining ? (
                                        <div className="flex items-center gap-2 text-sm text-(--ink-muted)">
                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-(--accent-2) border-t-transparent" />
                                            Generating investment explanation…
                                        </div>
                                    ) : explanation ? (
                                        <div className="space-y-6">
                                            <div>
                                                <h4 className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Summary</h4>
                                                <p className="mt-2 text-sm leading-relaxed">{explanation.summary}</p>
                                            </div>

                                            <div className="grid gap-6 md:grid-cols-2">
                                                <div>
                                                    <h4 className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Reasons</h4>
                                                    <div className="mt-3 space-y-3">
                                                        {Object.entries(explanation.category_rationale).map(([cat, text]) => (
                                                            <div key={cat} className="rounded-lg bg-(--card-70) p-3">
                                                                <span className="text-[10px] font-bold uppercase text-(--accent-2)">{cat}</span>
                                                                <p className="mt-1 text-xs text-(--ink-muted)">{text}</p>
                                                            </div>
                                                        ))}
                                                        {explanation.evidence_highlights.length > 0 && (
                                                            <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-(--ink-muted)">
                                                                {explanation.evidence_highlights.map((highlight, i) => (
                                                                    <li key={i}>{highlight}</li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                </div>

                                                <div>
                                                    <h4 className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">Uncertainty</h4>
                                                    <div className="mt-3 space-y-3">
                                                        <div className="rounded-lg bg-(--card-70) p-3">
                                                            <p className="text-xs text-(--ink-muted)">{explanation.uncertainty_disclosure}</p>
                                                        </div>
                                                        <div className="rounded-lg border border-(--card-stroke) bg-(--card-70) p-3">
                                                            <p className="text-xs font-medium italic text-(--ink-muted)">{explanation.evidence_quality_limits}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="mt-6 text-sm text-(--ink-muted)">
                        Select a work unit from the dropdown to inspect evidence for the current focus.
                    </p>
                )}
            </div>
        </section>
    );
}
