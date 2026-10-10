import { NOT_FILTERED_BY_REPOSITORY } from "@/lib/metrics/repoScope";

/**
 * The note on a chart that a selected repository does not narrow (the quadrant and heatmap routes
 * take no repository beside a team). Renders nothing when `show` is false.
 */
export function RepoScopeNote({ show }: { show: boolean }) {
    if (!show) return null;
    return (
        <p data-testid="repo-scope-note" className="mt-1 text-xs text-(--ink-muted)">
            {NOT_FILTERED_BY_REPOSITORY}
        </p>
    );
}
