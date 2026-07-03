type ImmutableFieldProps = {
    label: string;
    value: string;
    note: string;
};

/**
 * Explicit read-only presentation for a field the update API does not
 * accept. Rendered as a locked value + explanation rather than a silently
 * disabled input, so edit mode makes immutability obvious (CHAOS-2797).
 */
export function ImmutableField({ label, value, note }: ImmutableFieldProps) {
    return (
        <div>
            <div className="mb-1.5 flex items-center gap-1.5">
                <span className="block text-sm font-medium">{label}</span>
                <span className="text-label-caps text-(--ink-muted)">🔒 locked</span>
            </div>
            <div className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-(--foreground)">
                {value}
            </div>
            <p className="mt-1.5 text-xs text-(--ink-muted)">{note}</p>
        </div>
    );
}
