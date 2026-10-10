import { repoLinkPageNotes, type RepoLinkFacts } from "@/lib/metrics/repoLinkNote";

/**
 * The once-per-page notes of the repository-scoped work-item metrics (CHAOS-9120): the multi-repo
 * note and the organization link coverage. Renders nothing when the rows serve neither.
 */
export function RepoLinkPageNote({
    rows,
}: {
    rows: readonly (RepoLinkFacts & { metric?: string })[] | null | undefined;
}) {
    const notes = repoLinkPageNotes(rows);
    if (notes.length === 0) return null;
    return (
        <div
            data-testid="repo-link-page-note"
            className="mt-1 space-y-1 text-xs text-(--ink-muted)"
        >
            {notes.map((note) => (
                <p key={note}>{note}</p>
            ))}
        </div>
    );
}
