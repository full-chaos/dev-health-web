import type { AddProviderStep } from "../addProviderWizardSteps";

type AddProviderStepProgressProps = {
    steps: AddProviderStep[];
    currentIndex: number;
    /** Revisit an already-completed step; forward-skipping is never allowed. */
    onStepClickAction: (index: number) => void;
};

/**
 * Step indicator for the Add Provider wizard (CHAOS-2837), mirroring the
 * sync-config wizard's `StepProgress` visual/behavioral pattern (a bordered
 * numbered breadcrumb, never a filter pill per docs/design-system.md Part
 * A3). A local copy rather than a shared import: the sync wizard's
 * `StepProgress` is typed against its own `SyncConfigStep` id union, and
 * `src/components/admin/sync/` is outside this issue's editable surface.
 */
export function AddProviderStepProgress({
    steps,
    currentIndex,
    onStepClickAction,
}: AddProviderStepProgressProps) {
    return (
        <ol className="flex flex-wrap items-center gap-2">
            {steps.map((step, index) => {
                const isCurrent = index === currentIndex;
                const isVisited = index < currentIndex;
                const isReachable = isVisited || isCurrent;
                return (
                    <li key={step.id} className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={!isReachable}
                            onClick={() => onStepClickAction(index)}
                            aria-current={isCurrent ? "step" : undefined}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                isCurrent
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                                    : isVisited
                                      ? "border-(--card-stroke) text-foreground hover:bg-(--card-70)"
                                      : "cursor-not-allowed border-(--card-stroke) text-(--ink-muted) opacity-50"
                            }`}
                        >
                            {index + 1}. {step.label}
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}
