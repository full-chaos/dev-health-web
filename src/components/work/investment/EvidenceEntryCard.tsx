/**
 * EvidenceEntryCard
 *
 * Renders the fields of a schema-less evidence record as humanised labeled rows.
 * Previously the evidence blocks rendered raw `JSON.stringify(entry)` which was
 * hard to read. This component iterates `Object.entries(entry)` and formats each
 * key→value pair with a readable label.
 */
import { nameOrUnresolved } from "@/lib/labels/unresolved";

/**
 * An evidence quote names its source by the served `source_title`, or "Unresolved". Its `id` is an
 * issue or pull request id, never a label, so it is not shown; a commit source has no title and its
 * id is a commit hash, which stays.
 */
function shapeEvidenceEntry(entry: Record<string, unknown>): Array<[string, unknown]> {
    if (entry.type !== "evidence_quote") return Object.entries(entry);
    const isCommit = entry.source === "commit";
    return Object.entries(entry).flatMap(([key, value]): Array<[string, unknown]> => {
        if (key === "id") return isCommit ? [[key, value]] : [];
        if (key === "source_title")
            return isCommit
                ? []
                : [[key, nameOrUnresolved(typeof value === "string" ? value : null)]];
        return [[key, value]];
    });
}

/** Renders the fields of a schema-less evidence record as labeled rows. */
export function EvidenceEntryCard({ entry }: { entry: Record<string, unknown> }) {
    const entries = shapeEvidenceEntry(
        entry.type === "evidence_quote" && !("source_title" in entry)
            ? { ...entry, source_title: null }
            : entry,
    );
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
