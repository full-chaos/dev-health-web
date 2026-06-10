type OptionListProps = {
    emptyLabel: string;
    items: string[];
    onChange: (nextValues: string[]) => void;
    selected: string[];
    toggleValue: (values: string[], value: string) => string[];
};

export function OptionList({
    emptyLabel,
    items,
    onChange,
    selected,
    toggleValue,
}: OptionListProps) {
    return (
        <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2">
                <input type="checkbox" checked={!selected.length} onChange={() => onChange([])} />
                <span>{emptyLabel}</span>
            </label>
            {items.length ? (
                items.map((item) => (
                    <label key={item} className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={selected.includes(item)}
                            onChange={() => onChange(toggleValue(selected, item))}
                        />
                        <span>{item}</span>
                    </label>
                ))
            ) : (
                <p className="text-[11px] text-(--ink-muted)">
                    No options yet. Use Advanced filters to type values.
                </p>
            )}
        </div>
    );
}
