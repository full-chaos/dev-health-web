/**
 * EvidenceEntryCard
 *
 * Renders the fields of a schema-less evidence record as humanised labeled rows.
 * Previously the evidence blocks rendered raw `JSON.stringify(entry)` which was
 * hard to read. This component iterates `Object.entries(entry)` and formats each
 * key→value pair with a readable label.
 */

/** Renders the fields of a schema-less evidence record as labeled rows. */
export function EvidenceEntryCard({ entry }: { entry: Record<string, unknown> }) {
    const entries = Object.entries(entry);
    if (entries.length === 0) {
        return (
            <div className="rounded-lg border border-(--card-stroke) bg-card px-3 py-2 text-xs text-(--ink-muted)">
                —
            </div>
        );
    }
    return (
        <div className="rounded-lg border border-(--card-stroke) bg-card px-3 py-2 text-xs">
            <dl className="space-y-1">
                {entries.map(([key, value]) => {
                    const label = key
                        .replace(/[_-]/g, " ")
                        .replace(/([a-z])([A-Z])/g, "$1 $2")
                        .replace(/\b\w/g, (c) => c.toUpperCase());
                    const displayValue =
                        value === null || value === undefined
                            ? "—"
                            : typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value);
                    return (
                        <div key={key} className="flex flex-wrap gap-1">
                            <dt className="text-(--ink-muted) shrink-0">{label}:</dt>
                            <dd className="font-mono break-all">{displayValue}</dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}
