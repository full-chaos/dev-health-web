import type { ReactNode } from "react";

export type SegmentedOption<TId extends string = string> = {
    id: TId;
    label: ReactNode;
};

type SegmentedControlProps<TId extends string = string> = {
    options: ReadonlyArray<SegmentedOption<TId>>;
    /** The selected option. */
    value: TId;
    onChange: (value: TId) => void;
    /** Accessible name of the group. */
    ariaLabel: string;
    className?: string;
    testId?: string;
};

// Approved prototype `.segments`: a small inline group on the page background, 3px inset, 3px gap; each
// segment 11px text, 4px radius; the selected one is the selection wash (orange marks the current
// selection). Not a filter pill (`FilterPills`) and not a tab (`ModeTabs`): a plain setting with a few
// values, each a toggle button (`aria-pressed`), so the label reads as the value.
const GROUP =
    "inline-flex items-center gap-0.75 rounded-(--radius-sm) bg-background p-0.75 [&>button]:rounded-[0.25rem]";
const SEGMENT =
    "px-2.25 py-1.25 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)";
const ACTIVE = "bg-(--accent-wash) font-semibold text-(--accent-ink)";
const INACTIVE = "bg-transparent text-(--ink-muted) hover:text-foreground";

export function SegmentedControl<TId extends string = string>({
    options,
    value,
    onChange,
    ariaLabel,
    className,
    testId,
}: SegmentedControlProps<TId>) {
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            data-testid={testId}
            className={`${GROUP} ${className ?? ""}`.trim()}
        >
            {options.map((option) => {
                const selected = option.id === value;
                return (
                    <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange(option.id)}
                        className={`${SEGMENT} ${selected ? ACTIVE : INACTIVE}`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
