type DestructiveWarningProps = {
    items: string[];
};

/**
 * Inline warning shown before submit when the staged edit reduces sync
 * coverage (repo scope or dataset removal). Renders nothing when `items` is
 * empty (CHAOS-2797).
 */
export function DestructiveWarning({ items }: DestructiveWarningProps) {
    if (items.length === 0) return null;

    return (
        <div
            role="alert"
            className="space-y-1.5 rounded-lg border border-(--caution)/30 bg-(--caution)/10 p-3 text-xs text-(--caution)"
        >
            {items.map((item) => (
                <p key={item}>⚠ {item}</p>
            ))}
        </div>
    );
}
