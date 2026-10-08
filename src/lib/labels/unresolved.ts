import { containsIdToken } from "@/lib/labels/idToken";

export const UNRESOLVED = "Unresolved";

/** The served name, or "Unresolved". An id is never a label. */
export function nameOrUnresolved(name: string | null | undefined): string {
    return name?.trim() || UNRESOLVED;
}

/**
 * A heading for an untyped entity record: the first served `title`/`name` that is a
 * non-empty string and not an id token, else the type word. An id is never a heading.
 */
export function entityHeading(
    entity: Record<string, unknown> | null | undefined,
    typeWord: string,
): string {
    for (const key of ["title", "name"]) {
        const value = entity?.[key];
        if (typeof value === "string" && value.trim() && !containsIdToken(value)) {
            return value.trim();
        }
    }
    return typeWord;
}
