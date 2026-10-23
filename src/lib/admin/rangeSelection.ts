export interface RowSelectionInput {
    selected: string[];
    order: string[];
    anchor: string | null;
    key: string;
    shift: boolean;
}

export interface RowSelectionResult {
    selected: string[];
    anchor: string;
}

export function applyRowSelection({
    selected,
    order,
    anchor,
    key,
    shift,
}: RowSelectionInput): RowSelectionResult {
    const checked = !selected.includes(key);
    const from = shift && anchor !== null ? order.indexOf(anchor) : -1;
    const to = order.indexOf(key);
    if (from === -1 || to === -1) {
        return {
            selected: checked ? [...selected, key] : selected.filter((value) => value !== key),
            anchor: key,
        };
    }
    const range = new Set(order.slice(Math.min(from, to), Math.max(from, to) + 1));
    const rest = selected.filter((value) => !range.has(value));
    return { selected: checked ? [...rest, ...range] : rest, anchor: key };
}
