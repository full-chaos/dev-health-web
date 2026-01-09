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

type CategorySummary = {
    total: number;
    confidenceWeighted: number;
    effortTotal: number;
    hasTextual: boolean;
    units: Array<{
        unit: WorkUnitSignal;
        weightedEffort: number;
    }>;
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

const deriveConfidenceBand = (value: number): WorkUnitSignal["confidence"]["band"] => {
    if (value >= 0.8) return "high";
    if (value >= 0.6) return "moderate";
    if (value >= 0.4) return "low";
    return "very_low";
};

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

    const includeTextual = textualMode === "structural_textual";
    const selectedId = searchParams.get("work_unit_id");

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
        const totalValue = workUnits.reduce(
            (sum, unit) => sum + (unit.effort?.value ?? 0),
            0
        );

        const children = workUnits.map((unit) => {
            let dominantKey: string | null = null;
            let dominantValue = -1;
            Object.entries(unit.categories ?? {}).forEach(([key, value]) => {
                if (typeof value === "number" && value > dominantValue) {
                    dominantValue = value;
                    dominantKey = key;
                }
            });

            const color = dominantKey ? categoryColorMap.get(dominantKey) : undefined;
            return {
                name: unit.work_unit_id,
                value: unit.effort.value,
                itemStyle: {
                    color: color ?? chartTheme.grid,
                    opacity: clamp(unit.confidence.value),
                },
                workUnit: unit,
                dominantCategory: dominantKey
                    ? { id: dominantKey, label: titleCase(dominantKey), value: dominantValue }
                    : null,
                hasTextual: (unit.evidence?.textual ?? []).length > 0,
            };
        });

        return {
            name: "WorkUnits",
            value: totalValue,
            children,
        };
    }, [workUnits, categoryColorMap, chartTheme.grid]);

    const sunburstData = useMemo<SunburstNode>(() => {
        const categorySummaries = new Map<string, CategorySummary>();

        workUnits.forEach((unit) => {
            const hasTextual = (unit.evidence?.textual ?? []).length > 0;
            Object.entries(unit.categories ?? {}).forEach(([categoryId, weight]) => {
                if (typeof weight !== "number" || weight <= 0) {
                    return;
                }
                const weightedEffort = unit.effort.value * weight;
                const entry = categorySummaries.get(categoryId) ?? {
                    total: 0,
                    confidenceWeighted: 0,
                    effortTotal: 0,
                    hasTextual: false,
                    units: [],
                };
                entry.total += weightedEffort;
                entry.confidenceWeighted += unit.confidence.value * unit.effort.value;
                entry.effortTotal += unit.effort.value;
                entry.hasTextual = entry.hasTextual || hasTextual;
                entry.units.push({ unit, weightedEffort });
                categorySummaries.set(categoryId, entry);
            });
        });

        const children: SunburstNode[] = [];

        categoryIds.forEach((categoryId) => {
            const summary = categorySummaries.get(categoryId);
            if (!summary || summary.total <= 0) {
                return;
            }
            const avgConfidence = summary.effortTotal
                ? summary.confidenceWeighted / summary.effortTotal
                : 0;
            const color = categoryColorMap.get(categoryId) ?? chartTheme.grid;
            const categoryLabel = titleCase(categoryId);
            const unitChildren: SunburstNode[] = summary.units.map(({ unit, weightedEffort }) => ({
                name: unit.work_unit_id,
                value: weightedEffort,
                itemStyle: {
                    color,
                    opacity: clamp(unit.confidence.value),
                },
                workUnitId: unit.work_unit_id,
                categoryId,
                categoryLabel,
                confidenceValue: unit.confidence.value,
                confidenceBand: unit.confidence.band,
                hasTextual: (unit.evidence?.textual ?? []).length > 0,
            }));

            children.push({
                name: categoryLabel,
                value: summary.total,
                itemStyle: {
                    color,
                    opacity: clamp(avgConfidence),
                },
                categoryId,
                categoryLabel,
                confidenceValue: avgConfidence,
                confidenceBand: deriveConfidenceBand(avgConfidence),
                hasTextual: summary.hasTextual,
                children: unitChildren,
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
    }, [workUnits, categoryIds, categoryColorMap, chartTheme.grid]);

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
            }
        >();
        const repoSet = new Set<string>();

        workUnits.forEach((unit) => {
            const repoIds = extractRepoIds(unit);
            const normalizedRepos = repoIds.length ? repoIds : ["unassigned"];
            normalizedRepos.forEach((repoId) => repoSet.add(repoId));
            const repoCount = normalizedRepos.length || 1;
            const hasTextual = (unit.evidence?.textual ?? []).length > 0;

            Object.entries(unit.categories ?? {}).forEach(([categoryId, weight]) => {
                if (typeof weight !== "number" || weight <= 0) {
                    return;
                }
                // Split across repos to avoid double counting multi-repo work units.
                const weightedEffort = (unit.effort.value * weight) / repoCount;
                if (weightedEffort <= 0) {
                    return;
                }
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
                    };
                    entry.value += weightedEffort;
                    entry.confidenceWeighted += unit.confidence.value * weightedEffort;
                    entry.weightTotal += weightedEffort;
                    entry.hasTextual = entry.hasTextual || hasTextual;
                    edgeTotals.set(edgeKey, entry);
                });
            });
        });

        const nodes: SankeyNode[] = [];
        categoryIds.forEach((categoryId) => {
            nodes.push({ name: titleCase(categoryId), group: "category" });
        });
        repoSet.forEach((repoId) => {
            nodes.push({ name: repoId, group: "repo" });
        });

        const links: SankeyLink[] = [];
        const edgeMeta = new Map<string, SankeyEdgeMeta>();
        edgeTotals.forEach((entry) => {
            links.push({ source: entry.source, target: entry.target, value: entry.value });
            edgeMeta.set(`${entry.source}::${entry.target}`, {
                avgConfidence: entry.weightTotal
                    ? entry.confidenceWeighted / entry.weightTotal
                    : 0,
                hasTextual: entry.hasTextual,
            });
        });

        return { nodes, links, edgeMeta };
    }, [workUnits, categoryIds]);

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

    const handleTreemapClick = useCallback(
        (node: { name: string }) => {
            if (!node.name) return;
            handleSelect(node.name);
        },
        [handleSelect]
    );

    const formatTreemapTooltip = useCallback(
        (params: unknown, _totalValue: number, _unitLabel: string) => {
            void _totalValue;
            void _unitLabel;
            if (!params || typeof params !== "object") return "";
            const entry = params as { data?: Record<string, unknown> };
            const data = entry.data ?? {};
            const workUnit = data.workUnit as WorkUnitSignal | undefined;
            if (!workUnit) return "";
            const dominant = data.dominantCategory as
                | { id: string; label: string; value: number }
                | null
                | undefined;
            const dominantLabel = dominant?.label ?? "No dominant category";
            const dominantPct =
                dominant && typeof dominant.value === "number"
                    ? `${formatNumber(dominant.value * 100, { maximumFractionDigits: 0 })}%`
                    : "--";
            const confidenceLabel = `${formatConfidence(workUnit.confidence.value)} (${formatBandLabel(
                workUnit.confidence.band
            )})`;
            const timeRange = buildTimeRangeLabel(
                workUnit.time_range?.start,
                workUnit.time_range?.end
            );
            const effortUnitLabel = formatEffortUnit(workUnit.effort.metric);
            const textualNote = (workUnit.evidence?.textual ?? []).length
                ? "<div style=\"margin-top: 6px; color: " +
                  chartTheme.muted +
                  "\">Minor textual modifiers were applied. These do not determine classification.</div>"
                : "";

            return `
        <div style="font-weight: 600; margin-bottom: 4px;">WorkUnit ${workUnit.work_unit_id}</div>
        <div style="font-size: 11px; color: ${chartTheme.muted}; margin-bottom: 4px;">${timeRange}</div>
        <div><span style="color: ${chartTheme.muted}">Dominant category:</span> ${dominantLabel} (${dominantPct})</div>
        <div><span style="color: ${chartTheme.muted}">Confidence:</span> ${confidenceLabel}</div>
        <div><span style="color: ${chartTheme.muted}">Effort:</span> ${formatNumber(workUnit.effort.value)} ${effortUnitLabel}</div>
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
            const categoryLabel = (data.categoryLabel as string) ?? (data.name as string) ?? "";
            const weightedEffort = typeof data.value === "number" ? data.value : 0;
            const confidenceValue = typeof data.confidenceValue === "number" ? data.confidenceValue : 0;
            const confidenceBand = (data.confidenceBand as WorkUnitSignal["confidence"]["band"]) ?? deriveConfidenceBand(confidenceValue);
            const confidencePrefix = data.workUnitId ? "Confidence" : "Avg confidence";
            const confidenceLabel = `${formatConfidence(confidenceValue)} (${formatBandLabel(confidenceBand)})`;
            const workUnitLabel = data.workUnitId
                ? `<div style="font-size: 11px; color: ${chartTheme.muted}; margin-bottom: 4px;">WorkUnit ${data.workUnitId}</div>`
                : "";
            const confidenceDisclosure =
                "<div style=\"margin-top: 6px; font-size: 11px; color: " +
                chartTheme.muted +
                "\">Confidence shown is an average across contributing work units.</div>";
            const textualNote = data.hasTextual
                ? "<div style=\"margin-top: 6px; color: " +
                  chartTheme.muted +
                  "\">Minor textual modifiers were applied. These do not determine classification.</div>"
                : "";

            return `
        <div style="font-weight: 600; margin-bottom: 4px;">${categoryLabel}</div>
        ${workUnitLabel}
        <div><span style="color: ${chartTheme.muted}">Weighted effort:</span> ${formatNumber(weightedEffort)} ${unitLabel}</div>
        <div><span style="color: ${chartTheme.muted}">${confidencePrefix}:</span> ${confidenceLabel}</div>
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
                        <span className="text-xs text-(--ink-muted)">Effort size · Confidence opacity</span>
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
                                onNodeClick={handleTreemapClick}
                            />
                        )}
                    </div>
                </div>

                <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-(--font-display) text-lg">Sunburst</h3>
                        <span className="text-xs text-(--ink-muted)">Probability-weighted effort</span>
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
                        Select a work unit from the treemap or dropdown to inspect evidence.
                    </p>
                )}
            </div>
        </section>
    );
}
