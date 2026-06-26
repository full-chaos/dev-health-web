import type { ReactNode } from "react";

/** The three guided first-run steps, in order (CHAOS-2674). */
export type OnboardStepKey = "workspace" | "integration" | "complete";

type OnboardStepShellProps = {
    /** Which step the user is currently on; drives the progress indicator. */
    currentStep: OnboardStepKey;
    /** Heading for the card. */
    title: string;
    /** Supporting copy under the heading. */
    subtitle?: ReactNode;
    children: ReactNode;
};

const STEPS: { key: OnboardStepKey; label: string }[] = [
    { key: "workspace", label: "Workspace" },
    { key: "integration", label: "Integration" },
    { key: "complete", label: "Done" },
];

type StepStatus = "done" | "current" | "upcoming";

function stepStatus(stepIndex: number, currentIndex: number): StepStatus {
    if (stepIndex < currentIndex) return "done";
    if (stepIndex === currentIndex) return "current";
    return "upcoming";
}

/**
 * Shared chrome for the guided onboarding routes (CHAOS-2674). Renders a
 * consistent centered card with an accessible step progress indicator so the
 * workspace, integration, and completion screens read as one coherent flow.
 */
export function OnboardStepShell({
    currentStep,
    title,
    subtitle,
    children,
}: OnboardStepShellProps) {
    const currentIndex = STEPS.findIndex((step) => step.key === currentStep);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
            <div className="w-full max-w-xl space-y-8">
                <ol
                    aria-label="Onboarding progress"
                    className="flex items-center justify-center gap-3 sm:gap-4"
                >
                    {STEPS.map((step, index) => {
                        const status = stepStatus(index, currentIndex);
                        const isCurrent = status === "current";
                        return (
                            <li
                                key={step.key}
                                aria-current={isCurrent ? "step" : undefined}
                                className="flex items-center gap-2"
                            >
                                <span
                                    aria-hidden="true"
                                    className={[
                                        "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                                        status === "done"
                                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                                            : isCurrent
                                              ? "border-[var(--accent)] text-[var(--accent)]"
                                              : "border-[var(--card-stroke)] text-[var(--ink-muted)]",
                                    ].join(" ")}
                                >
                                    {status === "done" ? "✓" : index + 1}
                                </span>
                                <span
                                    className={[
                                        "text-sm font-medium",
                                        isCurrent
                                            ? "text-[var(--foreground)]"
                                            : "text-[var(--ink-muted)]",
                                    ].join(" ")}
                                >
                                    {step.label}
                                </span>
                            </li>
                        );
                    })}
                </ol>

                <div className="space-y-2 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
                        {title}
                    </h1>
                    {subtitle ? (
                        <p className="text-sm text-[var(--ink-muted)]">{subtitle}</p>
                    ) : null}
                </div>

                <div className="rounded-lg border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-8 shadow sm:px-10">
                    {children}
                </div>
            </div>
        </div>
    );
}
