"use client";

import type { ReactNode } from "react";

type ChartTypeOption<T extends string = string> = {
    id: T;
    label: string;
    icon?: ReactNode;
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
              ${
                  isActive
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
const chordIcon = (
    <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 fill-none stroke-current"
        strokeWidth="1.5"
    >
        <circle cx="8" cy="8" r="5.5" />
        <path d="M4.5 5.75c1.3-1 2.6-1 3.5-.1" strokeLinecap="round" />
        <path d="M8 5.65c1.1-.9 2.35-.95 3.5-.1" strokeLinecap="round" />
        <path d="M4.6 10.3c1.25.9 2.5.95 3.35.15" strokeLinecap="round" />
        <path d="M8.05 10.45c1 .75 2.2.7 3.35-.15" strokeLinecap="round" />
    </svg>
);

export const TREEMAP_SUNBURST_OPTIONS = [
    { id: "treemap" as const, label: "Treemap" },
    { id: "sunburst" as const, label: "Sunburst" },
];

export const SANKEY_HEATMAP_OPTIONS = [
    { id: "sankey" as const, label: "Sankey" },
    { id: "heatmap" as const, label: "Heatmap" },
];

export const INVESTMENT_SANKEY_CHORD_OPTIONS = [
    { id: "sankey" as const, label: "Sankey" },
    { id: "chord" as const, label: "Chord", icon: chordIcon },
];

export type TreemapSunburstType = "treemap" | "sunburst";
export type SankeyHeatmapType = "sankey" | "heatmap";
export type InvestmentFlowChartType = "sankey" | "chord";
