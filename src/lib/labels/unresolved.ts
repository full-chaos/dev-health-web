export const UNRESOLVED = "Unresolved";

/** The served name, or "Unresolved". An id is never a label. */
export function nameOrUnresolved(name: string | null | undefined): string {
    return name?.trim() || UNRESOLVED;
}
