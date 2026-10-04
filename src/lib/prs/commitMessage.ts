// CHAOS-8504 (ruling 139): the PR detail page shows a commit message as served, except the
// trailer lines that start with "Co-authored-by:" or "Signed-off-by:" (they hold e-mail
// addresses). No address pattern filter: it would cut references such as lodash@4.17.21 or
// actions/checkout@v4.
const DROPPED_TRAILER = /^(?:co-authored-by|signed-off-by):/iu;

/** The message without its Co-authored-by / Signed-off-by lines; trailing blank lines are trimmed. */
export function commitMessageWithoutTrailers(message: string): string {
    return message
        .split(/\r?\n/u)
        .filter((line) => !DROPPED_TRAILER.test(line))
        .join("\n")
        .trimEnd();
}
