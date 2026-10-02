import { useId } from "react";

type OptionListProps = {
    emptyLabel: string;
    items: string[];
    onChange: (nextValues: string[]) => void;
    selected: string[];
    toggleValue: (values: string[], value: string) => string[];
    /** One value at most: radios, a choice replaces the selection, the empty option clears it. */
    single?: boolean;
};

export function OptionList({
    emptyLabel,
    items,
    onChange,
    selected,
    toggleValue,
    single = false,
}: OptionListProps) {
    const group = useId();
    const kind = single ? "radio" : "checkbox";
    // One selected value: when a URL holds several, the first is the one in effect.
    const isSelected = (item: string) => (single ? selected[0] === item : selected.includes(item));
    return (
        <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2">
                <input
                    type={kind}
                    name={single ? group : undefined}
                    checked={!selected.length}
                    onChange={() => onChange([])}
                />
                <span>{emptyLabel}</span>
            </label>
            {items.length ? (
                items.map((item) => (
                    <label key={item} className="flex items-center gap-2">
                        <input
                            type={kind}
                            name={single ? group : undefined}
                            checked={isSelected(item)}
                            onChange={() => onChange(single ? [item] : toggleValue(selected, item))}
                        />
                        <span>{item}</span>
                    </label>
                ))
            ) : (
                <p className="text-xs text-(--ink-muted)">
                    No options yet. Use Advanced filters to type values.
                </p>
            )}
        </div>
    );
}
