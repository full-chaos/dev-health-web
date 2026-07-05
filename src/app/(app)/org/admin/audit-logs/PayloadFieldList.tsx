type PayloadFieldListProps = {
    title: string;
    data: Record<string, unknown> | null;
    /** Customer-safe message when the API returned no payload for this section. */
    emptyMessage: string;
};

function humanizeKey(key: string): string {
    return key
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function formatFieldValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string" || typeof value === "number") return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/**
 * Renders an audit-log payload/context object as typed, labeled fields
 * (CHAOS-2843, design system A9) — never a raw JSON dump as the primary
 * content. Only a value that is itself a nested object/array falls back to
 * a compact `JSON.stringify` for that ONE field's leaf value, which stays a
 * labeled secondary detail rather than the section's primary content.
 */
export function PayloadFieldList({ title, data, emptyMessage }: PayloadFieldListProps) {
    const entries = data ? Object.entries(data) : [];

    return (
        <section className="space-y-2 rounded-2xl border border-(--card-stroke) bg-(--card-90) p-4">
            <p className="text-xs uppercase tracking-widest text-(--ink-muted)">{title}</p>
            {entries.length === 0 ? (
                <p className="text-sm text-(--ink-muted)">{emptyMessage}</p>
            ) : (
                <dl className="grid gap-2 text-sm">
                    {entries.map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                            <dt className="w-36 shrink-0 text-(--ink-muted)">{humanizeKey(key)}</dt>
                            <dd className="min-w-0 break-words font-mono text-xs">
                                {formatFieldValue(value)}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </section>
    );
}
