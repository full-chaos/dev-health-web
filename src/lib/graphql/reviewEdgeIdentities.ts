/**
 * Review Network identities (CHAOS-7973, ruling 51; CHAOS-8485): a person is shown by the served
 * display name, and NEVER by an e-mail address or a part of one.
 *
 * What `reviewEdges` serves for the reviewer and for the author (CHAOS-8485):
 * - a display name, or null when no name is known (the cell then reads "Not reported");
 * - an opaque key: one key per person in the org, the same as reviewer and as author. It tells
 *   people apart and joins rows. It is never shown.
 * The request does not select the stored identities (`reviewer` / `author`), which can be e-mail
 * addresses.
 *
 * The contract says that a served name and a served key are never an e-mail address. This module
 * is the last server step before the rows go to the page, and it does not rely on that: a name
 * that holds an address is not passed on, and a key that holds one is replaced. No file in this
 * module imports server code, so the view can use `hasEmailAddress` as a second guard.
 */

/** A row as `reviewEdges` serves it. It stays on the server. */
export interface ServedReviewEdgeRow {
    reviewerKey: string;
    authorKey: string;
    reviewerName: string | null | undefined;
    authorName: string | null | undefined;
    reviewsCount: number;
    day: string; // Date scalar → ISO string "YYYY-MM-DD"
    repoId: string | null | undefined;
}

/** A row as the page gets it: no e-mail address in any field. */
export interface ReviewEdgeRow {
    /** Key of the reviewer: it tells people apart, is never shown and is never an address. */
    reviewer: string;
    /** Key of the author. One person has one key, as reviewer and as author. */
    author: string;
    /** The name to show for the reviewer. Null = no name is served for this person. */
    reviewerName: string | null;
    /** The name to show for the author. Null = no name is served for this person. */
    authorName: string | null;
    reviewsCount: number;
    day: string;
    repoId: string | null | undefined;
}

// `x@y` with no white space next to the "@": an address alone, or inside a longer text
// ("Name <a@b.c>"). A lone "@handle" is not an address.
const EMAIL_ADDRESS = /[^\s@]+@[^\s@]+/u;

/** What the pipeline stores for a person with no stored e-mail and no stored name. */
const NO_STORED_IDENTITY = "unknown";

/** True when the text is, or holds, an e-mail address. */
export function hasEmailAddress(text: string): boolean {
    return EMAIL_ADDRESS.test(text);
}

/**
 * The served rows as the page gets them, with no e-mail address in any field.
 *
 * - The served name is the name. A name that is not served stays null. A name that is, or holds,
 *   an address is not passed on (null). The stored placeholder "unknown" is not a name (null).
 * - The served key is the key. A key that holds an address is replaced by an opaque key: an index
 *   in the order of first appearance in THIS answer (never made from the address); one address
 *   has one key, as reviewer and as author.
 * - Only the fields named here go to the page: any other field of the answer stays on the server.
 *
 * The two kinds of key have different prefixes, so a served key can never equal a replaced key.
 */
export function withoutEmailAddresses(edges: ServedReviewEdgeRow[]): ReviewEdgeRow[] {
    const replacedKeys = new Map<string, string>();
    const keyOf = (served: string): string => {
        if (!hasEmailAddress(served)) return `key:${served}`;
        let key = replacedKeys.get(served);
        if (key === undefined) {
            key = `unnamed:${replacedKeys.size + 1}`;
            replacedKeys.set(served, key);
        }
        return key;
    };
    const nameOf = (served: string | null | undefined): string | null =>
        typeof served !== "string" || served === NO_STORED_IDENTITY || hasEmailAddress(served)
            ? null
            : served;

    return edges.map((edge) => ({
        reviewer: keyOf(edge.reviewerKey),
        author: keyOf(edge.authorKey),
        reviewerName: nameOf(edge.reviewerName),
        authorName: nameOf(edge.authorName),
        reviewsCount: edge.reviewsCount,
        day: edge.day,
        repoId: edge.repoId,
    }));
}
