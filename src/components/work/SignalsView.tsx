"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChartTypeToggle } from "@/components/charts/ChartTypeToggle";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { SunburstChart, type SunburstNode } from "@/components/charts/SunburstChart";
import { TreemapChart, type TreemapNode } from "@/components/charts/TreemapChart";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { workUnitSignalsSample } from "@/data/devHealthOpsSample";
import { getWorkUnits } from "@/lib/api";
import { formatNumber, formatTimestamp } from "@/lib/formatters";
import type { MetricFilter, SankeyLink, SankeyNode, WorkUnitSignal } from "@/lib/types";

type SignalsViewProps = {
    filters: MetricFilter;
};

type TextualMode = "structural_textual" | "structural_only";

type RepoSummary = {
    repoScope: string;
    total: number;
    confidenceWeighted: number;
    weightTotal: number;
    hasTextual: boolean;
    workUnits: Array<{
        unit: WorkUnitSignal;
        weightedEffort: number;
    }>;
};

type CategorySummary = {
    total: number;
    confidenceWeighted: number;
    weightTotal: number;
    hasTextual: boolean;
    repos: Map<string, RepoSummary>;
};

type TreemapAggregate = {
    categoryId: string;
    categoryLabel: string;
    repoScope?: string;
    value: number;
    confidenceWeighted: number;
    weightTotal: number;
    hasTextual: boolean;
    workUnitIds: Set<string>;
};

type SankeyEdgeMeta = {
    avgConfidence: number;
    hasTextual: boolean;
};

const TEXTUAL_OPTIONS: Array<{ id: TextualMode; label: string }> = [
    { id: "structural_textual", label: "Structural + textual" },
    { id: "structural_only", label: "Structural only" },
];

const CONFIDENCE_BANDS = [
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

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const formatBandLabel = (band: WorkUnitSignal["confidence"]["band"]) =>
    titleCase(band.replace("_", " "));

const formatConfidence = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });

const formatEffortUnit = (metric: WorkUnitSignal["effort"]["metric"]) =>
    metric === "active_hours" ? "hours" : "loc";

const extractRepoIds = (unit: WorkUnitSignal) => {
    const entries = unit.evidence?.structural ?? [];
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

export function SignalsView({ filters }: SignalsViewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();
    const useSampleData = process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const [textualMode, setTextualMode] = useState<TextualMode>("structural_textual");
    const [workUnits, setWorkUnits] = useState<WorkUnitSignal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showWorkUnits, setShowWorkUnits] = useState(false);

    const includeTextual = textualMode === "structural_textual";
    const selectedId = searchParams.get("work_unit_id");
    const workUnitCount = workUnits.length;
    const treemapIsSparse = workUnitCount > 0 && workUnitCount < 3;

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
                    setWorkUnits(workUnitSignalsSample);
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

    const categoryIds = useMemo(() => {
        const ids = new Set<string>();
        workUnits.forEach((unit) => {
            Object.keys(unit.categories ?? {}).forEach((key) => ids.add(key));
        });
        return Array.from(ids).sort();
    }, [workUnits]);

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
                repoScope?: string;
                weightedEffort: number;
                confidenceValue: number;
                hasTextual: boolean;
                workUnitId: string;
            }
        ) => {
            const entry = entries.get(key) ?? {
                categoryId: payload.categoryId,
                categoryLabel: payload.categoryLabel,
                repoScope: payload.repoScope,
                value: 0,
                confidenceWeighted: 0,
                weightTotal: 0,
                hasTextual: false,
                workUnitIds: new Set<string>(),
            };

            entry.value += payload.weightedEffort;
            entry.confidenceWeighted += payload.confidenceValue * payload.weightedEffort;
            entry.weightTotal += payload.weightedEffort;
            entry.hasTextual = entry.hasTextual || payload.hasTextual;
            entry.workUnitIds.add(payload.workUnitId);
            entries.set(key, entry);
        };

        workUnits.forEach((unit) => {
            const categories = unit.categories ?? {};
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
                    upsert(categoryId, {
                        categoryId,
                        categoryLabel: titleCase(categoryId),
                        weightedEffort,
                        confidenceValue: unit.confidence.value,
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
                repoScopes.forEach((repoScope) => {
                    upsert(`${categoryId}::${repoScope}`, {
                        categoryId,
                        categoryLabel: titleCase(categoryId),
                        repoScope,
                        weightedEffort: perRepoEffort,
                        confidenceValue: unit.confidence.value,
                        hasTextual,
                        workUnitId: unit.work_unit_id,
                    });
                });
            });
        });

        const children = Array.from(entries.values())
            .map((entry) => {
                const avgConfidence = entry.weightTotal
                    ? entry.confidenceWeighted / entry.weightTotal
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
                        opacity: clamp(avgConfidence),
                    },
                    nodeType: treemapIsSparse ? "category" : "category_repo",
                    categoryId: entry.categoryId,
                    categoryLabel: entry.categoryLabel,
                    repoScope: entry.repoScope,
                    confidenceValue: avgConfidence,
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
            name: "Signals",
            value: totalValue,
            children,
        };
    }, [workUnits, categoryColorMap, chartTheme.grid, treemapIsSparse]);

    const sunburstData = useMemo<SunburstNode>(() => {
        const categorySummaries = new Map<string, CategorySummary>();

        workUnits.forEach((unit) => {
            const categories = unit.categories ?? {};
            const hasTextual = (unit.evidence?.textual ?? []).length > 0;
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
                const entry = categorySummaries.get(categoryId) ?? {
                    total: 0,
                    confidenceWeighted: 0,
                    weightTotal: 0,
                    hasTextual: false,
                    repos: new Map<string, RepoSummary>(),
                };
                entry.total += weightedEffort;
                entry.confidenceWeighted += unit.confidence.value * weightedEffort;
                entry.weightTotal += weightedEffort;
                entry.hasTextual = entry.hasTextual || hasTextual;

                repoScopes.forEach((repoScope) => {
                    const repoEntry = entry.repos.get(repoScope) ?? {
                        repoScope,
                        total: 0,
                        confidenceWeighted: 0,
                        weightTotal: 0,
                        hasTextual: false,
                        workUnits: [],
                    };
                    repoEntry.total += perRepoEffort;
                    repoEntry.confidenceWeighted += unit.confidence.value * perRepoEffort;
                    repoEntry.weightTotal += perRepoEffort;
                    repoEntry.hasTextual = repoEntry.hasTextual || hasTextual;
                    if (showWorkUnits) {
                        repoEntry.workUnits.push({ unit, weightedEffort: perRepoEffort });
                    }
                    entry.repos.set(repoScope, repoEntry);
                });

                categorySummaries.set(categoryId, entry);
            });
        });

        const children: SunburstNode[] = [];

        categoryIds.forEach((categoryId) => {
            const summary = categorySummaries.get(categoryId);
            if (!summary || summary.total <= 0) {
                return;
            }
            const avgConfidence = summary.weightTotal
                ? summary.confidenceWeighted / summary.weightTotal
                : 0;
            const color = categoryColorMap.get(categoryId) ?? chartTheme.grid;
            const categoryLabel = titleCase(categoryId);

            const repoChildren: SunburstNode[] = [];
            summary.repos.forEach((repoSummary) => {
                if (repoSummary.total <= 0) {
                    return;
                }
                const repoConfidence = repoSummary.weightTotal
                    ? repoSummary.confidenceWeighted / repoSummary.weightTotal
                    : 0;
                const workUnitChildren: SunburstNode[] = showWorkUnits
                    ? repoSummary.workUnits.map(({ unit, weightedEffort }) => ({
                        name: unit.work_unit_id,
                        value: weightedEffort,
                        itemStyle: {
                            color,
                            opacity: clamp(unit.confidence.value),
                        },
                        nodeType: "work_unit",
                        workUnitId: unit.work_unit_id,
                        categoryId,
                        categoryLabel,
                        repoScope: repoSummary.repoScope,
                        confidenceValue: unit.confidence.value,
                        confidenceBand: unit.confidence.band,
                        hasTextual: (unit.evidence?.textual ?? []).length > 0,
                        label: { show: false },
                        emphasis: { label: { show: false } },
                    }))
                    : [];

                repoChildren.push({
                    name: repoSummary.repoScope,
                    value: repoSummary.total,
                    itemStyle: {
                        color,
                        opacity: clamp(repoConfidence),
                    },
                    nodeType: "repo_scope",
                    categoryId,
                    categoryLabel,
                    repoScope: repoSummary.repoScope,
                    confidenceValue: repoConfidence,
                    hasTextual: repoSummary.hasTextual,
                    label: { show: false },
                    emphasis: { label: { show: true } },
                    children: showWorkUnits ? workUnitChildren : undefined,
                });
            });

            children.push({
                name: categoryLabel,
                value: summary.total,
                itemStyle: {
                    color,
                    opacity: clamp(avgConfidence),
                },
                nodeType: "category",
                categoryId,
                categoryLabel,
                confidenceValue: avgConfidence,
                hasTextual: summary.hasTextual,
                children: repoChildren,
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
    }, [workUnits, categoryIds, categoryColorMap, chartTheme.grid, showWorkUnits]);

    const sankeyData = useMemo(() => {
        const edgeTotals = new Map<
            string,
            {
                source: string;
                target: string;
                value: number;
                confidenceWeighted: number;
                weightTotal: number;
                hasTextual: boolean;
                categoryId: string;
            }
        >();
        const categoryStats = new Map<
            string,
            { confidenceWeighted: number; weightTotal: number; hasTextual: boolean }
        >();
        const repoStats = new Map<
            string,
            { confidenceWeighted: number; weightTotal: number; hasTextual: boolean }
        >();
        const repoSet = new Set<string>();

        workUnits.forEach((unit) => {
            const repoIds = extractRepoIds(unit);
            const normalizedRepos = repoIds.length ? repoIds : ["unassigned"];
            const repoCount = normalizedRepos.length || 1;
            const hasTextual = (unit.evidence?.textual ?? []).length > 0;

            normalizedRepos.forEach((repoId) => repoSet.add(repoId));

            Object.entries(unit.categories ?? {}).forEach(([categoryId, weight]) => {
                if (typeof weight !== "number" || weight <= 0) {
                    return;
                }
                const weightedEffort = unit.effort.value * weight;
                if (weightedEffort <= 0) {
                    return;
                }
                const perRepoEffort = weightedEffort / repoCount;
                const source = titleCase(categoryId);
                normalizedRepos.forEach((repoId) => {
                    const edgeKey = `${source}::${repoId}`;
                    const entry = edgeTotals.get(edgeKey) ?? {
                        source,
                        target: repoId,
                        value: 0,
                        confidenceWeighted: 0,
                        weightTotal: 0,
                        hasTextual: false,
                        categoryId,
                    };
                    entry.value += perRepoEffort;
                    entry.confidenceWeighted += unit.confidence.value * perRepoEffort;
                    entry.weightTotal += perRepoEffort;
                    entry.hasTextual = entry.hasTextual || hasTextual;
                    edgeTotals.set(edgeKey, entry);

                    const catEntry = categoryStats.get(categoryId) ?? {
                        confidenceWeighted: 0,
                        weightTotal: 0,
                        hasTextual: false,
                    };
                    catEntry.confidenceWeighted += unit.confidence.value * perRepoEffort;
                    catEntry.weightTotal += perRepoEffort;
                    catEntry.hasTextual = catEntry.hasTextual || hasTextual;
                    categoryStats.set(categoryId, catEntry);

                    const repoEntry = repoStats.get(repoId) ?? {
                        confidenceWeighted: 0,
                        weightTotal: 0,
                        hasTextual: false,
                    };
                    repoEntry.confidenceWeighted += unit.confidence.value * perRepoEffort;
                    repoEntry.weightTotal += perRepoEffort;
                    repoEntry.hasTextual = repoEntry.hasTextual || hasTextual;
                    repoStats.set(repoId, repoEntry);
                });
            });
        });

        const nodes: SankeyNode[] = [];
        categoryIds.forEach((categoryId) => {
            const meta = categoryStats.get(categoryId);
            const avgConfidence = meta?.weightTotal
                ? meta.confidenceWeighted / meta.weightTotal
                : 0;
            const color = categoryColorMap.get(categoryId) ?? chartTheme.grid;
            nodes.push({
                name: titleCase(categoryId),
                group: "category",
                itemStyle: { color, opacity: clamp(avgConfidence) },
                confidenceValue: avgConfidence,
                hasTextual: meta?.hasTextual ?? false,
            });
        });
        repoSet.forEach((repoId) => {
            const meta = repoStats.get(repoId);
            const avgConfidence = meta?.weightTotal
                ? meta.confidenceWeighted / meta.weightTotal
                : 0;
            nodes.push({
                name: repoId,
                group: "repo",
                itemStyle: { color: chartTheme.grid, opacity: clamp(avgConfidence) },
                confidenceValue: avgConfidence,
                hasTextual: meta?.hasTextual ?? false,
            });
        });

        const links: SankeyLink[] = [];
        const edgeMeta = new Map<string, SankeyEdgeMeta>();
        edgeTotals.forEach((entry) => {
            const avgConfidence = entry.weightTotal
                ? entry.confidenceWeighted / entry.weightTotal
                : 0;
            const color = categoryColorMap.get(entry.categoryId) ?? chartTheme.grid;
            links.push({
                source: entry.source,
                target: entry.target,
                value: entry.value,
                lineStyle: { color, opacity: clamp(avgConfidence) },
            });
            edgeMeta.set(`${entry.source}::${entry.target}`, {
                avgConfidence,
                hasTextual: entry.hasTextual,
            });
        });

        return { nodes, links, edgeMeta };
    }, [workUnits, categoryIds, categoryColorMap, chartTheme.grid]);

    const selectedUnit = useMemo(() => {
        if (!selectedId) return null;
        return workUnits.find((unit) => unit.work_unit_id === selectedId) ?? null;
    }, [selectedId, workUnits]);

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
            const categoryLabel = (data.categoryLabel as string) ?? (data.name as string) ?? "";
            if (!categoryLabel) return "";
            const repoScope = typeof data.repoScope === "string" ? data.repoScope : "";
            const weightedEffort = typeof data.value === "number" ? data.value : 0;
            const confidenceValue = typeof data.confidenceValue === "number" ? data.confidenceValue : 0;
            const workUnitCount = typeof data.workUnitCount === "number" ? data.workUnitCount : 0;
            const confidenceLabel = formatConfidence(confidenceValue);
            const effortUnitLabel = unitLabel;
            const confidenceDisclosure =
                "<div style=\"margin-top: 6px; font-size: 11px; color: " +
                chartTheme.muted +
                "\">Confidence shown reflects an average across contributing work units.</div>";
            const textualNote = data.hasTextual
                ? "<div style=\"margin-top: 6px; color: " +
                  chartTheme.muted +
                  "\">Minor textual modifiers were applied. These do not determine classification.</div>"
                : "";
            const title = repoScope ? `${categoryLabel} · ${repoScope}` : categoryLabel;
            const workUnitLine = workUnitCount
                ? `<div><span style="color: ${chartTheme.muted}">Work units:</span> ${workUnitCount}</div>`
                : "";

            return `
        <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
        <div><span style="color: ${chartTheme.muted}">Weighted effort:</span> ${formatNumber(weightedEffort)} ${effortUnitLabel}</div>
        <div><span style="color: ${chartTheme.muted}">Avg confidence:</span> ${confidenceLabel}</div>
        ${workUnitLine}
        ${confidenceDisclosure}
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
            const nodeType = typeof data.nodeType === "string" ? data.nodeType : "category";
            const categoryLabel = (data.categoryLabel as string) ?? (data.name as string) ?? "";
            const repoScope = typeof data.repoScope === "string" ? data.repoScope : "";
            const weightedEffort = typeof data.value === "number" ? data.value : 0;
            const confidenceValue = typeof data.confidenceValue === "number" ? data.confidenceValue : 0;
            const confidenceLabel = formatConfidence(confidenceValue);
            const hasTextual = Boolean(data.hasTextual);
            const textualNote = hasTextual
                ? "<div style=\"margin-top: 6px; color: " +
                  chartTheme.muted +
                  "\">Minor textual modifiers were applied. These do not determine classification.</div>"
                : "";

            if (nodeType === "work_unit") {
                const workUnitId = (data.workUnitId as string) ?? (data.name as string) ?? "";
                const confidenceBand = data.confidenceBand as
                    | WorkUnitSignal["confidence"]["band"]
                    | undefined;
                const bandLabel = confidenceBand ? ` (${formatBandLabel(confidenceBand)})` : "";
                const categoryLine = categoryLabel
                    ? `<div style="font-size: 11px; color: ${chartTheme.muted}; margin-bottom: 4px;">${categoryLabel}</div>`
                    : "";
                const repoLine = repoScope
                    ? `<div style="font-size: 11px; color: ${chartTheme.muted}; margin-bottom: 4px;">${repoScope}</div>`
                    : "";

                return `
        <div style="font-weight: 600; margin-bottom: 4px;">WorkUnit ${workUnitId}</div>
        ${categoryLine}
        ${repoLine}
        <div><span style="color: ${chartTheme.muted}">Weighted effort:</span> ${formatNumber(weightedEffort)} ${unitLabel}</div>
        <div><span style="color: ${chartTheme.muted}">Confidence:</span> ${confidenceLabel}${bandLabel}</div>
        ${textualNote}
      `;
            }

            const title = nodeType === "repo_scope" && repoScope
                ? `${categoryLabel} · ${repoScope}`
                : categoryLabel;
            const confidenceDisclosure =
                "<div style=\"margin-top: 6px; font-size: 11px; color: " +
                chartTheme.muted +
                "\">Confidence shown reflects an average across contributing work units.</div>";

            return `
        <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
        <div><span style="color: ${chartTheme.muted}">Weighted effort:</span> ${formatNumber(weightedEffort)} ${unitLabel}</div>
        <div><span style="color: ${chartTheme.muted}">Avg confidence:</span> ${confidenceLabel}</div>
        ${confidenceDisclosure}
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
            const avgConfidence = meta ? meta.avgConfidence : 0;
            const textualNote = meta?.hasTextual
                ? "<div style=\"margin-top: 6px; color: " +
                  chartTheme.muted +
                  "\">Minor textual modifiers were applied. These do not determine classification.</div>"
                : "";

            return `
        <div style="font-weight: 600; margin-bottom: 4px;">${source} → ${target}</div>
        <div><span style="color: ${chartTheme.muted}">Weighted effort:</span> ${formatNumber(value)} ${unitLabel}</div>
        <div><span style="color: ${chartTheme.muted}">Avg confidence:</span> ${formatConfidence(avgConfidence)}</div>
        <div style="margin-top: 6px; font-size: 11px; color: ${chartTheme.muted};">Confidence shown reflects an average across contributing work units.</div>
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

    return (
        <section className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="font-(--font-display) text-xl">Work Unit Signals</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        These views surface probabilistic signals from connected work units.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <ChartTypeToggle
                        options={TEXTUAL_OPTIONS}
                        value={textualMode}
                        onChange={setTextualMode}
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
                        What these signals represent
                    </summary>
                    <div className="mt-2">
                        <p className="text-sm text-(--ink-muted)">
                            These views show probabilistic work signals inferred from connected work activity across issues, pull requests, commits, and files.
                        </p>
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            A signal reflects how work appears to have behaved based on structure, timing, and limited textual hints.
                            It is not a label, a verdict, or an assessment of people.
                        </p>
                        <p className="mt-2 text-sm text-(--ink-muted)">
                            Because real work is messy, signals are shown with confidence and uncertainty rather than as fixed categories.
                        </p>
                        <ul className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                            <li>Signals describe patterns of work, not individual performance.</li>
                            <li>Categories are probabilistic, not exclusive. Work can span multiple categories at once.</li>
                            <li>Confidence reflects signal strength, not correctness.</li>
                            <li>Low confidence indicates mixed or incomplete signals, not bad data.</li>
                        </ul>
                        <p className="mt-3 text-xs text-(--ink-muted)">
                            These signals do not assign intent, measure productivity, or evaluate individuals.
                        </p>
                    </div>
                </details>
                <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-4">
                    <summary className="cursor-pointer list-none font-(--font-display) text-base">
                        How to read the visuals
                    </summary>
                    <div className="mt-2">
                        <ul className="space-y-2 text-sm text-(--ink-muted)">
                            <li>Size represents effort associated with a signal.</li>
                            <li>Color indicates which category the signal leans toward.</li>
                            <li>Opacity represents confidence in the interpretation.</li>
                            <li>Flows show how effort appears to move across categories and scopes.</li>
                        </ul>
                    </div>
                </details>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3">
                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Confidence bands</span>
                {CONFIDENCE_BANDS.map((band) => (
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
                            Effort size · Confidence opacity · {treemapIsSparse ? "Category view" : "Category · repo scope"}
                        </span>
                    </div>
                    <div className="mt-4">
                        {isLoading ? (
                            <p className="text-sm text-(--ink-muted)">Loading work units…</p>
                        ) : workUnits.length === 0 ? (
                            <p className="text-sm text-(--ink-muted)">No work unit signals available.</p>
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
                            <span className="text-xs text-(--ink-muted)">Probability-weighted effort</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowWorkUnits((prev) => !prev)}
                            className="rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                        >
                            {showWorkUnits ? "Hide work units" : "Show work units"}
                        </button>
                    </div>
                    <div className="mt-4">
                        {isLoading ? (
                            <p className="text-sm text-(--ink-muted)">Loading work units…</p>
                        ) : workUnits.length === 0 ? (
                            <p className="text-sm text-(--ink-muted)">No work unit signals available.</p>
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
                    <span className="text-xs text-(--ink-muted)">Category to repo flow</span>
                </div>
                <div className="mt-4">
                    {isLoading ? (
                        <p className="text-sm text-(--ink-muted)">Loading work units…</p>
                    ) : workUnits.length === 0 ? (
                        <p className="text-sm text-(--ink-muted)">No work unit signals available.</p>
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

            <div
                id="work-unit-calculation"
                className="rounded-3xl border border-(--card-stroke) bg-card p-5"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="font-(--font-display) text-lg">How this was calculated</h3>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            This interpretation appears to be based on structural relationships, timing patterns,
                            and minor textual hints. Textual hints adjust confidence slightly but do not determine
                            categorization.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)" htmlFor="work-unit-select">
                            WorkUnit
                        </label>
                        <select
                            id="work-unit-select"
                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs"
                            value={selectedUnit?.work_unit_id ?? ""}
                            onChange={(event) => {
                                if (event.target.value) {
                                    handleSelect(event.target.value);
                                }
                            }}
                        >
                            <option value="" disabled>
                                Select a work unit
                            </option>
                            {workUnits.map((unit) => (
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
                                    <span className="text-(--ink-muted)">Confidence:</span>{" "}
                                    {formatConfidence(selectedUnit.confidence.value)} ({formatBandLabel(selectedUnit.confidence.band)})
                                </div>
                                {(selectedUnit.evidence?.textual ?? []).length > 0 && (
                                    <div className="text-xs text-(--ink-muted)">
                                        Minor textual modifiers were applied. These do not determine classification.
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
                            <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">Temporal evidence</p>
                            <div className="mt-3 space-y-2 text-xs">
                                {(selectedUnit.evidence?.temporal ?? []).length === 0 && (
                                    <p className="text-(--ink-muted)">No temporal evidence reported.</p>
                                )}
                                {(selectedUnit.evidence?.temporal ?? []).map((entry, index) => (
                                    <div key={`temporal-${index}`} className="rounded-lg border border-(--card-stroke) bg-card px-3 py-2 font-mono text-[11px]">
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
                    </div>
                ) : (
                    <p className="mt-6 text-sm text-(--ink-muted)">
                        Select a work unit from the dropdown to inspect evidence.
                    </p>
                )}
            </div>
        </section>
    );
}
