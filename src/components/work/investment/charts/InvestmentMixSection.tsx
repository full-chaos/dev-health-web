"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
    ChartTypeToggle,
    TREEMAP_SUNBURST_OPTIONS,
    type TreemapSunburstType,
} from "@/components/charts/ChartTypeToggle";
import { DataNote } from "@/components/charts/DataNote";
import { InvestmentMixSunburst } from "@/components/charts/InvestmentMixSunburst";
import type { TreemapNode } from "@/components/charts/TreemapChart";
import { useChartTheme } from "@/components/charts/chartTheme";
import { useEvidenceDrawer } from "@/components/evidence/EvidenceDrawerProvider";
import { buttonClassName } from "@/components/shared/Button";
import { MeterRows } from "@/components/ui/MeterRows";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { formatNumber } from "@/lib/formatters";
import {
    adjustHex,
    clamp,
    formatQuality,
    formatSubcategoryLabel,
    titleCase,
} from "@/lib/investment";
import { getSortedSubcategories, getSortedThemes } from "@/lib/investmentMix";
import type { WorkUnitInvestment } from "@/lib/types";
import { buildInvestmentWorkGraphUrl } from "@/lib/workGraphDrilldownUrl";
import type { TreemapSelection } from "../types";
import { MixSelectionFacts } from "../MixSelectionFacts";
import { InvestmentColumnTreemap, type ColumnTreemapClick } from "./InvestmentColumnTreemap";

type InvestmentMix = ReturnType<typeof import("@/lib/investmentMix").normalizeInvestmentMix>;

type InvestmentMixSectionProps = {
    filters: MetricFilter;
    activeRole?: string;
    investmentMix: InvestmentMix | null;
    isLoading: boolean;
    isMixLoading: boolean;
    workUnits: WorkUnitInvestment[];
    effortUnit: string;
    focusTheme: string | null;
    focusSubcategory: string | null;
    setFocusTheme: (value: string | null) => void;
    setFocusSubcategory: (value: string | null) => void;
    themeColorMap: Map<string, string>;
    /** Series colors for unlabelled meter bars. */
    themeBarColorMap: Map<string, string>;
};

export function InvestmentMixSection({
    filters,
    activeRole,
    investmentMix,
    isLoading,
    isMixLoading,
    workUnits,
    effortUnit,
    focusTheme,
    focusSubcategory,
    setFocusTheme,
    setFocusSubcategory,
    themeColorMap,
    themeBarColorMap,
}: InvestmentMixSectionProps) {
    const chartTheme = useChartTheme();
    const evidence = useEvidenceDrawer();
    const [mixChartType, setMixChartType] = useState<TreemapSunburstType>("treemap");
    const [treemapSelection, setTreemapSelection] = useState<TreemapSelection | null>(null);

    const mixThemes = useMemo(
        () => (investmentMix ? getSortedThemes(investmentMix) : []),
        [investmentMix],
    );
    const mixSubcategories = useMemo(
        () => (investmentMix ? getSortedSubcategories(investmentMix) : []),
        [investmentMix],
    );
    const mixTotalValue = useMemo(
        () => mixThemes.reduce((sum, entry) => sum + entry.value, 0),
        [mixThemes],
    );
    const focusedThemeTotalValue = useMemo(() => {
        if (!focusTheme || !investmentMix) return 0;
        return investmentMix.theme_distribution[focusTheme] ?? 0;
    }, [focusTheme, investmentMix]);
    const focusedThemeSubcategories = useMemo(() => {
        if (!focusTheme) return [];
        return mixSubcategories.filter((entry) => entry.themeKey === focusTheme);
    }, [focusTheme, mixSubcategories]);
    const focusedWorkGraphUrl = useMemo(() => {
        if (!focusTheme) return null;
        return buildInvestmentWorkGraphUrl({
            filters,
            role: activeRole,
            themeKey: focusTheme,
            subcategoryKey: focusSubcategory?.startsWith(`${focusTheme}.`)
                ? focusSubcategory
                : null,
        });
    }, [activeRole, filters, focusSubcategory, focusTheme]);
    const handleThemeClick = useCallback(
        (themeKey: string) => {
            setFocusTheme(focusTheme === themeKey ? null : themeKey);
        },
        [focusTheme, setFocusTheme],
    );

    const handleSubcategoryClick = useCallback(
        (subcategoryKey: string) => {
            const [themeKey] = subcategoryKey.split(".", 1);
            setFocusTheme(themeKey || null);
            setFocusSubcategory(subcategoryKey);
        },
        [setFocusSubcategory, setFocusTheme],
    );

    // A treemap cell (or a column head) opens the ONE shared evidence drawer for that theme or
    // subcategory. The drawer shows the served effort and the share of the
    // node, and its footer links to the Work Graph for it. The selection stays marked while the
    // drawer is open and is cleared when it closes.
    const handleTreemapSelection = useCallback(
        (node: ColumnTreemapClick) => {
            const nodeData = node.data as
                | (TreemapNode & {
                      nodeType?: "theme" | "subcategory";
                      themeKey?: string;
                      categoryId?: string;
                      categoryLabel?: string;
                  })
                | undefined;

            const nodeType = nodeData?.nodeType === "subcategory" ? "subcategory" : "theme";
            const categoryId = nodeData?.categoryId ?? null;
            const themeKey =
                nodeData?.themeKey ?? (categoryId ? categoryId.split(".", 1)[0] : null);
            const themeLabel = themeKey ? titleCase(themeKey) : (node.path[0] ?? node.name);
            const subcategoryLabel =
                nodeType === "subcategory" ? (nodeData?.categoryLabel ?? node.name) : undefined;
            const selectionKey =
                nodeType === "subcategory"
                    ? `subcategory:${categoryId ?? node.name}`
                    : `theme:${themeKey ?? node.name}`;

            const value = typeof nodeData?.value === "number" ? nodeData.value : undefined;
            const workGraphUrl = themeKey
                ? buildInvestmentWorkGraphUrl({
                      filters,
                      role: activeRole,
                      themeKey,
                      subcategoryKey: nodeType === "subcategory" ? categoryId : null,
                  })
                : null;

            evidence.open({
                title: subcategoryLabel ? `${themeLabel} · ${subcategoryLabel}` : themeLabel,
                content: (
                    <MixSelectionFacts
                        testId="mix-selection-facts"
                        themeLabel={themeLabel}
                        subcategoryLabel={nodeType === "subcategory" ? subcategoryLabel : undefined}
                        value={value}
                        total={mixTotalValue}
                        unit={investmentMix?.unit?.replace(/_/g, " ") ?? effortUnit}
                    />
                ),
                footer: workGraphUrl ? (
                    <Link
                        href={workGraphUrl}
                        // The shared drawer lives in the layout: close it before the page changes.
                        onClick={evidence.close}
                        data-testid="mix-selection-work-graph"
                        className={buttonClassName("secondary", "md", "w-full")}
                    >
                        <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.openWorkGraph}
                    </Link>
                ) : undefined,
                onClose: () => setTreemapSelection(null),
            });
            // After `open`: opening tells the subject before this one that it closed (its
            // `onClose` clears the selection), so the new selection is set last.
            setTreemapSelection({
                key: selectionKey,
                type: nodeType,
                themeLabel,
                themeKey,
                subcategoryLabel,
                subcategoryId: categoryId,
            });
        },
        [activeRole, effortUnit, evidence, filters, investmentMix, mixTotalValue],
    );

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
                            color: adjustHex(baseColor, 8 + (idx % 3) * 6),
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

        return { name: "Investment", value: mixTotalValue, children };
    }, [investmentMix, mixTotalValue, themeColorMap, chartTheme.grid]);

    // Tooltip and accessible name of a treemap node: the same facts the ECharts tooltip showed
    // (path, served value and unit, share of the mix, average evidence quality).
    const describeTreemapNode = useCallback(
        (node: TreemapNode, path: string[]) => {
            const nodeData = node as TreemapNode & { nodeType?: string; qualityValue?: number };
            const themeNode = node as TreemapNode & { themeKey?: string };
            const quality =
                nodeData.nodeType === "subcategory"
                    ? nodeData.qualityValue
                    : themeNode.themeKey
                      ? investmentMix?.evidence_quality_distribution?.[themeNode.themeKey]
                      : undefined;
            const share =
                mixTotalValue > 0
                    ? `${formatNumber((node.value / mixTotalValue) * 100, { maximumFractionDigits: 1 })}%`
                    : null;
            return [
                `${path.join(" · ")}: ${formatNumber(node.value)} ${effortUnit}`,
                share ? `${share} of the mix` : null,
                typeof quality === "number"
                    ? `Average evidence quality ${formatQuality(quality)}`
                    : "Evidence quality not reported",
            ]
                .filter(Boolean)
                .join(". ");
        },
        [effortUnit, investmentMix, mixTotalValue],
    );

    return (
        <Section
            data-testid="investment-mix-section"
            title="Investment mix"
            description="Themes and the work behind them"
            action={
                <div className="flex flex-wrap items-center justify-end gap-3">
                    {mixChartType === "sunburst" && focusTheme && (
                        <button
                            type="button"
                            onClick={() => setFocusTheme(null)}
                            className={buttonClassName("ghost", "sm")}
                        >
                            {CTA_LABELS.clearTheme}
                        </button>
                    )}
                    <ChartTypeToggle
                        options={TREEMAP_SUNBURST_OPTIONS}
                        value={mixChartType}
                        onChangeAction={setMixChartType}
                    />
                </div>
            }
        >
            <div>
                {mixChartType === "treemap" ? (
                    isLoading ? (
                        <p className="text-sm text-(--ink-muted)">Loading work units...</p>
                    ) : workUnits.length === 0 ? (
                        <p className="text-sm text-(--ink-muted)">
                            No work unit investments available.
                        </p>
                    ) : (
                        <>
                            <InvestmentColumnTreemap
                                data={treemapData}
                                selectedKey={treemapSelection?.key ?? null}
                                onNodeClickAction={handleTreemapSelection}
                                describeNodeAction={describeTreemapNode}
                                ariaLabel="Investment mix by theme and subcategory; column width follows each theme's share of effort"
                            />
                            <DataNote>
                                Size is effort. Opacity is evidence quality. Select a cell for its
                                evidence.
                            </DataNote>
                        </>
                    )
                ) : isMixLoading ? (
                    <p className="text-sm text-(--ink-muted)">Loading investment mix...</p>
                ) : !investmentMix || mixThemes.length === 0 ? (
                    <p className="text-sm text-(--ink-muted)">No investment mix available.</p>
                ) : (
                    <div
                        data-testid="mix-sunburst-state"
                        className="grid gap-4.5 md:grid-cols-2 md:items-center"
                    >
                        <InvestmentMixSunburst
                            themeDistribution={investmentMix.theme_distribution}
                            subcategoryDistribution={investmentMix.subcategory_distribution}
                            evidenceQualityDistribution={
                                investmentMix.evidence_quality_distribution
                            }
                            unit={investmentMix.unit ?? effortUnit}
                            height={360}
                            focusedTheme={focusTheme}
                            onThemeClickAction={handleThemeClick}
                            onSubcategoryClickAction={handleSubcategoryClick}
                        />
                        {/* Prototype `sunburstChart` side: plain meter rows (`bars()`), share of the
                            mix per theme with the theme colour; a theme row drills into its
                            subcategories (share of the theme). */}
                        <div
                            data-testid="mix-sunburst-panel"
                            className="flex min-w-0 flex-col gap-3 md:self-center"
                        >
                            {focusTheme ? (
                                <p className="text-xs text-(--ink-muted)">
                                    {titleCase(focusTheme)}: share of the theme
                                </p>
                            ) : null}
                            {focusTheme ? (
                                focusedThemeSubcategories.length ? (
                                    <MeterRows
                                        aria-label={`${titleCase(focusTheme)} subcategories`}
                                        testId="mix-subcategory-meter-rows"
                                        max={100}
                                        rows={focusedThemeSubcategories.map((entry) => {
                                            const pctOfTheme = focusedThemeTotalValue
                                                ? (entry.value / focusedThemeTotalValue) * 100
                                                : 0;
                                            return {
                                                key: entry.key,
                                                label: formatSubcategoryLabel(entry.key, false),
                                                title: formatSubcategoryLabel(entry.key, true),
                                                value: pctOfTheme,
                                                display: `${formatNumber(pctOfTheme, { maximumFractionDigits: 1 })}%`,
                                                color: themeBarColorMap.get(focusTheme),
                                                onSelect: () => handleSubcategoryClick(entry.key),
                                                selected: focusSubcategory === entry.key,
                                            };
                                        })}
                                    />
                                ) : (
                                    <p className="text-sm text-(--ink-muted)">
                                        No subcategories observed for this theme.
                                    </p>
                                )
                            ) : (
                                <MeterRows
                                    aria-label="Themes"
                                    testId="mix-theme-meter-rows"
                                    max={100}
                                    rows={mixThemes.slice(0, 8).map((entry) => {
                                        const pct = mixTotalValue
                                            ? (entry.value / mixTotalValue) * 100
                                            : 0;
                                        return {
                                            key: entry.key,
                                            label: titleCase(entry.key),
                                            value: pct,
                                            display: `${formatNumber(pct, { maximumFractionDigits: 1 })}%`,
                                            color: themeBarColorMap.get(entry.key),
                                            onSelect: () => handleThemeClick(entry.key),
                                        };
                                    })}
                                />
                            )}
                            {focusedWorkGraphUrl ? (
                                <Link
                                    href={focusedWorkGraphUrl}
                                    data-testid="mix-sunburst-work-graph"
                                    className={buttonClassName("ghost", "sm", "self-start")}
                                >
                                    <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                                    {CTA_LABELS.openWorkGraph}
                                </Link>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>
        </Section>
    );
}
