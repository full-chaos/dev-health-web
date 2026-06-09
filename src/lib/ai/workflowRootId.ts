/**
 * Canonical Work Graph PR root-id encoder.
 *
 * The ops extractor writes PR node ids as `${repo_id}:${number}` —
 * dev-health-ops `work_graph/extractors/ai_workflow.py`:
 * `pr_id = f"{repo_id}:{pr_number}"` — and `aiWorkflowDrilldown` matches
 * `root_id` against those edge ids verbatim (no normalization server-side).
 *
 * Every web caller must build PR root ids through this function so the
 * format can never drift to a divergent scheme (e.g. `repo#number`), which
 * would silently return zero edges instead of failing loudly.
 */
export function prWorkflowRootId(repoId: string, number: number): string {
    return `${repoId}:${number}`;
}
