import { useId, type ReactNode } from "react";

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

const ACTIVE = "border-(--accent) bg-(--accent)/15 text-(--accent)";
const INACTIVE =
    "border-(--border) bg-(--card-80) text-(--text-muted) hover:border-(--accent)/40 hover:text-(--text-primary)";

const PILL =
    "inline-flex items-center gap-1.5 rounded-(--radius-pill) border px-3 py-1.5 text-label-caps font-medium uppercase transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-(--accent)";

/**
 * Segmented selection primitive (framework A3).
 *
 * The rounded-pill idiom is reserved for *single-select A3 toggles* that filter,
 * scope, change status, or segment the current view. It is a radiogroup —
 * exactly one option is selected at a time — and must not be used for
 * navigation, back links, or CTA actions. Keep it distinct from {@link ModeTabs}
 * (route/sub-view switching), {@link BackLink} (return path), and {@link Button}
 * (actions).
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
    const name = useId();

    return (
        <div
            className={`flex flex-wrap items-center gap-2 ${className ?? ""}`.trim()}
            data-testid={testId}
        >
            {leadingLabel ? (
                <span className="text-label-caps uppercase text-(--text-muted)">
                    {leadingLabel}
                </span>
            ) : null}
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={ariaLabel}>
                {options.map((option) => {
                    const isActive = option.id === value;
                    return (
                        <label
                            key={option.id}
                            title={option.title}
                            className={`${PILL} ${isActive ? ACTIVE : INACTIVE}`}
                        >
                            <input
                                type="radio"
                                name={name}
                                checked={isActive}
                                aria-checked={isActive}
                                onChange={() => onChange(option.id)}
                                className="sr-only"
                            />
                            {option.icon}
                            <span>{option.label}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
