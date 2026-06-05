// ── Work page active-view resolution ─────────────────────────────────────────
//
// Extracted from src/app/(app)/work/page.tsx so the resolution is unit-testable
// without rendering the RSC. The logic must stay in sync with the page.
//
// Rules (Codex review fix — CHAOS-2075):
//   1. `?view=overview|work` — explicit view param wins.
//   2. `?tab=<workTab>` without a `view` param — legacy deep link emitted by
//      WorkTabNav before two-level nav; resolve to "work" so the Work content
//      branch renders and the existing `tab` logic picks the sub-view.
//   3. Bare `/work` (no view, no tab) → "overview".

export type DiagnoseView = "overview" | "work";
export const DIAGNOSE_VIEWS: DiagnoseView[] = ["overview", "work"];

export const WORK_TABS = [
    "landscape",
    "heatmap",
    "flow",
    "investment",
    "capacity",
    "flame",
    "evidence",
    "graph",
] as const;

/**
 * Resolve the active DiagnoseView from raw URL search params.
 *
 * @param viewParam - the raw `view` query param value (string | undefined)
 * @param tabParam  - the raw `tab` query param value (string | undefined)
 */
export function resolveActiveView(
    viewParam: string | undefined,
    tabParam: string | undefined,
): DiagnoseView {
    if (DIAGNOSE_VIEWS.includes(viewParam as DiagnoseView)) {
        return viewParam as DiagnoseView;
    }
    // Legacy ?tab= deep link: no explicit view but a valid work tab → show Work.
    if (
        !viewParam &&
        typeof tabParam === "string" &&
        (WORK_TABS as readonly string[]).includes(tabParam)
    ) {
        return "work";
    }
    return "overview";
}
