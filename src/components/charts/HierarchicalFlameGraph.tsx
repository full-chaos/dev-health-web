"use client";

import {
    useCallback,
    useMemo,
    useState,
    type CSSProperties,
} from "react";

import type { AggregatedFlameNode } from "@/lib/types";

const formatValue = (value: number, unit: string) => {
    if (unit === "hours") {
        if (value < 1) {
            return `${Math.round(value * 60)}m`;
        }
        if (value < 24) {
            return `${value.toFixed(1)}h`;
        }
        return `${(value / 24).toFixed(1)}d`;
    }
    if (unit === "loc") {
        if (value >= 1000) {
            return `${(value / 1000).toFixed(1)}k`;
        }
        return String(Math.round(value));
    }
    return String(Math.round(value));
};

const formatPercent = (value: number, total: number) => {
    if (total === 0) return "0%";
    return `${((value / total) * 100).toFixed(1)}%`;
};

type StackFrame = {
    node: AggregatedFlameNode;
    label: string;
};

type HierarchicalFlameGraphProps = {
    root: AggregatedFlameNode;
    unit: string;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
};

const COLORS = [
    "hsl(220, 70%, 50%)",
    "hsl(200, 70%, 45%)",
    "hsl(180, 60%, 45%)",
    "hsl(160, 55%, 45%)",
    "hsl(140, 50%, 45%)",
    "hsl(260, 60%, 55%)",
    "hsl(280, 55%, 50%)",
    "hsl(300, 50%, 50%)",
];

const getColor = (depth: number, index: number) => {
    const baseColor = COLORS[(depth + index) % COLORS.length];
    return baseColor;
};

export function HierarchicalFlameGraph({
    root,
    unit,
    height = 400,
    width = "100%",
    className,
    style,
}: HierarchicalFlameGraphProps) {
    const [zoomStack, setZoomStack] = useState<StackFrame[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [hoveredNode, setHoveredNode] = useState<AggregatedFlameNode | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const currentRoot = zoomStack.length > 0 ? zoomStack[zoomStack.length - 1].node : root;
    const totalValue = root.value;

    const filteredChildren = useMemo(() => {
        if (!searchQuery.trim()) {
            return currentRoot.children ?? [];
        }
        const query = searchQuery.toLowerCase();
        const matchesQuery = (node: AggregatedFlameNode): boolean => {
            if (node.name.toLowerCase().includes(query)) return true;
            return (node.children ?? []).some(matchesQuery);
        };
        return (currentRoot.children ?? []).filter(matchesQuery);
    }, [currentRoot, searchQuery]);

    const handleZoomIn = useCallback((node: AggregatedFlameNode) => {
        if (!node.children?.length) return;
        setZoomStack((prev) => [...prev, { node, label: node.name }]);
    }, []);

    const handleZoomOut = useCallback((index: number) => {
        setZoomStack((prev) => prev.slice(0, index));
    }, []);

    const handleReset = useCallback(() => {
        setZoomStack([]);
        setSearchQuery("");
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        setTooltipPos({ x: e.clientX, y: e.clientY });
    }, []);

    const renderNode = (
        node: AggregatedFlameNode,
        depth: number,
        index: number,
        parentValue: number
    ): React.ReactNode => {
        const widthPercent = parentValue > 0 ? (node.value / parentValue) * 100 : 0;
        if (widthPercent < 0.5) return null;

        const hasChildren = (node.children?.length ?? 0) > 0;
        const isSearchMatch =
            searchQuery.trim() &&
            node.name.toLowerCase().includes(searchQuery.toLowerCase());

        return (
            <div
                key={`${depth}-${index}-${node.name}`}
                className="relative"
                style={{ width: `${widthPercent}%`, minWidth: 0 }}
            >
                <button
                    type="button"
                    onClick={() => handleZoomIn(node)}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onMouseMove={handleMouseMove}
                    disabled={!hasChildren}
                    className={`
            block w-full text-left px-1.5 py-1 text-[10px] truncate
            border border-[var(--card-stroke)] rounded-sm mb-0.5
            transition-all duration-150
            ${hasChildren ? "cursor-pointer hover:brightness-110" : "cursor-default"}
            ${isSearchMatch ? "ring-2 ring-[var(--accent-2)]" : ""}
          `}
                    style={{
                        backgroundColor: getColor(depth, index),
                        color: "white",
                        textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                    }}
                    title={node.name}
                >
                    {widthPercent > 8 ? node.name : ""}
                </button>
                {hasChildren && (
                    <div className="flex">
                        {(node.children ?? []).map((child, childIndex) =>
                            renderNode(child, depth + 1, childIndex, node.value)
                        )}
                    </div>
                )}
            </div>
        );
    };

    const breadcrumbs = [
        { label: root.name, index: -1 },
        ...zoomStack.map((frame, idx) => ({ label: frame.label, index: idx })),
    ];

    const mergedStyle: CSSProperties = { height, width, ...style };

    return (
        <div className={className} style={mergedStyle}>
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1 text-xs">
                        {breadcrumbs.map((crumb, idx) => (
                            <span key={`crumb-${idx}`} className="flex items-center gap-1">
                                {idx > 0 && <span className="text-[var(--ink-muted)]">/</span>}
                                <button
                                    type="button"
                                    onClick={() => handleZoomOut(crumb.index + 1)}
                                    className={`
                    px-2 py-0.5 rounded-full
                    ${idx === breadcrumbs.length - 1
                                            ? "bg-[var(--card-stroke)] text-[var(--foreground)]"
                                            : "text-[var(--accent-2)] hover:underline"
                                        }
                  `}
                                >
                                    {crumb.label}
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Search */}
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="px-3 py-1 text-xs rounded-full border border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] placeholder:text-[var(--ink-muted)] w-36"
                    />
                    {/* Reset */}
                    {(zoomStack.length > 0 || searchQuery) && (
                        <button
                            type="button"
                            onClick={handleReset}
                            className="px-3 py-1 text-xs rounded-full border border-[var(--card-stroke)] bg-[var(--card)] text-[var(--accent-2)]"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {/* Summary */}
            <div className="flex items-center gap-4 mb-3 text-xs text-[var(--ink-muted)]">
                <span>
                    Total: <strong className="text-[var(--foreground)]">{formatValue(currentRoot.value, unit)}</strong> {unit}
                </span>
                <span>
                    {(currentRoot.children ?? []).length} children
                </span>
            </div>

            {/* Flame Graph */}
            <div
                className="overflow-auto rounded-lg border border-[var(--card-stroke)] bg-[var(--card-80)] p-2"
                style={{ maxHeight: typeof height === "number" ? height - 100 : "300px" }}
            >
                {filteredChildren.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-sm text-[var(--ink-muted)]">
                        {searchQuery ? (
                            <span>No matches found for &quot;{searchQuery}&quot;</span>
                        ) : (
                            "No data to display."
                        )}
                    </div>
                ) : (
                    <div className="flex">
                        {filteredChildren.map((child, index) => {
                            return renderNode(child, 0, index, currentRoot.value);
                        })}
                    </div>
                )}
            </div>

            {/* Tooltip */}
            {hoveredNode && (
                <div
                    className="fixed z-50 px-3 py-2 text-xs rounded-lg border border-[var(--card-stroke)] bg-[var(--card)] shadow-lg pointer-events-none"
                    style={{
                        left: tooltipPos.x + 12,
                        top: tooltipPos.y + 12,
                        maxWidth: 280,
                    }}
                >
                    <p className="font-semibold text-[var(--foreground)] truncate">{hoveredNode.name}</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[11px]">
                        <span className="text-[var(--ink-muted)]">Elapsed:</span>
                        <span className="text-[var(--foreground)] font-mono">{formatValue(hoveredNode.value, unit)} {unit}</span>

                        <span className="text-[var(--ink-muted)]">Percent:</span>
                        <span className="text-[var(--foreground)] font-mono">{formatPercent(hoveredNode.value, totalValue)}</span>
                    </div>
                    <div className="flex justify-between border-b border-[var(--card-stroke)] pb-1">
                        <span className="text-[var(--ink-muted)]">Total Elapsed</span>
                        <span className="text-[var(--foreground)] font-mono">{formatValue(totalValue, unit)} {unit}</span>
                    </div>
                    {(hoveredNode.children?.length ?? 0) > 0 && (
                        <p className="text-[var(--accent-2)] mt-1 text-[10px]">Click to zoom in</p>
                    )}
                </div>
            )}
        </div>
    );
}
