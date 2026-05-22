import {
  ChartTypeToggle,
  TREEMAP_SUNBURST_OPTIONS,
  type TreemapSunburstType,
} from "@/components/charts/ChartTypeToggle";

type ToolbarProps = {
  currentTabLabel: string;
  currentTabDescription: string;
  showChartTypeToggle: boolean;
  chartType: TreemapSunburstType;
  onChartTypeChange: (value: TreemapSunburstType) => void;
};

export function Toolbar({
  currentTabLabel,
  currentTabDescription,
  showChartTypeToggle,
  chartType,
  onChartTypeChange,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h2 className="text-xl font-(--font-display)">{currentTabLabel}</h2>
        <p className="mt-1 text-sm text-(--ink-muted)">{currentTabDescription}</p>
      </div>
      {showChartTypeToggle && (
        <ChartTypeToggle
          options={TREEMAP_SUNBURST_OPTIONS}
          value={chartType}
          onChange={onChartTypeChange}
        />
      )}
    </div>
  );
}
