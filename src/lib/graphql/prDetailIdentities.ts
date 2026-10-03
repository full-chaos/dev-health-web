import { hasEmailAddress } from "./reviewEdgeIdentities";
import type { PullRequestDetail } from "./types";

/**
 * PR detail (CHAOS-8494, same rule as ruling 51 for the Review Network): a person is shown by a
 * served name, else "Not reported", and NEVER by an e-mail address.
 *
 * `pr(id)` serves `authorEmail` (PR and commits), an `authorName` that can itself hold an address,
 * and a review's `reviewer` text that can be an address; the title, body and commit messages are free
 * text and can hold one (a "Co-authored-by: Name <a@b.c>" trailer). This step runs on the server, in the
 * fetcher, before the data goes anywhere: the address fields are dropped, a name that holds an
 * address is taken out, an address in the title, body or a commit message is cut out, and a reviewer that is an address reads "Not reported".
 */
export const NOT_REPORTED = "Not reported";

const safeName = (value: string | null | undefined): string | null | undefined =>
    typeof value === "string" && hasEmailAddress(value) ? null : value;

// An address in free text ("Co-authored-by: Name <a@b.c>"): the address with its angle brackets and the
// space before it; the name stays.
const ADDRESS_IN_TEXT = /\s*<?[^\s<>@]+@[^\s<>@]+>?/gu;

const safeText = (value: string | null | undefined): string | null | undefined =>
    typeof value === "string" ? value.replace(ADDRESS_IN_TEXT, "") : value;

export function withoutPrEmailAddresses(pr: PullRequestDetail): PullRequestDetail {
    const { authorEmail: _authorEmail, ...rest } = pr;
    return {
        ...rest,
        title: safeText(rest.title),
        body: safeText(rest.body),
        authorName: safeName(rest.authorName),
        reviews: (rest.reviews ?? []).map((review) => ({
            ...review,
            reviewer: hasEmailAddress(review.reviewer) ? NOT_REPORTED : review.reviewer,
        })),
        commits: (rest.commits ?? []).map((commit) => {
            const { authorEmail: _commitEmail, ...commitRest } = commit;
            return {
                ...commitRest,
                message: safeText(commitRest.message),
                authorName: safeName(commitRest.authorName),
            };
        }),
    };
}
