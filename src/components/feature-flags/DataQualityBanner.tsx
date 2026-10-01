import { Notice } from "@/components/ui/Notice";
import { DATA_COMPLETENESS_THRESHOLD, GATE_COPY } from "@/lib/feature-flags/interpretation";

interface DataQualityBannerProps {
    dataCompleteness?: number;
    cohortContamination?: number;
    concurrentDeployCount?: number;
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
                <Notice
                    variant="info"
                    live={false}
                    action={
                        <span className="rounded-full border border-(--info)/30 bg-(--info)/10 px-2 py-0.5 text-label-caps font-semibold uppercase tracking-[0.15em] text-(--info)">
                            {Math.round(dataCompleteness * 100)}% complete
                        </span>
                    }
                >
                    {GATE_COPY.dataArriving}
                </Notice>
            )}

            {showContamination && (
                <Notice variant="warn" live={false}>
                    {GATE_COPY.contamination(cohortContamination)}
                </Notice>
            )}

            {showConcurrent && (
                <Notice variant="warn" live={false}>
                    {GATE_COPY.concurrentDeploys(concurrentDeployCount)}
                </Notice>
            )}
        </div>
    );
}
