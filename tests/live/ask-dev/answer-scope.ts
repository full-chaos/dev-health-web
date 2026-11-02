/**
 * CHAOS-12637: what a live answer is ABOUT, read from the result the panel drew, not from words in
 * its text. A page case that matches the repository's name in the text passes an answer about the
 * whole organization that mentions the repository once (Codex r1v on web #1740, reproduced).
 */

/** The parts of a served investigation result this check reads. */
export type ScopedResult = {
    readonly status: string;
    readonly subject_resolution: {
        readonly committed: ReadonlyArray<{
            readonly kind: string;
            readonly canonical_id: string;
            readonly label?: string;
        }>;
    };
    readonly claimed_facts?: ReadonlyArray<{
        readonly subject: { readonly kind: string; readonly canonical_id: string };
    }>;
};

const NOT_ANSWERED = new Set(["clarification_required", "no_match"]);

/** The page's repository: its served label, and the id the page's chip sends as its hint. */
export type PageRepository = { readonly label: string; readonly canonicalId: string };

/**
 * Why an answer is not an answer about ONE repository, or `[]` when it is: it answered; it committed
 * exactly that repository, by kind, id AND label (a label is not unique: two repositories can share
 * a handle, two teams can differ only in case); at least one claim is about it; and no claim is about
 * the organization. A claim about another subject (the team that owns the repository, say) is
 * allowed: a repository's answer can cite its owner. No result at all is a failure: a check that
 * did not happen fails.
 */
export function repositoryScopeFailures(
    result: ScopedResult | undefined,
    repository: PageRepository,
): string[] {
    if (result === undefined) return ["no terminal result was captured for this question"];
    if (NOT_ANSWERED.has(result.status)) return [`the answer did not answer: ${result.status}`];
    const failures: string[] = [];
    const committed = result.subject_resolution.committed;
    const subject = committed.length === 1 ? committed[0] : undefined;
    if (subject === undefined) {
        failures.push(
            `the answer committed ${String(committed.length)} subjects, not the one repository`,
        );
    } else if (
        subject.kind !== "repository" ||
        subject.canonical_id !== repository.canonicalId ||
        subject.label !== repository.label
    ) {
        failures.push(
            `the answer committed ${subject.kind} "${subject.label ?? ""}" (${subject.canonical_id}), not repository "${repository.label}" (${repository.canonicalId})`,
        );
    }
    const claims = result.claimed_facts ?? [];
    // A claim is about the repository when its subject IS the repository: the kind and the id,
    // since an id alone may be shared by a subject of another kind (Codex r1).
    if (
        subject === undefined ||
        !claims.some(
            (claim) =>
                claim.subject.kind === subject.kind &&
                claim.subject.canonical_id === subject.canonical_id,
        )
    ) {
        failures.push("no claim is about the repository");
    }
    if (claims.some((claim) => claim.subject.kind === "organization")) {
        failures.push("a claim is about the organization");
    }
    return failures;
}

/**
 * The terminal result of one investigation event stream (`text/event-stream`), or undefined when
 * the stream holds none. Each frame's `data:` lines are one JSON event. The first terminal event,
 * `result` or `error`, ends the stream: a result after an error is not the stream's answer.
 */
export function terminalResultOf(stream: string): ScopedResult | undefined {
    for (const frame of stream.split(/\r?\n\r?\n/u)) {
        const data = frame
            .split(/\r?\n/u)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice("data:".length).trimStart())
            .join("\n");
        if (data === "") continue;
        let event: unknown;
        try {
            event = JSON.parse(data);
        } catch {
            continue;
        }
        if (typeof event !== "object" || event === null) continue;
        const type = (event as { type?: unknown }).type;
        if (type === "error") return undefined;
        if (type === "result") return (event as { result: ScopedResult }).result;
    }
    return undefined;
}
