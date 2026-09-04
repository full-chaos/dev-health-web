import { DATA_COMPLETENESS_THRESHOLD, GATE_COPY } from "@/lib/feature-flags/interpretation";

interface DataQualityBannerProps {
    dataCompleteness?: number;
    cohortContamination?: number;
    concurrentDeployCount?: number;
}

function InfoIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
        >
            <title>Information</title>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
        </svg>
    );
}

export function DataQualityBanner({
    dataCompleteness,
    cohortContamination,
    concurrentDeployCount,
}: DataQualityBannerProps) {
    const showCompleteness =
        dataCompleteness !== undefined && dataCompleteness < DATA_COMPLETENESS_THRESHOLD;
    const showContamination = cohortContamination !== undefined && cohortContamination > 0;
    const showConcurrent = concurrentDeployCount !== undefined && concurrentDeployCount > 0;

    if (!showCompleteness && !showContamination && !showConcurrent) return null;

    return (
        <div className="flex flex-col gap-2">
            {showCompleteness && (
                <div className="flex items-center gap-2 rounded-2xl border border-blue-500/20 bg-blue-500/5 px-4 py-2.5 text-xs text-blue-400">
                    <InfoIcon />
                    <span>{GATE_COPY.dataArriving}</span>
                    <span className="ml-auto rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-label-caps font-semibold uppercase tracking-[0.15em]">
                        {Math.round(dataCompleteness * 100)}% complete
                    </span>
                </div>
            )}

            {showContamination && (
                <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-400">
                    <InfoIcon />
                    <span>{GATE_COPY.contamination(cohortContamination)}</span>
                </div>
            )}

            {showConcurrent && (
                <div className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-400">
                    <InfoIcon />
                    <span>{GATE_COPY.concurrentDeploys(concurrentDeployCount)}</span>
                </div>
            )}
        </div>
    );
}
