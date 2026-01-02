"use client";

type ChartTypeOption<T extends string = string> = {
    id: T;
    label: string;
    icon?: React.ReactNode;
};

type ChartTypeToggleProps<T extends string = string> = {
    options: ChartTypeOption<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
};

/**
 * Segmented control for switching between chart visualization types.
 * Used within Flow tabs to toggle between Treemap/Sunburst, Sankey/Heatmap, etc.
 */
export function ChartTypeToggle<T extends string = string>({
    options,
    value,
    onChange,
    className = "",
}: ChartTypeToggleProps<T>) {
    return (
        <div
            className={`inline-flex rounded-lg border border-(--card-stroke) bg-(--card-70) p-0.5 ${className}`}
            role="radiogroup"
            aria-label="Chart type"
        >
            {options.map((option) => {
                const isActive = option.id === value;
                return (
                    <button
                        key={option.id}
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => onChange(option.id)}
                        className={`
              flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-medium transition-all duration-150
              ${isActive
                                ? "bg-(--accent-2) text-white shadow-sm"
                                : "text-(--ink-muted) hover:text-foreground hover:bg-(--card-80)"
                            }
            `}
                    >
                        {option.icon}
                        <span>{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

// Preset chart type options
export const TREEMAP_SUNBURST_OPTIONS = [
    { id: "treemap" as const, label: "Treemap" },
    { id: "sunburst" as const, label: "Sunburst" },
];

export const SANKEY_HEATMAP_OPTIONS = [
    { id: "sankey" as const, label: "Sankey" },
    { id: "heatmap" as const, label: "Heatmap" },
];

export type TreemapSunburstType = "treemap" | "sunburst";
export type SankeyHeatmapType = "sankey" | "heatmap";
