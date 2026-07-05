"use client";

type TrialStatusBannerProps = {
    isTrialWarning: boolean;
    trialDaysRemaining: number;
    trialProgress: number;
    trialEndLabel: string;
};

export function TrialStatusBanner({
    isTrialWarning,
    trialDaysRemaining,
    trialProgress,
    trialEndLabel,
}: TrialStatusBannerProps) {
    return (
        <div
            className={`mt-4 max-w-sm rounded-lg border p-4 ${
                isTrialWarning
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-(--card-stroke) bg-(--card-80)"
            }`}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-(--ink-muted)">
                    Trial Status
                </span>
                <span
                    className={`text-xl font-bold ${
                        isTrialWarning ? "text-amber-600 dark:text-amber-500" : "text-(--foreground)"
                    }`}
                >
                    {trialDaysRemaining} days left
                </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${
                        isTrialWarning ? "bg-amber-500" : "bg-(--accent)"
                    }`}
                    style={{ width: `${trialProgress}%` }}
                />
            </div>

            <p className="mt-2 text-xs text-(--ink-muted)">Ends on {trialEndLabel}</p>
        </div>
    );
}
