export const UNRESOLVED = "Unresolved";

/** The served name, or "Unresolved". An id is never a label. */
export function nameOrUnresolved(name: string | null | undefined): string {
    return name?.trim() || UNRESOLVED;
}

/**
 * The served name of an untyped entity record (flame `title` for an issue, `name` for a deployment),
 * or "Unresolved" when ops serves none (null, absent or blank). An id is never a heading.
 */
export function servedEntityName(
    entity: Record<string, unknown> | null | undefined,
    key: "title" | "name",
): string {
    const value = entity?.[key];
    return typeof value === "string" ? nameOrUnresolved(value) : UNRESOLVED;
}
