"use client";

import { READ_FAILED_MESSAGE } from "@/lib/readFailure";

import { CompletionRange } from "@/components/capacity/CompletionRange";
import { ForecastInputsCard } from "@/components/capacity/ForecastInputsCard";
import { ForecastNotices } from "@/components/capacity/ForecastNotices";
import { ForecastTiles } from "@/components/capacity/ForecastTiles";
import { Inset } from "@/components/ui/Inset";
import { Section } from "@/components/ui/Section";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { teamIdsForScope } from "@/lib/filters/capacityScope";
import { useCapacityForecast } from "@/lib/graphql/hooks";
import { useOrgId } from "@/lib/graphql/provider";
import type { MetricFilter } from "@/lib/filters/types";

import { capacityForecastInput } from "./capacityInput";

type CapacityViewProps = {
    filters: MetricFilter;
    orgId?: string;
};

const CARD = "rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6";

export function CapacityView({ filters, orgId: propOrgId }: CapacityViewProps) {
    const contextOrgId = useOrgId();
    const orgId = propOrgId || contextOrgId || "";

    const {
        data: queryData,
        loading: isLoading,
        error,
    } = useCapacityForecast({
        orgId,
        input: capacityForecastInput(filters),
    });

    const forecast = queryData;
    const teamCount = teamIdsForScope(filters)?.length ?? 0;

    return (
        <div className="flex flex-col gap-6">
            {isLoading ? (
                <div
                    data-testid="forecast-loading"
                    className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 animate-pulse"
                >
                    {[0, 1, 2, 3].map((index) => (
                        <div key={index} className={`${CARD} h-28`} />
                    ))}
                </div>
            ) : error ? (
                <Notice variant="danger" live={false} titleAs="h3" title="Forecast unavailable">
                    {READ_FAILED_MESSAGE}
                </Notice>
            ) : forecast ? (
                <>
                    <ForecastNotices forecast={forecast} />
                    <ForecastTiles forecast={forecast} />
                </>
            ) : (
                <DataState
                    variant="insufficient-confidence"
                    title="No Forecast Available"
                    description="Insufficient throughput history to generate a forecast. Need at least 14 days of data."
                    data-testid="forecast-empty"
                />
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* The prototype's "Completion range" card: the Monte Carlo forecast as a chance curve. */}
                <Section
                    title="Completion range"
                    description="Monte Carlo forecast: the chance that the remaining work is done by each day."
                    data-testid="completion-range-card"
                >
                    {forecast ? (
                        // Served: the curve. Not served (no stored distribution): "Not reported".
                        <CompletionRange forecast={forecast} />
                    ) : isLoading ? (
                        <div className="flex h-80 items-center justify-center">
                            <div className="animate-pulse text-sm text-(--text-muted)">
                                Loading chart...
                            </div>
                        </div>
                    ) : error ? (
                        <div
                            data-testid="forecast-chart-failed"
                            className="flex h-80 items-center justify-center text-sm text-(--text-muted)"
                        >
                            {READ_FAILED_MESSAGE}
                        </div>
                    ) : (
                        <div
                            data-testid="forecast-chart-empty"
                            className="flex h-80 items-center justify-center text-sm text-(--text-muted)"
                        >
                            No data for this window
                        </div>
                    )}
                </Section>

                {forecast ? <ForecastInputsCard forecast={forecast} teamCount={teamCount} /> : null}
            </div>

            {forecast && (
                <Section title="Interpretation" data-testid="forecast-interpretation">
                    <div className="grid gap-3 md:grid-cols-3">
                        <Inset title="P50 (50%)">
                            Optimistic estimate. Half of simulations complete by this date.
                        </Inset>
                        <Inset title="P85 (85%)">
                            Recommended target. 85% confidence provides buffer for variability.
                        </Inset>
                        <Inset title="P95 (95%)">
                            Conservative estimate. Use for commitments with low risk tolerance.
                        </Inset>
                    </div>
                </Section>
            )}
        </div>
    );
}
