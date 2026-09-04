import { useMemo, useState } from "react";
import {
    ChartTypeToggle,
    INVESTMENT_SANKEY_CHORD_OPTIONS,
    type InvestmentFlowChartType,
} from "@/components/charts/ChartTypeToggle";
import { formatEffortUnit, formatSankeyUnit } from "@/lib/investment";
import type { MetricFilter } from "@/lib/filters/types";
import type { SankeyResponse, WorkUnitInvestment } from "@/lib/types";
import { InvestmentMixSection } from "./charts/InvestmentMixSection";
import { RepoTeamSankeySection } from "./charts/RepoTeamSankeySection";
import { TeamExchangeChordSection } from "./charts/TeamExchangeChordSection";
import { TeamCategorySankeySection } from "./charts/TeamCategorySankeySection";
import { useInvestmentColorMaps } from "./charts/useInvestmentColorMaps";

type InvestmentChartsProps = {
    filters: MetricFilter;
    activeRole?: string;
    workUnits: WorkUnitInvestment[];
    isLoading: boolean;
    investmentMix: ReturnType<typeof import("@/lib/investmentMix").normalizeInvestmentMix> | null;
    isMixLoading: boolean;
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
        prepareSankeyFlow,
        resolveSubcategoryIdFromLabel,
        buildSankeyTooltipFormatter,
    } = useInvestmentColorMaps({
        investmentMix,
        workUnits,
        selectedThemeKey,
    });

    const effortUnit = useMemo(() => {
        const metrics = new Set(workUnits.map((unit) => unit.effort.metric));
        if (metrics.size === 1) {
            const metric = metrics.values().next().value ?? "churn_loc";
            return formatEffortUnit(metric);
        }
        return "effort";
    }, [workUnits]);

    // CHAOS-4241: the Sankey/Chord flow sections must label their unit from
    // the flow response's own `unit` field (what the backend actually
    // weighted the numbers by), NOT from `effortUnit` above (which describes
    // an unrelated per-work-unit metric and would keep reading "loc" even
    // after the backend switched its default weight to a work-unit count).
    // `effortUnit` still feeds the treemap/mix section below, unchanged.
    const flowUnit = useMemo(
        () => formatSankeyUnit(teamCategoryFlow?.unit ?? repoTeamFlow?.unit),
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
            workUnits={workUnits}
            effortUnit={effortUnit}
            focusTheme={focusTheme}
            focusSubcategory={focusSubcategory ?? null}
            setFocusTheme={setFocusTheme}
            setFocusSubcategory={setFocusSubcategory}
            themeColorMap={themeColorMap}
        />
    );

    const flowsSection = (
        <>
            <div className="flex justify-end">
                <ChartTypeToggle
                    options={INVESTMENT_SANKEY_CHORD_OPTIONS}
                    value={chartType}
                    onChangeAction={setChartType}
                />
            </div>

            {chartType === "chord" ? (
                <TeamExchangeChordSection
                    filters={filters}
                    dateRange={dateRange}
                    effortUnit={flowUnit}
                />
            ) : (
                <>
                    <TeamCategorySankeySection
                        filters={filters}
                        focusedTeam={focusedTeam}
                        setFocusedTeam={setFocusedTeam}
                        selectedCategory={selectedCategory}
                        setSelectedCategory={setSelectedCategory}
                        setFocusSubcategory={setFocusSubcategory}
                        showSubcategories={showSubcategories}
                        effortUnit={flowUnit}
                        teamCategoryFlow={teamCategoryFlow}
                        baselineSankeyFlow={baselineSankeyFlow}
                        isCategoryFlowLoading={isCategoryFlowLoading}
                        prepareSankeyFlow={prepareSankeyFlow}
                        buildSankeyTooltipFormatter={buildSankeyTooltipFormatter}
                        resolveSubcategoryIdFromLabel={resolveSubcategoryIdFromLabel}
                    />

                    <RepoTeamSankeySection
                        filters={filters}
                        setFocusSubcategory={setFocusSubcategory}
                        effortUnit={flowUnit}
                        repoTeamFlow={repoTeamFlow}
                        isRepoTeamLoading={isRepoTeamLoading}
                        repoTeamFlowFailed={repoTeamFlowFailed}
                        prepareSankeyFlow={prepareSankeyFlow}
                        buildSankeyTooltipFormatter={buildSankeyTooltipFormatter}
                        resolveSubcategoryIdFromLabel={resolveSubcategoryIdFromLabel}
                    />
                </>
            )}
        </>
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
