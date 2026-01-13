"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChartTypeToggle } from "@/components/charts/ChartTypeToggle";
import { InvestmentMixSunburst } from "@/components/charts/InvestmentMixSunburst";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { StackedHorizontalBar } from "@/components/charts/StackedHorizontalBar";
import { TreemapChart, type TreemapNode } from "@/components/charts/TreemapChart";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import { buildTooltipHtml, calcPercent } from "@/lib/chartUtils";
import { investmentMixSample, workUnitInvestmentsSample } from "@/data/devHealthOpsSample";
import { explainInvestmentMix, getInvestment, getWorkUnits, getWorkUnitExplanation, getInvestmentFlow } from "@/lib/api";
import { getSortedSubcategories, getSortedThemes, normalizeInvestmentMix, type InvestmentMixAggregate } from "@/lib/investmentMix";
import { formatNumber, formatTimestamp } from "@/lib/formatters";
import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentMixExplanation, SankeyLink, SankeyNode, WorkUnitInvestment, WorkUnitExplanation, SankeyResponse } from "@/lib/types";

type SankeyRenderMode = "sankey" | "allocation_bar";

type InvestmentViewProps = {
    filters: MetricFilter;
};

type CategorizationMode = "text_metadata" | "metadata_only";


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
    const [sankeyFlow, setSankeyFlow] = useState<SankeyResponse | null>(null);
    const [baselineSankeyFlow, setBaselineSankeyFlow] = useState<SankeyResponse | null>(null);
    const [isSankeyLoading, setIsSankeyLoading] = useState(true);

    const includeTextual = categorizationMode === "text_metadata";
    const selectedId = searchParams.get("work_unit_id");
    const workUnitCount = workUnits.length;

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
                            dominant_themes: Object.keys(investmentMixSample.theme_distribution).slice(0, 3).map(titleCase),
                            key_drivers: [
                                "Subcategory distribution appears concentrated in the leading theme families.",
                                "Repo scope destinations are derived from connected work-unit evidence only.",
                            ],
                            operational_signals: [
                                "Evidence quality bands indicate uncertainty varies across contributing work units.",
                            ],
                            confidence_note: "AI-generated interpretation based on the data shown above; confidence appears bounded by the evidence quality mix.",
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

        const fetchSankey = async () => {
            setIsSankeyLoading(true);
            if (useSampleData) {
                if (active) {
                    // Sample logic for Sankey Flow
                    setSankeyFlow(null);
                    setIsSankeyLoading(false);
                }
                return;
            }

            try {
                const baselineFilters = getBaselineFilters(filters);
                const [current, baseline] = await Promise.all([
                    getInvestmentFlow({ filters }),
                    getInvestmentFlow({ filters: baselineFilters }),
                ]);

                if (active) {
                    setSankeyFlow(current);
                    setBaselineSankeyFlow(baseline);
                }
            } catch {
                if (active) {
                    setSankeyFlow(null);
                    setBaselineSankeyFlow(null);
                }
            } finally {
                if (active) {
                    setIsSankeyLoading(false);
                }
            }
        };

        fetchSankey();
        return () => {
            active = false;
        };
    }, [filters, useSampleData]);

    const baselineFilters = useMemo(() => getBaselineFilters(filters), [filters]);

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

    const allSubcategoryIds = useMemo(() => {
        const ids = new Set<string>();
        workUnits.forEach((unit) => {
            Object.keys(unit.investment?.subcategories ?? {}).forEach((key) => ids.add(key));
        });
        return Array.from(ids).sort();
    }, [workUnits]);

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

    const currentSankeyTotal = useMemo(() => {
        if (!sankeyFlow || !sankeyFlow.links.length) return 0;
        const targets = new Set(sankeyFlow.links.map((l) => l.target));
        return sankeyFlow.links
            .filter((l) => !targets.has(l.source))
            .reduce((acc, l) => acc + l.value, 0);
    }, [sankeyFlow]);

    const baselineSankeyTotal = useMemo(() => {
        if (!baselineSankeyFlow || !baselineSankeyFlow.links.length) return 0;
        const targets = new Set(baselineSankeyFlow.links.map((l) => l.target));
        return baselineSankeyFlow.links
            .filter((l) => !targets.has(l.source))
            .reduce((acc, l) => acc + l.value, 0);
    }, [baselineSankeyFlow]);

    const sankeyRenderMode = useMemo<SankeyRenderMode>(() => {
        if (!sankeyFlow) return "allocation_bar";
        return sankeyFlow.chosen_mode === "fallback" ? "allocation_bar" : "sankey";
    }, [sankeyFlow]);

    const sankeyFallbackSegments = useMemo(() => {
        if (!sankeyFlow || sankeyFlow.chosen_mode !== "fallback") return [];
        return sankeyFlow.nodes
            .filter((n) => n.group === "subcategory")
            .map((n) => {
                const subId = allSubcategoryIds.find(id => formatSubcategoryLabel(id, true) === n.name);
                const color = subId ? categoryColorMap.get(subId) : undefined;
                return {
                    name: n.name,
                    value: n.value ?? 0,
                    color,
                };
            })
            .sort((a, b) => b.value - a.value);
    }, [sankeyFlow, allSubcategoryIds, categoryColorMap]);

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

    const formatSankeyTooltip = useCallback(
        (params: unknown, unit: string) => {
            if (!params || typeof params !== "object") return "";
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
            const timeLabel = buildTimeRangeLabel(filters.time.start_date, filters.time.end_date);

            const currentValue = data.value ?? 0;
            const currentShare = currentSankeyTotal > 0 ? (currentValue / currentSankeyTotal) * 100 : 0;

            let baselineValue = 0;
            if (entry.dataType === "edge") {
                const baseLink = baselineSankeyFlow?.links.find(
                    (l) => l.source === data.source && l.target === data.target
                );
                baselineValue = baseLink?.value ?? 0;
            } else {
                const nodeName = data.name ?? entry.name ?? "";
                const baseNode = baselineSankeyFlow?.nodes.find((n) => n.name === nodeName);
                baselineValue =
                    baseNode?.value ??
                    baselineSankeyFlow?.links
                        .filter((l) => l.source === nodeName || l.target === nodeName)
                        .reduce((acc, l) => acc + l.value, 0) ??
                    0;
                // If node is intermediate, we might need a more complex sum, but usually nodes have values
                if (baselineValue === 0 && baselineSankeyFlow) {
                    // Try matching by name if value is missing
                    const outgoing = baselineSankeyFlow.links
                        .filter((l) => l.source === nodeName)
                        .reduce((acc, l) => acc + l.value, 0);
                    const incoming = baselineSankeyFlow.links
                        .filter((l) => l.target === nodeName)
                        .reduce((acc, l) => acc + l.value, 0);
                    baselineValue = Math.max(incoming, outgoing);
                }
            }

            const baselineShare =
                baselineSankeyTotal > 0 ? (baselineValue / baselineSankeyTotal) * 100 : 0;
            const delta = currentShare - baselineShare;

            const deltaSign = delta > 0 ? "↑ +" : delta < 0 ? "↓ " : "";
            const deltaColor =
                delta > 0 ? chartTheme.accent2 : delta < 0 ? chartTheme.accent1 : chartTheme.muted;

            const deltaHtml = `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${chartTheme.grid
                }; font-size: 11px;">
                    <div><span style="color: ${chartTheme.muted}">Current allocation share:</span> ${currentShare.toFixed(
                    1
                )}%</div>
                    <div><span style="color: ${chartTheme.muted}">Baseline allocation share:</span> ${baselineShare.toFixed(
                    1
                )}%</div>
                    <div style="font-weight: 600; color: ${deltaColor};">
                        Delta: ${deltaSign}${delta.toFixed(1)}%
                    </div>
                    <div style="margin-top: 6px; font-size: 10px; color: ${chartTheme.muted
                }; font-style: italic; line-height: 1.3;">
                        Delta reflects change in allocation share vs the prior window. It does not indicate cause, impact, or priority.
                    </div>
                </div>
            `;

            if (entry.dataType === "edge") {
                const lines = [
                    `<strong>Allocation:</strong> ${formatNumber(currentValue)} ${unit}`,
                    `<strong>From:</strong> ${data.source ?? ""}`,
                    `<strong>To:</strong> ${data.target ?? ""}`,
                    `<strong>Window:</strong> ${timeLabel}`,
                ];
                const meaning = `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${chartTheme.grid}; font-size: 10px; color: ${chartTheme.muted};">
                    <strong>Meaning:</strong> attribution under current filters (not dependency or causation)
                </div>`;
                return `<div style="padding: 4px;">${lines.join("<br/>")}${deltaHtml}${meaning}</div>`;
            }

            const nodeName = data.name ?? entry.name ?? "";
            const lines = [
                `<strong>Total allocated:</strong> ${formatNumber(currentValue)} ${unit}`,
                `<strong>Role:</strong> source/target in allocation`,
                `<strong>Window:</strong> ${timeLabel}`,
            ];
            return `<div style="padding: 4px;"><strong>${nodeName}</strong><br/><br/>${lines.join(
                "<br/>"
            )}${deltaHtml}</div>`;
        },
        [
            filters.time,
            currentSankeyTotal,
            baselineSankeyTotal,
            baselineSankeyFlow,
            chartTheme.grid,
            chartTheme.muted,
            chartTheme.accent1,
            chartTheme.accent2,
        ]
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
                            <li>Flows show how effort appears to move from themes or subcategories into repo scope.</li>
                            <li>Use the investment mix chart to drill from themes into subcategories and evidence.</li>
                        </ul>
                    </div>
                </details>
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
                            Effort size · Evidence quality opacity · {categoryScopeLabel} view
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
                            <h3 className="font-(--font-display) text-lg">Investment mix</h3>
                            <span className="text-xs text-(--ink-muted)">Theme → Subcategory (depth 2)</span>
                        </div>
                        {focusTheme && (
                            <button
                                type="button"
                                onClick={() => setFocusTheme(null)}
                                className="rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                            >
                                Clear theme
                            </button>
                        )}
                    </div>
                    <div className="mt-4">
                        {isMixLoading ? (
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

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="font-(--font-display) text-lg">Investment allocation by destination</h3>
                        <div className="group relative">
                            <span className="cursor-help text-(--ink-muted) transition hover:text-(--ink)">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </span>
                            <div className="absolute left-0 top-6 z-50 hidden w-64 rounded-xl border border-(--card-stroke) bg-card p-3 text-[11px] leading-relaxed text-(--ink) shadow-xl group-hover:block">
                                <p className="font-semibold mb-1">Why is this view selected?</p>
                                <p className="mb-2 text-(--ink-muted)">Target is chosen automatically based on coverage and distinct target counts.</p>
                                <div className="space-y-1">
                                    <div className="flex justify-between border-b border-(--card-stroke) pb-0.5 mb-1">
                                        <span className="text-(--ink-muted)">Team Coverage</span>
                                        <span className={sankeyFlow?.team_coverage && sankeyFlow.team_coverage >= 0.7 ? "text-(--accent-1)" : "text-(--ink-muted)"}>
                                            {sankeyFlow?.team_coverage ? formatNumber(sankeyFlow.team_coverage * 100) : "0"}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-b border-(--card-stroke) pb-0.5 mb-1">
                                        <span className="text-(--ink-muted)">Distinct Teams</span>
                                        <span className={sankeyFlow?.distinct_team_targets && sankeyFlow.distinct_team_targets >= 2 ? "text-(--accent-1)" : "text-(--ink-muted)"}>
                                            {sankeyFlow?.distinct_team_targets || 0}
                                        </span>
                                    </div>
                                    <div className="flex justify-between border-b border-(--card-stroke) pb-0.5 mb-1">
                                        <span className="text-(--ink-muted)">Repo Coverage</span>
                                        <span className={sankeyFlow?.repo_coverage && sankeyFlow.repo_coverage >= 0.7 ? "text-(--accent-1)" : "text-(--ink-muted)"}>
                                            {sankeyFlow?.repo_coverage ? formatNumber(sankeyFlow.repo_coverage * 100) : "0"}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-(--ink-muted)">Distinct Repos</span>
                                        <span className={sankeyFlow?.distinct_repo_targets && sankeyFlow.distinct_repo_targets >= 2 ? "text-(--accent-1)" : "text-(--ink-muted)"}>
                                            {sankeyFlow?.distinct_repo_targets || 0}
                                        </span>
                                    </div>
                                </div>
                                <p className="mt-2 text-[10px] text-(--ink-muted) italic border-t border-(--card-stroke) pt-1 mb-2">Thresholds: Coverage ≥ 70%, Targets ≥ 2</p>

                                <div className="border-t border-(--card-stroke) pt-2">
                                    <p className="font-semibold mb-1">Investment Semantics</p>
                                    <ul className="list-disc pl-3 space-y-1 text-(--ink-muted)">
                                        <li>Snapshot for selected window</li>
                                        <li>Allocation, not dependency</li>
                                        <li>Not impact, not root cause</li>
                                        <li><strong>Repo scope:</strong> represents the destination (repo, service, or team) where effort is attributed</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                    <span className="text-xs text-(--ink-muted)">How the selected investment themes are distributed across destinations in this window.</span>
                </div>
                <div className="mt-2 mb-4 text-[11px] text-(--ink-muted) leading-relaxed border-l-2 border-(--card-stroke) pl-3 py-1">
                    This is a snapshot allocation view. Links show where counted work/effort is attributed under current filters, not why it happened or its impact.
                </div>
                <div className="mt-0">
                    {isSankeyLoading ? (
                        <p className="text-sm text-(--ink-muted)">Loading flow data…</p>
                    ) : !sankeyFlow || (sankeyFlow.chosen_mode === "fallback") ? (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-xs text-(--ink-muted)">
                                <span className="italic">Directional flow hidden: insufficient destination diversity/coverage.</span>
                            </div>
                            <StackedHorizontalBar
                                segments={sankeyFallbackSegments}
                                unit={effortUnit}
                                height={90}
                            />
                        </div>
                    ) : (
                        <SankeyChart
                            nodes={sankeyFlow.nodes}
                            links={sankeyFlow.links}
                            unit={effortUnit}
                            height={320}
                            tooltipFormatter={formatSankeyTooltip}
                            onItemClick={(item) => {
                                // Extract subcategory from node name if possible
                                if (item.type === "node") {
                                    // Map formatted label back to ID if possible, but simpler is to check links
                                    const link = sankeyFlow.links.find(l => l.source === item.name);
                                    if (link) {
                                        // This is a subcategory node
                                        // We need the ID, but label format is "Theme · Sub"
                                        // Our subcategoryIds use "theme.sub"
                                        const subId = allSubcategoryIds.find(id => formatSubcategoryLabel(id, true) === item.name);
                                        if (subId) setFocusSubcategory(subId);
                                    }
                                } else if (item.type === "link") {
                                    const subId = allSubcategoryIds.find(id => formatSubcategoryLabel(id, true) === item.source);
                                    if (subId) setFocusSubcategory(subId);
                                }
                            }}
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
                                            Evidence quality: {entry.unit.evidence_quality.value !== null
                                                ? `${formatQuality(entry.unit.evidence_quality.value)} (${formatBandLabel(entry.unit.evidence_quality.band ?? "unknown")})`
                                                : "Unknown"}
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
