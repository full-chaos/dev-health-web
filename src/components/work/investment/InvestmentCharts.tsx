import { Section } from "@/components/ui/Section";
import { useMemo, useState } from "react";
import {
    ChartTypeToggle,
    INVESTMENT_SANKEY_CHORD_OPTIONS,
    type InvestmentFlowChartType,
} from "@/components/charts/ChartTypeToggle";
import { formatInvestmentUnit, WORK_UNIT_COUNT_UNIT } from "@/lib/investment";
import type { MetricFilter } from "@/lib/filters/types";
import type { SankeyResponse, WorkUnitInvestment } from "@/lib/types";
import { InvestmentMixSection } from "./charts/InvestmentMixSection";
import { AllocationSankeySwitch } from "./charts/AllocationSankeySwitch";
import { TeamExchangeChordSection } from "./charts/TeamExchangeChordSection";
import { useInvestmentColorMaps } from "./charts/useInvestmentColorMaps";

type InvestmentChartsProps = {
    filters: MetricFilter;
    activeRole?: string;
    workUnits: WorkUnitInvestment[];
    isLoading: boolean;
    investmentMix: ReturnType<typeof import("@/lib/investmentMix").normalizeInvestmentMix> | null;
    isMixLoading: boolean;
    mixFailed?: boolean;
    focusTheme: string | null;
    focusSubcategory?: string | null;
    setFocusTheme: (value: string | null) => void;
    setFocusSubcategory: (value: string | null) => void;
    selectedCategory: string | null;
    setSelectedCategory: (
        value: string | null | ((current: string | null) => string | null),
    ) => void;
    focusedTeam: string | null;
    setFocusedTeam: (value: string | null) => void;
    teamCategoryFlow: SankeyResponse | null | undefined;
    baselineSankeyFlow: SankeyResponse | null | undefined;
    isCategoryFlowLoading: boolean;
    categoryFlowFailed?: boolean;
    repoTeamFlow: SankeyResponse | null | undefined;
    isRepoTeamLoading: boolean;
    repoTeamFlowFailed: boolean;
    selectedThemeKey: string | null;
    showSubcategories: boolean;
    /** Controls which chart sections are rendered.
     * - "all" (default): mix section then flows (current behaviour, unchanged).
     * - "mix": only the InvestmentMixSection treemap/donut.
     * - "flows": only the ChartTypeToggle + chord/sankey flows.
     */
    section?: "all" | "mix" | "flows";
};

export function InvestmentCharts({
    filters,
    activeRole,
    workUnits,
    isLoading,
    investmentMix,
    isMixLoading,
    mixFailed,
    focusTheme,
    focusSubcategory,
    setFocusTheme,
    setFocusSubcategory,
    selectedCategory,
    setSelectedCategory,
    focusedTeam,
    setFocusedTeam,
    teamCategoryFlow,
    baselineSankeyFlow,
    isCategoryFlowLoading,
    categoryFlowFailed,
    repoTeamFlow,
    isRepoTeamLoading,
    repoTeamFlowFailed,
    selectedThemeKey,
    showSubcategories,
    section = "all",
}: InvestmentChartsProps) {
    const [chartType, setChartType] = useState<InvestmentFlowChartType>("sankey");
    const {
        themeColorMap,
        themeBarColorMap,
        prepareSankeyFlow,
        resolveSubcategoryIdFromLabel,
        buildSankeyTooltipFormatter,
    } = useInvestmentColorMaps({
        investmentMix,
        workUnits,
        selectedThemeKey,
    });

    const flowUnit = useMemo(
        () => formatInvestmentUnit(teamCategoryFlow?.unit ?? repoTeamFlow?.unit),
        [teamCategoryFlow?.unit, repoTeamFlow?.unit],
    );

    const dateRange = useMemo(() => {
        const { start_date, end_date, range_days } = filters.time;
        if (start_date && end_date) {
            return { startDate: start_date, endDate: end_date };
        }

        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - range_days * 24 * 60 * 60 * 1000);
        return {
            startDate: startDate.toISOString().split("T")[0],
            endDate: endDate.toISOString().split("T")[0],
        };
    }, [filters.time]);

    const mixSection = (
        <InvestmentMixSection
            filters={filters}
            activeRole={activeRole}
            investmentMix={investmentMix}
            isLoading={isLoading}
            isMixLoading={isMixLoading}
            mixFailed={mixFailed}
            workUnits={workUnits}
            effortUnit={WORK_UNIT_COUNT_UNIT}
            focusTheme={focusTheme}
            focusSubcategory={focusSubcategory ?? null}
            setFocusTheme={setFocusTheme}
            setFocusSubcategory={setFocusSubcategory}
            themeColorMap={themeColorMap}
            themeBarColorMap={themeBarColorMap}
        />
    );

    // One section card for the allocation visual (approved prototype `allocation()`): the title
    // and description follow the chart type, and the Sankey | Chord toggle sits in the head.
    const flowsSection = (
        <Section
            data-testid="allocation-section"
            title={chartType === "chord" ? "Team exchange chord" : "Allocation paths"}
            description={
                chartType === "chord"
                    ? "Exchange of teams across repositories."
                    : "How effort lands across teams, themes, and repositories."
            }
            action={
                <ChartTypeToggle
                    options={INVESTMENT_SANKEY_CHORD_OPTIONS}
                    value={chartType}
                    onChangeAction={setChartType}
                />
            }
        >
            {chartType === "chord" ? (
                <TeamExchangeChordSection
                    filters={filters}
                    dateRange={dateRange}
                    effortUnit={flowUnit}
                />
            ) : (
                <AllocationSankeySwitch
                    teamCategory={{
                        filters,
                        focusedTeam,
                        setFocusedTeam,
                        selectedCategory,
                        setSelectedCategory,
                        setFocusSubcategory,
                        showSubcategories,
                        effortUnit: flowUnit,
                        teamCategoryFlow,
                        baselineSankeyFlow,
                        isCategoryFlowLoading,
                        categoryFlowFailed,
                        prepareSankeyFlow,
                        buildSankeyTooltipFormatter,
                        resolveSubcategoryIdFromLabel,
                    }}
                    repoTeam={{
                        filters,
                        setFocusSubcategory,
                        effortUnit: flowUnit,
                        repoTeamFlow,
                        isRepoTeamLoading,
                        repoTeamFlowFailed,
                        prepareSankeyFlow,
                        buildSankeyTooltipFormatter,
                        resolveSubcategoryIdFromLabel,
                    }}
                />
            )}
        </Section>
    );

    if (section === "mix") {
        return mixSection;
    }

    if (section === "flows") {
        return flowsSection;
    }

    // section === "all" — default, existing behaviour
    return (
        <>
            {mixSection}
            {flowsSection}
        </>
    );
}
