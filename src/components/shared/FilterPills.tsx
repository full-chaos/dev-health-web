"use client";

import type { ReactNode } from "react";

export type FilterPillOption<TId extends string = string> = {
    id: TId;
    label: string;
    icon?: ReactNode;
    /** Optional native title / tooltip. */
    title?: string;
};

type FilterPillsProps<TId extends string = string> = {
    options: ReadonlyArray<FilterPillOption<TId>>;
    value: TId;
    onChange: (value: TId) => void;
    /** Accessible name for the group. */
    ariaLabel: string;
    /** Optional quiet leading label rendered before the pills. */
    leadingLabel?: string;
    className?: string;
    /** Optional test id applied to the root container. */
    testId?: string;
};

const ACTIVE = "border-(--accent-2) bg-(--accent-2)/15 text-(--accent-2)";
const INACTIVE =
    "border-(--card-stroke) bg-(--card-80) text-(--ink-muted) hover:border-(--accent-2)/40 hover:text-foreground";

const PILL =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)";

/**
 * Segmented selection primitive (framework A3).
 *
 * The rounded-pill idiom is reserved for *single-select toggles that filter or
 * reshape the current view* (role lens, chart type, …). It is a radiogroup —
 * exactly one option is selected at a time. Keep it distinct from
 * {@link ModeTabs} (route/sub-view switching) and {@link BackLink} (return
 * path); a return path must never be rendered as a filter pill.
 */
export function FilterPills<TId extends string = string>({
    options,
    value,
    onChange,
    ariaLabel,
    leadingLabel,
    className,
    testId,
}: FilterPillsProps<TId>) {
    return (
        <div
            className={`flex flex-wrap items-center gap-2 ${className ?? ""}`.trim()}
            data-testid={testId}
        >
            {leadingLabel ? (
                <span className="text-[10px] uppercase tracking-[0.25em] text-(--ink-muted)">
                    {leadingLabel}
                </span>
            ) : null}
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={ariaLabel}>
                {options.map((option) => {
                    const isActive = option.id === value;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            title={option.title}
                            onClick={() => onChange(option.id)}
                            className={`${PILL} ${isActive ? ACTIVE : INACTIVE}`}
                        >
                            {option.icon}
                            <span>{option.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
