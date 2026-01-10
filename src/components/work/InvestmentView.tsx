"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChartTypeToggle } from "@/components/charts/ChartTypeToggle";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { SunburstChart, type SunburstNode } from "@/components/charts/SunburstChart";
import { TreemapChart, type TreemapNode } from "@/components/charts/TreemapChart";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { workUnitInvestmentsSample } from "@/data/devHealthOpsSample";
import { getWorkUnits, getWorkUnitExplanation } from "@/lib/api";
import { formatNumber, formatTimestamp } from "@/lib/formatters";
import type { MetricFilter, SankeyLink, SankeyNode, WorkUnitInvestment, WorkUnitExplanation } from "@/lib/types";

type InvestmentViewProps = {
    filters: MetricFilter;
};

type CategorizationMode = "text_metadata" | "metadata_only";

type CategorySummary = {
    total: number;
    qualityWeighted: number;
    weightTotal: number;
    hasTextual: boolean;
};

type TreemapAggregate = {
    categoryId: string;
    categoryLabel: string;
    categoryFullLabel: string;
    repoScope?: string;
    value: number;
    qualityWeighted: number;
    weightTotal: number;
    hasTextual: boolean;
    workUnitIds: Set<string>;
};

type SankeyEdgeMeta = {
    avgQuality: number;
    hasTextual: boolean;
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
    { id: "high", label: "High (0.80–1.00)", opacity: 1 },
    { id: "moderate", label: "Moderate (0.60–0.79)", opacity: 0.75 },
    { id: "low", label: "Low (0.40–0.59)", opacity: 0.5 },
    { id: "very_low", label: "Very low (<0.40)", opacity: 0.3 },
] as const;

const titleCase = (value: string) =>
    value
        .replace(/[_-]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

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

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const formatBandLabel = (band: WorkUnitInvestment["evidence_quality"]["band"]) =>
    titleCase(band.replace("_", " "));

const formatQuality = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });

const formatEffortUnit = (metric: WorkUnitInvestment["effort"]["metric"]) =>
    metric === "active_hours" ? "hours" : "loc";

const extractRepoIds = (unit: WorkUnitInvestment) => {
    const entries = unit.evidence?.contextual ?? [];
    for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const typed = entry as { type?: string; repo_ids?: unknown };
        if (typed.type === "repo_scope" && Array.isArray(typed.repo_ids)) {
            return typed.repo_ids.map((repoId) => String(repoId)).filter(Boolean);
        }
    }
    return [] as string[];
};

const buildTimeRangeLabel = (start?: string, end?: string) => {
    const startLabel = formatTimestamp(start ?? null);
    const endLabel = formatTimestamp(end ?? null);
    return `${startLabel} – ${endLabel}`;
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
    const [focusTheme, setFocusTheme] = useState<string | null>(null);
    const [focusSubcategory, setFocusSubcategory] = useState<string | null>(null);
    const [explanation, setExplanation] = useState<WorkUnitExplanation | null>(null);
    const [isExplaining, setIsExplaining] = useState(false);

    const includeTextual = categorizationMode === "text_metadata";
    const selectedId = searchParams.get("work_unit_id");
    const workUnitCount = workUnits.length;
    const treemapIsSparse = workUnitCount > 0 && workUnitCount < 3;

    useEffect(() => {
        if (!focusTheme) {
            setFocusSubcategory(null);
        }
    }, [focusTheme]);

    const requestKey = useMemo(
        () => JSON.stringify({ filters, includeTextual }),
        [filters, includeTextual]
    );

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

    const selectedUnit = useMemo(() => {
        if (!selectedId) return null;
        return workUnits.find((unit) => unit.work_unit_id === selectedId) ?? null;
    }, [selectedId, workUnits]);

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

    const themeIds = useMemo(() => {
        const ids = new Set<string>();
        workUnits.forEach((unit) => {
            Object.keys(unit.investment?.themes ?? {}).forEach((key) => ids.add(key));
        });
        return Array.from(ids).sort();
    }, [workUnits]);

    const subcategoryIds = useMemo(() => {
        if (!focusTheme) return [];
        const ids = new Set<string>();
        const prefix = `${focusTheme}.`;
        workUnits.forEach((unit) => {
            Object.keys(unit.investment?.subcategories ?? {}).forEach((key) => {
                if (key.startsWith(prefix)) {
                    ids.add(key);
                }
            });
        });
        return Array.from(ids).sort();
    }, [workUnits, focusTheme]);

    const categoryIds = useMemo(
        () => (focusTheme ? subcategoryIds : themeIds),
        [focusTheme, subcategoryIds, themeIds]
    );

    const getCategoriesForUnit = useCallback(
        (unit: WorkUnitInvestment) => {
            if (!focusTheme) {
                return unit.investment?.themes ?? {};
            }
            const filtered: Record<string, number> = {};
            const prefix = `${focusTheme}.`;
            const subcategories = unit.investment?.subcategories ?? {};
            Object.entries(subcategories).forEach(([key, value]) => {
                if (key.startsWith(prefix)) {
                    filtered[key] = value;
                }
            });
            return filtered;
        },
        [focusTheme]
    );

    const categoryColorMap = useMemo(() => {
        const map = new Map<string, string>();
        categoryIds.forEach((id, idx) => {
            map.set(id, chartColors[idx % chartColors.length]);
        });
        return map;
    }, [categoryIds, chartColors]);

    const treemapData = useMemo<TreemapNode>(() => {
        const entries = new Map<string, TreemapAggregate>();

        const upsert = (
            key: string,
            payload: {
                categoryId: string;
                categoryLabel: string;
                categoryFullLabel: string;
                repoScope?: string;
                weightedEffort: number;
                qualityValue: number;
                hasTextual: boolean;
                workUnitId: string;
            }
        ) => {
            const entry = entries.get(key) ?? {
                categoryId: payload.categoryId,
                categoryLabel: payload.categoryLabel,
                categoryFullLabel: payload.categoryFullLabel,
                repoScope: payload.repoScope,
                value: 0,
                qualityWeighted: 0,
                weightTotal: 0,
                hasTextual: false,
                workUnitIds: new Set<string>(),
            };

            entry.value += payload.weightedEffort;
            entry.qualityWeighted += payload.qualityValue * payload.weightedEffort;
            entry.weightTotal += payload.weightedEffort;
            entry.hasTextual = entry.hasTextual || payload.hasTextual;
            entry.workUnitIds.add(payload.workUnitId);
            entries.set(key, entry);
        };

        workUnits.forEach((unit) => {
            const categories = getCategoriesForUnit(unit);
            const hasTextual = (unit.evidence?.textual ?? []).length > 0;

            if (treemapIsSparse) {
                Object.entries(categories).forEach(([categoryId, weight]) => {
                    if (typeof weight !== "number" || weight <= 0) {
                        return;
                    }
                    const weightedEffort = unit.effort.value * weight;
                    if (weightedEffort <= 0) {
                        return;
                    }
                    const categoryLabel = focusTheme
                        ? formatSubcategoryLabel(categoryId, false)
                        : titleCase(categoryId);
                    const categoryFullLabel = focusTheme
                        ? formatSubcategoryLabel(categoryId, true)
                        : categoryLabel;
                    upsert(categoryId, {
                        categoryId,
                        categoryLabel,
                        categoryFullLabel,
                        weightedEffort,
                        qualityValue: unit.evidence_quality.value,
                        hasTextual,
                        workUnitId: unit.work_unit_id,
                    });
                });
                return;
            }

            const repoIds = extractRepoIds(unit);
            const repoScopes = repoIds.length ? repoIds : ["unassigned"];
            const repoCount = repoScopes.length || 1;

            Object.entries(categories).forEach(([categoryId, weight]) => {
                if (typeof weight !== "number" || weight <= 0) {
                    return;
                }
                const weightedEffort = unit.effort.value * weight;
                if (weightedEffort <= 0) {
                    return;
                }
                const perRepoEffort = weightedEffort / repoCount;
                const categoryLabel = focusTheme
                    ? formatSubcategoryLabel(categoryId, false)
                    : titleCase(categoryId);
                const categoryFullLabel = focusTheme
                    ? formatSubcategoryLabel(categoryId, true)
                    : categoryLabel;
                repoScopes.forEach((repoScope) => {
                    upsert(`${categoryId}::${repoScope}`, {
                        categoryId,
                        categoryLabel,
                        categoryFullLabel,
                        repoScope,
                        weightedEffort: perRepoEffort,
                        qualityValue: unit.evidence_quality.value,
                        hasTextual,
                        workUnitId: unit.work_unit_id,
                    });
                });
            });
        });

        const children = Array.from(entries.values())
            .map((entry) => {
                const avgQuality = entry.weightTotal
                    ? entry.qualityWeighted / entry.weightTotal
                    : 0;
                const color = categoryColorMap.get(entry.categoryId) ?? chartTheme.grid;
                const label = treemapIsSparse
                    ? entry.categoryLabel
                    : `${entry.categoryLabel} · ${entry.repoScope ?? "unassigned"}`;

                return {
                    name: label,
                    value: entry.value,
                    itemStyle: {
                        color,
                        opacity: clamp(avgQuality),
                    },
                    nodeType: treemapIsSparse ? "category" : "category_repo",
                    categoryId: entry.categoryId,
                    categoryLabel: entry.categoryLabel,
                    categoryFullLabel: entry.categoryFullLabel,
                    repoScope: entry.repoScope,
                    qualityValue: avgQuality,
                    hasTextual: entry.hasTextual,
                    workUnitCount: entry.workUnitIds.size,
                };
            })
            .filter((node) => (node.value ?? 0) > 0);

        const totalValue = children.reduce(
            (sum, child) => sum + (child.value ?? 0),
            0
        );

        return {
            name: "Investment",
            value: totalValue,
            children,
        };
    }, [
        workUnits,
        categoryColorMap,
        chartTheme.grid,
        treemapIsSparse,
        focusTheme,
        getCategoriesForUnit,
    ]);

    const sunburstData = useMemo<SunburstNode>(() => {
        const categorySummaries = new Map<string, CategorySummary>();

        workUnits.forEach((unit) => {
            const categories = getCategoriesForUnit(unit);
            const hasTextual = (unit.evidence?.textual ?? []).length > 0;

            Object.entries(categories).forEach(([categoryId, weight]) => {
                if (typeof weight !== "number" || weight <= 0) {
                    return;
                }
                const weightedEffort = unit.effort.value * weight;
                if (weightedEffort <= 0) {
                    return;
                }
                const entry = categorySummaries.get(categoryId) ?? {
                    total: 0,
                    qualityWeighted: 0,
                    weightTotal: 0,
                    hasTextual: false,
                };
                entry.total += weightedEffort;
                entry.qualityWeighted += unit.evidence_quality.value * weightedEffort;
                entry.weightTotal += weightedEffort;
                entry.hasTextual = entry.hasTextual || hasTextual;
                categorySummaries.set(categoryId, entry);
            });
        });

        const children: SunburstNode[] = [];
        const nodeType = focusTheme ? "subcategory" : "theme";

        categoryIds.forEach((categoryId) => {
            const summary = categorySummaries.get(categoryId);
            if (!summary || summary.total <= 0) {
                return;
            }
            const avgQuality = summary.weightTotal
                ? summary.qualityWeighted / summary.weightTotal
                : 0;
            const color = categoryColorMap.get(categoryId) ?? chartTheme.grid;
            const categoryLabel = focusTheme
                ? formatSubcategoryLabel(categoryId, false)
                : titleCase(categoryId);
            const categoryFullLabel = focusTheme
                ? formatSubcategoryLabel(categoryId, true)
                : categoryLabel;

            children.push({
                name: categoryLabel,
                value: summary.total,
                itemStyle: {
                    color,
                    opacity: clamp(avgQuality),
                },
                nodeType,
                categoryId,
                categoryLabel,
                categoryFullLabel,
                qualityValue: avgQuality,
                hasTextual: summary.hasTextual,
            });
        });

        const totalValue = children.reduce(
            (sum, child) => sum + (child.value ?? 0),
            0
        );

        return {
            name: "Total",
            value: totalValue,
            children,
        };
    }, [
        workUnits,
        categoryIds,
        categoryColorMap,
        chartTheme.grid,
        focusTheme,
        getCategoriesForUnit,
    ]);

    const sankeyData = useMemo(() => {
        const edgeTotals = new Map<
            string,
            {
                source: string;
                target: string;
                value: number;
                qualityWeighted: number;
                weightTotal: number;
                hasTextual: boolean;
                categoryId: string;
            }
        >();
        const categoryStats = new Map<
            string,
            { qualityWeighted: number; weightTotal: number; hasTextual: boolean }
        >();
        const repoStats = new Map<
            string,
            { qualityWeighted: number; weightTotal: number; hasTextual: boolean }
        >();
        const repoSet = new Set<string>();

        workUnits.forEach((unit) => {
            const repoIds = extractRepoIds(unit);
            const normalizedRepos = repoIds.length ? repoIds : ["unassigned"];
            const repoCount = normalizedRepos.length || 1;
            const hasTextual = (unit.evidence?.textual ?? []).length > 0;

            normalizedRepos.forEach((repoId) => repoSet.add(repoId));

            Object.entries(getCategoriesForUnit(unit)).forEach(([categoryId, weight]) => {
                if (typeof weight !== "number" || weight <= 0) {
                    return;
                }
                const weightedEffort = unit.effort.value * weight;
                if (weightedEffort <= 0) {
                    return;
                }
                const perRepoEffort = weightedEffort / repoCount;
                const source = focusTheme
                    ? formatSubcategoryLabel(categoryId, false)
                    : titleCase(categoryId);
                normalizedRepos.forEach((repoId) => {
                    const edgeKey = `${source}::${repoId}`;
                    const entry = edgeTotals.get(edgeKey) ?? {
                        source,
                        target: repoId,
                        value: 0,
                        qualityWeighted: 0,
                        weightTotal: 0,
                        hasTextual: false,
                        categoryId,
                    };
                    entry.value += perRepoEffort;
                    entry.qualityWeighted += unit.evidence_quality.value * perRepoEffort;
                    entry.weightTotal += perRepoEffort;
                    entry.hasTextual = entry.hasTextual || hasTextual;
                    edgeTotals.set(edgeKey, entry);

                    const catEntry = categoryStats.get(categoryId) ?? {
                        qualityWeighted: 0,
                        weightTotal: 0,
                        hasTextual: false,
                    };
                    catEntry.qualityWeighted += unit.evidence_quality.value * perRepoEffort;
                    catEntry.weightTotal += perRepoEffort;
                    catEntry.hasTextual = catEntry.hasTextual || hasTextual;
                    categoryStats.set(categoryId, catEntry);

                    const repoEntry = repoStats.get(repoId) ?? {
                        qualityWeighted: 0,
                        weightTotal: 0,
                        hasTextual: false,
                    };
                    repoEntry.qualityWeighted += unit.evidence_quality.value * perRepoEffort;
                    repoEntry.weightTotal += perRepoEffort;
                    repoEntry.hasTextual = repoEntry.hasTextual || hasTextual;
                    repoStats.set(repoId, repoEntry);
                });
            });
        });

        const nodes: SankeyNode[] = [];
        categoryIds.forEach((categoryId) => {
            const meta = categoryStats.get(categoryId);
            const avgQuality = meta?.weightTotal
                ? meta.qualityWeighted / meta.weightTotal
                : 0;
            const color = categoryColorMap.get(categoryId) ?? chartTheme.grid;
            nodes.push({
                name: focusTheme ? formatSubcategoryLabel(categoryId, false) : titleCase(categoryId),
                group: focusTheme ? "subcategory" : "theme",
                itemStyle: { color, opacity: clamp(avgQuality) },
                qualityValue: avgQuality,
                hasTextual: meta?.hasTextual ?? false,
            });
        });
        repoSet.forEach((repoId) => {
            const meta = repoStats.get(repoId);
            const avgQuality = meta?.weightTotal
                ? meta.qualityWeighted / meta.weightTotal
                : 0;
            nodes.push({
                name: repoId,
                group: "repo",
                itemStyle: { color: chartTheme.grid, opacity: clamp(avgQuality) },
                qualityValue: avgQuality,
                hasTextual: meta?.hasTextual ?? false,
            });
        });

        const links: SankeyLink[] = [];
        const edgeMeta = new Map<string, SankeyEdgeMeta>();
        edgeTotals.forEach((entry) => {
            const avgQuality = entry.weightTotal
                ? entry.qualityWeighted / entry.weightTotal
                : 0;
            const color = categoryColorMap.get(entry.categoryId) ?? chartTheme.grid;
            links.push({
                source: entry.source,
                target: entry.target,
                value: entry.value,
                lineStyle: { color, opacity: clamp(avgQuality) },
            });
            edgeMeta.set(`${entry.source}::${entry.target}`, {
                avgQuality,
                hasTextual: entry.hasTextual,
            });
        });

        return { nodes, links, edgeMeta };
    }, [
        workUnits,
        categoryIds,
        categoryColorMap,
        chartTheme.grid,
        focusTheme,
        getCategoriesForUnit,
    ]);

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

    const treemapLabelFormatter = useCallback(
        (params: unknown, totalValue: number) => {
            if (!params || typeof params !== "object") return "";
            const entry = params as { data?: { name?: string; value?: number } };
            const nodeData = entry.data ?? {};
            const name = typeof nodeData.name === "string" ? nodeData.name : "";
            const value = typeof nodeData.value === "number" ? nodeData.value : 0;
            const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
            if (!name || pct < 3) return "";
            if (treemapIsSparse) {
                return `${name} (${pct.toFixed(0)}%)`;
            }
            return name;
        },
        [treemapIsSparse]
    );

    const formatTreemapTooltip = useCallback(
        (params: unknown, _totalValue: number, unitLabel: string) => {
            if (!params || typeof params !== "object") return "";
            const entry = params as { data?: Record<string, unknown> };
            const data = entry.data ?? {};
            const categoryLabel =
                (data.categoryFullLabel as string) ??
                (data.categoryLabel as string) ??
                (data.name as string) ??
                "";
            if (!categoryLabel) return "";
            const repoScope = typeof data.repoScope === "string" ? data.repoScope : "";
            const weightedEffort = typeof data.value === "number" ? data.value : 0;
            const qualityValue = typeof data.qualityValue === "number" ? data.qualityValue : 0;
            const workUnitCount = typeof data.workUnitCount === "number" ? data.workUnitCount : 0;
            const qualityLabel = formatQuality(qualityValue);
            const effortUnitLabel = unitLabel;
            const qualityDisclosure =
                "<div style=\"margin-top: 6px; font-size: 11px; color: " +
                chartTheme.muted +
                "\">Evidence quality shown reflects an average across contributing work units.</div>";
            const textualNote = data.hasTextual
                ? "<div style=\"margin-top: 6px; color: " +
                chartTheme.muted +
                "\">Textual phrases informed the categorization.</div>"
                : "";
            const title = repoScope ? `${categoryLabel} · ${repoScope}` : categoryLabel;
            const workUnitLine = workUnitCount
                ? `<div><span style="color: ${chartTheme.muted}">Work units:</span> ${workUnitCount}</div>`
                : "";

            return `
        <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
        <div><span style="color: ${chartTheme.muted}">Weighted effort:</span> ${formatNumber(weightedEffort)} ${effortUnitLabel}</div>
        <div><span style="color: ${chartTheme.muted}">Avg evidence quality:</span> ${qualityLabel}</div>
        ${workUnitLine}
        ${qualityDisclosure}
        ${textualNote}
      `;
        },
        [chartTheme.muted]
    );

    const formatSunburstTooltip = useCallback(
        (params: unknown, _totalValue: number, unitLabel: string) => {
            if (!params || typeof params !== "object") return "";
            const entry = params as { data?: Record<string, unknown> };
            const data = entry.data ?? {};
            const categoryLabel =
                (data.categoryFullLabel as string) ??
                (data.categoryLabel as string) ??
                (data.name as string) ??
                "";
            const weightedEffort = typeof data.value === "number" ? data.value : 0;
            const qualityValue = typeof data.qualityValue === "number" ? data.qualityValue : 0;
            const qualityLabel = formatQuality(qualityValue);
            const hasTextual = Boolean(data.hasTextual);
            const textualNote = hasTextual
                ? "<div style=\"margin-top: 6px; color: " +
                chartTheme.muted +
                "\">Textual phrases informed the categorization.</div>"
                : "";
            const qualityDisclosure =
                "<div style=\"margin-top: 6px; font-size: 11px; color: " +
                chartTheme.muted +
                "\">Evidence quality shown reflects an average across contributing work units.</div>";

            return `
        <div style="font-weight: 600; margin-bottom: 4px;">${categoryLabel}</div>
        <div><span style="color: ${chartTheme.muted}">Weighted effort:</span> ${formatNumber(weightedEffort)} ${unitLabel}</div>
        <div><span style="color: ${chartTheme.muted}">Avg evidence quality:</span> ${qualityLabel}</div>
        ${qualityDisclosure}
        ${textualNote}
      `;
        },
        [chartTheme.muted]
    );

    const formatSankeyTooltip = useCallback(
        (params: unknown, unitLabel: string) => {
            if (!params || typeof params !== "object") return "";
            const entry = params as {
                dataType?: string;
                data?: { source?: string; target?: string; value?: number };
            };
            if (entry.dataType !== "edge") return "";
            const data = entry.data ?? {};
            const source = data.source ?? "";
            const target = data.target ?? "";
            const value = typeof data.value === "number" ? data.value : 0;
            const edgeKey = `${source}::${target}`;
            const meta = sankeyData.edgeMeta.get(edgeKey);
            const avgQuality = meta ? meta.avgQuality : 0;
            const textualNote = meta?.hasTextual
                ? "<div style=\"margin-top: 6px; color: " +
                chartTheme.muted +
                "\">Textual phrases informed the categorization.</div>"
                : "";

            return `
        <div style="font-weight: 600; margin-bottom: 4px;">${source} → ${target}</div>
        <div><span style="color: ${chartTheme.muted}">Weighted effort:</span> ${formatNumber(value)} ${unitLabel}</div>
        <div><span style="color: ${chartTheme.muted}">Avg evidence quality:</span> ${formatQuality(avgQuality)}</div>
        <div style="margin-top: 6px; font-size: 11px; color: ${chartTheme.muted};">Evidence quality shown reflects an average across contributing work units.</div>
        ${textualNote}
      `;
        },
        [chartTheme.muted, sankeyData.edgeMeta]
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
                            <li>Flows show how effort appears to move from themes or subcategories into repo scope.</li>
                            <li>Use the focus controls to drill from themes into subcategories and evidence.</li>
                        </ul>
                    </div>
                </details>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3">
                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Investment focus</span>
                <div className="flex items-center gap-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)" htmlFor="theme-focus">
                        Theme
                    </label>
                    <select
                        id="theme-focus"
                        className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs"
                        value={focusTheme ?? ""}
                        onChange={(event) => {
                            const value = event.target.value;
                            setFocusTheme(value || null);
                        }}
                    >
                        <option value="">All themes</option>
                        {themeIds.map((themeId) => (
                            <option key={themeId} value={themeId}>
                                {titleCase(themeId)}
                            </option>
                        ))}
                    </select>
                </div>
                {focusTheme && (
                    <div className="flex items-center gap-2">
                        <label
                            className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                            htmlFor="subcategory-focus"
                        >
                            Subcategory
                        </label>
                        <select
                            id="subcategory-focus"
                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs"
                            value={focusSubcategory ?? ""}
                            onChange={(event) => {
                                const value = event.target.value;
                                setFocusSubcategory(value || null);
                            }}
                        >
                            <option value="">All subcategories</option>
                            {subcategoryIds.map((subcategoryId) => (
                                <option key={subcategoryId} value={subcategoryId}>
                                    {formatSubcategoryLabel(subcategoryId, false)}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                {(focusTheme || focusSubcategory) && (
                    <button
                        type="button"
                        onClick={() => {
                            setFocusTheme(null);
                            setFocusSubcategory(null);
                        }}
                        className="rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                    >
                        Clear focus
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3">
                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Evidence quality bands</span>
                {EVIDENCE_QUALITY_BANDS.map((band) => (
                    <div key={band.id} className="flex items-center gap-2 text-xs text-(--ink-muted)">
                        <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: chartTheme.accent2, opacity: band.opacity }}
                        />
                        <span>{band.label}</span>
                    </div>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-(--font-display) text-lg">Treemap</h3>
                        <span className="text-xs text-(--ink-muted)">
                            Effort size · Evidence quality opacity · {treemapIsSparse ? `${categoryScopeLabel} view` : `${categoryScopeLabel} · repo scope`}
                        </span>
                    </div>
                    <div className="mt-4">
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
                                tooltipFormatter={formatTreemapTooltip}
                                labelFormatter={treemapLabelFormatter}
                            />
                        )}
                    </div>
                </div>

                <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="font-(--font-display) text-lg">Sunburst</h3>
                            <span className="text-xs text-(--ink-muted)">Probability-weighted effort by {categoryScopeLabel.toLowerCase()}</span>
                        </div>
                    </div>
                    <div className="mt-4">
                        {isLoading ? (
                            <p className="text-sm text-(--ink-muted)">Loading work units…</p>
                        ) : workUnits.length === 0 ? (
                            <p className="text-sm text-(--ink-muted)">No work unit investments available.</p>
                        ) : (
                            <SunburstChart
                                data={sunburstData}
                                unit={effortUnit}
                                height={360}
                                useInputColors
                                tooltipFormatter={formatSunburstTooltip}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="flex items-center justify-between">
                    <h3 className="font-(--font-display) text-lg">Sankey</h3>
                    <span className="text-xs text-(--ink-muted)">{categoryScopeLabel} to repo flow</span>
                </div>
                <div className="mt-4">
                    {isLoading ? (
                        <p className="text-sm text-(--ink-muted)">Loading work units…</p>
                    ) : workUnits.length === 0 ? (
                        <p className="text-sm text-(--ink-muted)">No work unit investments available.</p>
                    ) : (
                        <SankeyChart
                            nodes={sankeyData.nodes}
                            links={sankeyData.links}
                            unit={effortUnit}
                            height={320}
                            tooltipFormatter={formatSankeyTooltip}
                        />
                    )}
                </div>
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="font-(--font-display) text-lg">Evidence drill-down</h3>
                        <span className="text-xs text-(--ink-muted)">
                            {focusSubcategory
                                ? `Work units supporting ${focusSubcategoryLabel}.`
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
                                return (
                                    <button
                                        key={entry.unit.work_unit_id}
                                        type="button"
                                        onClick={() => handleSelect(entry.unit.work_unit_id)}
                                        className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4 text-left transition hover:border-(--accent-2)"
                                    >
                                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                                            <span>WorkUnit</span>
                                            <span className="font-mono text-[11px] tracking-normal text-(--ink)">{entry.unit.work_unit_id}</span>
                                        </div>
                                        <div className="mt-3 text-sm">
                                            <span className="text-(--ink-muted)">Weighted effort:</span>{" "}
                                            {formatNumber(entry.weightedEffort)} {effortUnit}
                                        </div>
                                        <div className="mt-1 text-xs text-(--ink-muted)">
                                            Evidence quality: {formatQuality(entry.unit.evidence_quality.value)} (
                                            {formatBandLabel(entry.unit.evidence_quality.band)})
                                        </div>
                                        {hasTextual && (
                                            <div className="mt-2 text-[11px] text-(--ink-muted)">
                                                Textual phrases informed this categorization.
                                            </div>
                                        )}
                                    </button>
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
                            WorkUnit
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
                            {selectableUnits.map((unit) => (
                                <option key={unit.work_unit_id} value={unit.work_unit_id}>
                                    {unit.work_unit_id}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {selectedUnit ? (
                    <div className="mt-6 grid gap-6 lg:grid-cols-3">
                        <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Overview</p>
                            <div className="mt-3 space-y-2 text-sm">
                                <div>
                                    <span className="text-(--ink-muted)">WorkUnit:</span> {selectedUnit.work_unit_id}
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
                                    {formatQuality(selectedUnit.evidence_quality.value)} ({formatBandLabel(selectedUnit.evidence_quality.band)})
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
