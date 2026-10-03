/**
 * Review Network identities (CHAOS-7973, ruling 51): a person is shown by a served name, else by
 * the stored identity, and NEVER by an e-mail address or a part of one.
 *
 * What `reviewEdges` serves: the stored identity of the reviewer and of the author, as two plain
 * strings. It serves no display name. In the data the author is the pull request's author e-mail
 * first (else the author name), and the reviewer is the review's reviewer text, so a stored
 * identity can be an e-mail address.
 *
 * This module takes the addresses out on the server, before the rows go to the page: a person
 * whose stored identity is an address gets an opaque key and no name (the cell then reads
 * "Not reported"). No file in this module imports server code, so the view can use
 * `hasEmailAddress` as a second guard.
 */

/** A row as `reviewEdges` serves it. It stays on the server. */
export interface ServedReviewEdgeRow {
    reviewer: string;
    author: string;
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
 * The served rows with every e-mail address taken out.
 *
 * - A stored identity that is not an address (a login, a name) is kept: it is the name, and its
 *   key is that identity.
 * - A stored identity that is, or holds, an address gets an opaque key and no name. The key is an
 *   index in the order of first appearance in THIS answer (never made from the address), and one
 *   address has one key, as reviewer and as author.
 * - The placeholder "unknown" keeps its one key and has no name.
 *
 * The two kinds of key have different prefixes, so a kept identity can never equal an opaque key.
 */
export function withoutEmailAddresses(edges: ServedReviewEdgeRow[]): ReviewEdgeRow[] {
    const opaqueKeys = new Map<string, string>();
    const person = (identity: string): { key: string; name: string | null } => {
        if (hasEmailAddress(identity)) {
            let key = opaqueKeys.get(identity);
            if (key === undefined) {
                key = `unnamed:${opaqueKeys.size + 1}`;
                opaqueKeys.set(identity, key);
            }
            return { key, name: null };
        }
        return {
            key: `stored:${identity}`,
            name: identity === NO_STORED_IDENTITY ? null : identity,
        };
    };

    return edges.map((edge) => {
        const reviewer = person(edge.reviewer);
        const author = person(edge.author);
        return {
            reviewer: reviewer.key,
            author: author.key,
            reviewerName: reviewer.name,
            authorName: author.name,
            reviewsCount: edge.reviewsCount,
            day: edge.day,
            repoId: edge.repoId,
        };
    });
}
