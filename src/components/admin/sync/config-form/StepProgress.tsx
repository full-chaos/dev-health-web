import type { SyncConfigStep } from "./wizardSteps";

type StepProgressProps = {
    steps: SyncConfigStep[];
    currentIndex: number;
    /** Revisit an already-completed step; forward-skipping is never allowed. */
    onStepClickAction: (index: number) => void;
};

/**
 * Step indicator for the guided sync-config creation flow (CHAOS-2838).
 * Deliberately not styled as a filter pill (Part A3 reserves pills for
 * filters/scope/status) — a bordered numbered breadcrumb instead.
 */
export function StepProgress({ steps, currentIndex, onStepClickAction }: StepProgressProps) {
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
