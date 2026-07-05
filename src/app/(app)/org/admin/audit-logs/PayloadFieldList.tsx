type PayloadFieldListProps = {
    title: string;
    data: Record<string, unknown> | null;
    /** Customer-safe message shown when the API recorded nothing for this section. */
    emptyMessage: string;
};

type FlattenedField = { path: string; value: unknown };

/** Recursion stops after this many levels of nesting — deeper structures summarize instead. */
const MAX_NESTING_DEPTH = 2;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
    return value === null || value === undefined || typeof value !== "object";
}

function countLabel(count: number): string {
    return `${count} nested value${count === 1 ? "" : "s"}`;
}

function summarizeArray(items: unknown[]): string {
    if (items.length === 0) return "(none)";
    if (items.every(isPrimitive)) return items.map((item) => formatFieldValue(item)).join(", ");
    return countLabel(items.length);
}

/**
 * Flattens a payload object into labeled leaf rows (CHAOS-2843, design
 * system A9) — never a raw JSON dump. Nested objects become dotted-path rows
 * (e.g. `role.old`) up to {@link MAX_NESTING_DEPTH}; arrays of primitives join
 * as readable text; anything deeper or an array of objects becomes a count
 * summary instead of a blob.
 */
function flattenPayload(data: Record<string, unknown>, prefix = "", depth = 0): FlattenedField[] {
    return Object.entries(data).flatMap(([key, value]): FlattenedField[] => {
        const path = prefix ? `${prefix}.${key}` : key;

        if (Array.isArray(value)) {
            return [{ path, value: summarizeArray(value) }];
        }
        if (isPlainObject(value)) {
            if (depth >= MAX_NESTING_DEPTH) {
                return [{ path, value: countLabel(Object.keys(value).length) }];
            }
            return flattenPayload(value, path, depth + 1);
        }
        return [{ path, value }];
    });
}

function humanizeSegment(segment: string): string {
    return segment
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function humanizePath(path: string): string {
    return path.split(".").map(humanizeSegment).join(" \u203A ");
}

function formatFieldValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
}

export function PayloadFieldList({ title, data, emptyMessage }: PayloadFieldListProps) {
    const fields = data ? flattenPayload(data) : [];

    return (
        <section className="space-y-2 rounded-2xl border border-(--card-stroke) bg-(--card-90) p-4">
            <p className="text-xs uppercase tracking-widest text-(--ink-muted)">{title}</p>
            {fields.length === 0 ? (
                <p className="text-sm text-(--ink-muted)">{emptyMessage}</p>
            ) : (
                <dl className="grid gap-2 text-sm">
                    {fields.map(({ path, value }) => (
                        <div key={path} className="flex gap-2">
                            <dt className="w-36 shrink-0 text-(--ink-muted)">
                                {humanizePath(path)}
                            </dt>
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
