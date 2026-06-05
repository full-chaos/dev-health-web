"use client";

import { InvestmentMixSunburst } from "@/components/charts/InvestmentMixSunburst";

type InvestmentChartProps = {
    themeDistribution: Record<string, number>;
    subcategoryDistribution: Record<string, number>;
    evidenceQualityDistribution?: Record<string, number>;
    unit?: string;
};

export function InvestmentChart({
    themeDistribution,
    subcategoryDistribution,
    evidenceQualityDistribution,
    unit,
}: InvestmentChartProps) {
    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
            <InvestmentMixSunburst
                themeDistribution={themeDistribution}
                subcategoryDistribution={subcategoryDistribution}
                evidenceQualityDistribution={evidenceQualityDistribution}
                unit={unit}
                height={360}
            />
        </div>
    );
}
