import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChartTypeToggle,
  TREEMAP_SUNBURST_OPTIONS,
  type TreemapSunburstType,
} from "@/components/charts/ChartTypeToggle";
import { InvestmentMixSunburst } from "@/components/charts/InvestmentMixSunburst";
import { TreemapChart, type TreemapNode } from "@/components/charts/TreemapChart";
import { useChartTheme } from "@/components/charts/chartTheme";
import { buildTooltipHtml, calcPercent } from "@/lib/chartUtils";
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
}: InvestmentMixSectionProps) {
  const chartTheme = useChartTheme();
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
      subcategoryKey: focusSubcategory?.startsWith(`${focusTheme}.`) ? focusSubcategory : null,
    });
  }, [activeRole, filters, focusSubcategory, focusTheme]);
  const treemapWorkGraphUrl = useMemo(() => {
    if (!treemapSelection?.themeKey) return null;
    return buildInvestmentWorkGraphUrl({
      filters,
      role: activeRole,
      themeKey: treemapSelection.themeKey,
      subcategoryKey:
        treemapSelection.type === "subcategory" ? treemapSelection.subcategoryId : null,
    });
  }, [activeRole, filters, treemapSelection]);

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

  const handleTreemapSelection = useCallback(
    (node: { name: string; path: string[]; data?: TreemapNode }) => {
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
      const themeKey = nodeData?.themeKey ?? (categoryId ? categoryId.split(".", 1)[0] : null);
      const themeLabel = themeKey ? titleCase(themeKey) : (node.path[0] ?? node.name);
      const subcategoryLabel =
        nodeType === "subcategory" ? (nodeData?.categoryLabel ?? node.name) : undefined;
      const selectionKey =
        nodeType === "subcategory"
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
    },
    [],
  );

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

    return { name: "Investment", value: mixTotalValue, children };
  }, [investmentMix, mixTotalValue, themeColorMap, chartTheme.grid]);

  const treemapLabelFormatter = useCallback((params: unknown, totalValue: number) => {
    if (!params || typeof params !== "object") return "";
    const entry = params as { data?: { name?: string; value?: number } };
    const nodeData = entry.data ?? {};
    const name = typeof nodeData.name === "string" ? nodeData.name : "";
    const value = typeof nodeData.value === "number" ? nodeData.value : 0;
    const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
    if (!name || pct < 2) return "";
    return `${name}\n${pct.toFixed(0)}%`;
  }, []);

  const formatTreemapTooltip = useCallback(
    (params: unknown, _totalValue: number, unitLabel: string) => {
      if (!params || typeof params !== "object") return "";
      const entry = params as {
        data?: Record<string, unknown>;
        treePathInfo?: Array<{ name: string }>;
      };
      const data = entry.data ?? {};
      const treePath = entry.treePathInfo ?? [];
      const pathSegments = treePath.slice(1).map((p) => p.name);
      const title = pathSegments.join(" · ");
      if (!title) return "";
      const value = typeof data.value === "number" ? data.value : 0;
      const qualityValue = typeof data.qualityValue === "number" ? data.qualityValue : null;
      const qualityLabel = qualityValue !== null ? formatQuality(qualityValue) : "Unknown";
      const qualityExtra =
        qualityValue !== null
          ? `Avg evidence quality: ${qualityLabel}<br/><div style=\"margin-top: 6px; font-size: 11px; opacity: 0.8;\">Evidence quality reflects average across contributing units.</div>`
          : `<div style=\"opacity: 0.7;\">Evidence quality: Unknown<br/>Insufficient evidence to compute quality.</div>`;

      return buildTooltipHtml({
        title,
        value,
        unit: unitLabel,
        percent: calcPercent(value, mixTotalValue),
        mutedColor: chartTheme.muted,
        accentColor: chartTheme.accent2,
        extra: qualityExtra,
      });
    },
    [chartTheme.accent2, chartTheme.muted, mixTotalValue],
  );

  const categoryScopeLabel = focusTheme ? "Subcategory" : "Theme";

  return (
    <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-(--font-display) text-lg">
            {mixChartType === "treemap" ? "Treemap" : "Investment mix"}
          </h3>
          <span className="text-xs text-(--ink-muted)">
            {mixChartType === "treemap"
              ? `Effort size - Evidence quality opacity - ${categoryScopeLabel} view`
              : "Theme to Subcategory (depth 2)"}
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
                className={`rounded-full px-2 py-0.5 text-[11px] ${treemapSelection ? "text-(--accent-2) hover:underline" : "bg-(--card-stroke) text-foreground"}`}
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
              {treemapWorkGraphUrl && (
                <Link
                  href={treemapWorkGraphUrl}
                  className="ml-auto rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--accent-2) hover:border-(--accent-2)/40"
                >
                  Open in Work Graph ↗
                </Link>
              )}
            </div>
            {isLoading ? (
              <p className="text-sm text-(--ink-muted)">Loading work units...</p>
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
          <p className="text-sm text-(--ink-muted)">Loading investment mix...</p>
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
              {focusedWorkGraphUrl && (
                <Link
                  href={focusedWorkGraphUrl}
                  className="mt-3 flex items-center justify-between rounded-xl border border-(--card-stroke) bg-card px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-foreground hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5 group"
                >
                  <span>Open in Work Graph</span>
                  <span className="text-(--accent-2) group-hover:translate-x-0.5 transition-transform">
                    ↗
                  </span>
                </Link>
              )}
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
                          <div className="truncate text-sm text-foreground">
                            {titleCase(entry.key)}
                          </div>
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
  );
}
