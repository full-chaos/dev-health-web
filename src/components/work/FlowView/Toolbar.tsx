import {
    ChartTypeToggle,
    TREEMAP_SUNBURST_OPTIONS,
    type TreemapSunburstType,
} from "@/components/charts/ChartTypeToggle";

type FlowToolbarProps = {
    currentTabLabel: string;
    currentTabDescription?: string;
    showChartTypeToggle: boolean;
    chartType: TreemapSunburstType;
    onChartTypeChange: (t: TreemapSunburstType) => void;
};

export function FlowToolbar({
    currentTabLabel,
    currentTabDescription,
    showChartTypeToggle,
    chartType,
    onChartTypeChange,
}: FlowToolbarProps) {
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
