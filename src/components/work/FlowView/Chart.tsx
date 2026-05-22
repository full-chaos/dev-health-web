import { InvestmentMixSunburst } from "@/components/charts/InvestmentMixSunburst";
import { TreemapChart } from "@/components/charts/TreemapChart";
import { SunburstChart } from "@/components/charts/SunburstChart";
import { StackedAreaChart } from "@/components/charts/StackedAreaChart";
import { SankeyChart } from "@/components/charts/SankeyChart";
import { toStackedAreaData, type HierarchyNode } from "@/lib/chartTransforms";
import type { TreemapSunburstType } from "@/components/charts/ChartTypeToggle";
import type { InvestmentMixAggregate } from "@/lib/investmentMix";
import type { SankeyDataset } from "@/lib/sankey";
import type { FlowSubTab } from "./Tabs";

type ChartProps = {
  subTab: FlowSubTab;
  isLoading: boolean;
  hasData: boolean;
  hotspotChartType: TreemapSunburstType;
  hotspotHierarchy: HierarchyNode;
  expenseData: ReturnType<typeof toStackedAreaData>;
  investmentMix: InvestmentMixAggregate | null;
  investmentMixLoading: boolean;
  investmentMixFocusTheme: string | null;
  dataset: SankeyDataset | null;
  onTreemapClick: (
    node: { name: string; value: number; path: string[]; percent: number; data?: HierarchyNode },
    view: FlowSubTab,
    unit: string,
  ) => void;
  onInvestmentMixClick: (key: string, type: "theme" | "subcategory") => void;
  onAreaClick: (params: {
    seriesName: string;
    date: string;
    value: number;
    percent: number;
  }) => void;
  onSankeyClick: (item: {
    type: "node" | "link";
    name?: string;
    source?: string;
    target?: string;
    value?: number;
  }) => void;
};

export function Chart({
  subTab,
  isLoading,
  hasData,
  hotspotChartType,
  hotspotHierarchy,
  expenseData,
  investmentMix,
  investmentMixLoading,
  investmentMixFocusTheme,
  dataset,
  onTreemapClick,
  onInvestmentMixClick,
  onAreaClick,
  onSankeyClick,
}: ChartProps) {
  return (
    <div
      className="relative min-h-[400px]"
      data-testid="flow-chart-container"
      role="tabpanel"
      id={`flow-panel-${subTab}`}
      aria-labelledby={`flow-tab-${subTab}`}
    >
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/50 backdrop-blur-sm rounded-2xl">
          <p className="text-sm text-(--ink-muted) animate-pulse">Loading flow data...</p>
        </div>
      )}

      {subTab === "investment_mix" &&
        (investmentMixLoading ? (
          <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-sm text-(--ink-muted)">
            Loading investment mix…
          </div>
        ) : !investmentMix ? (
          <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-sm text-(--ink-muted)">
            Investment mix unavailable for this scope and window.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <InvestmentMixSunburst
              themeDistribution={investmentMix.theme_distribution}
              subcategoryDistribution={investmentMix.subcategory_distribution}
              evidenceQualityDistribution={investmentMix.evidence_quality_distribution}
              unit={investmentMix.unit ?? "units"}
              height={500}
              focusedTheme={investmentMixFocusTheme}
              onThemeClick={(themeKey) => onInvestmentMixClick(themeKey, "theme")}
              onSubcategoryClick={(subcategoryKey) =>
                onInvestmentMixClick(subcategoryKey, "subcategory")
              }
            />
            <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                {investmentMixFocusTheme ? "Focused theme" : "How to use"}
              </p>
              <div className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                {investmentMixFocusTheme ? (
                  <>
                    <p className="text-foreground font-medium">
                      {investmentMixFocusTheme
                        .replace(/[_-]+/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    <p>Click the theme again to clear focus.</p>
                  </>
                ) : (
                  <>
                    <p>Click a theme to focus its subcategories.</p>
                    <p>Click a subcategory to inspect evidence in the Investment tab.</p>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

      {/* Code Hotspots Tab */}
      {subTab === "code_hotspots" &&
        (hotspotChartType === "treemap" ? (
          <TreemapChart
            data={hotspotHierarchy}
            unit="changes"
            height={500}
            onNodeClick={(node) => onTreemapClick(node, "code_hotspots", "changes")}
          />
        ) : (
          <SunburstChart
            data={hotspotHierarchy}
            unit="changes"
            height={500}
            onNodeClick={(node) => onTreemapClick(node, "code_hotspots", "changes")}
          />
        ))}

      {/* Investment Expense Tab */}
      {subTab === "investment_expense" && (
        <StackedAreaChart
          data={expenseData.data}
          series={expenseData.series}
          unit="items"
          height={500}
          onSeriesClick={onAreaClick}
        />
      )}

      {/* State Flow Tab */}
      {subTab === "state_flow" &&
        (hasData ? (
          <SankeyChart
            nodes={dataset!.nodes}
            links={dataset!.links}
            unit={dataset!.unit}
            height={500}
            onItemClick={onSankeyClick}
          />
        ) : (
          !isLoading && (
            <div className="flex h-[400px] items-center justify-center rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) text-sm text-(--ink-muted)">
              No flow data available for this scope and window.
            </div>
          )
        ))}
    </div>
  );
}
