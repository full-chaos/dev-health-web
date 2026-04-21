import { useMemo, useState } from "react";
import { ChartTypeToggle, INVESTMENT_SANKEY_CHORD_OPTIONS, type InvestmentFlowChartType } from "@/components/charts/ChartTypeToggle";
import { formatEffortUnit } from "@/lib/investment";
import type { MetricFilter } from "@/lib/filters/types";
import type { SankeyResponse, WorkUnitInvestment } from "@/lib/types";
import { InvestmentMixSection } from "./charts/InvestmentMixSection";
import { RepoTeamSankeySection } from "./charts/RepoTeamSankeySection";
import { TeamExchangeChordSection } from "./charts/TeamExchangeChordSection";
import { TeamCategorySankeySection } from "./charts/TeamCategorySankeySection";
import { useInvestmentColorMaps } from "./charts/useInvestmentColorMaps";

type InvestmentChartsProps = {
  filters: MetricFilter;
  workUnits: WorkUnitInvestment[];
  isLoading: boolean;
  investmentMix: ReturnType<typeof import("@/lib/investmentMix").normalizeInvestmentMix> | null;
  isMixLoading: boolean;
  focusTheme: string | null;
  setFocusTheme: (value: string | null) => void;
  setFocusSubcategory: (value: string | null) => void;
  selectedCategory: string | null;
  setSelectedCategory: (value: string | null | ((current: string | null) => string | null)) => void;
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
};

export function InvestmentCharts({
  filters,
  workUnits,
  isLoading,
  investmentMix,
  isMixLoading,
  focusTheme,
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
}: InvestmentChartsProps) {
  const [chartType, setChartType] = useState<InvestmentFlowChartType>("sankey");
  const { themeColorMap, categoryColorMap, prepareSankeyFlow, resolveSubcategoryIdFromLabel, buildSankeyTooltipFormatter } = useInvestmentColorMaps({
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

  return (
    <>
      <InvestmentMixSection
        investmentMix={investmentMix}
        isLoading={isLoading}
        isMixLoading={isMixLoading}
        workUnits={workUnits}
        effortUnit={effortUnit}
        focusTheme={focusTheme}
        setFocusTheme={setFocusTheme}
        setFocusSubcategory={setFocusSubcategory}
        themeColorMap={themeColorMap}
      />

      <div className="flex justify-end">
        <ChartTypeToggle options={INVESTMENT_SANKEY_CHORD_OPTIONS} value={chartType} onChange={setChartType} />
      </div>

      {chartType === "chord" ? (
        <TeamExchangeChordSection filters={filters} dateRange={dateRange} effortUnit={effortUnit} />
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
            effortUnit={effortUnit}
            teamCategoryFlow={teamCategoryFlow}
            baselineSankeyFlow={baselineSankeyFlow}
            isCategoryFlowLoading={isCategoryFlowLoading}
            prepareSankeyFlow={prepareSankeyFlow}
            buildSankeyTooltipFormatter={buildSankeyTooltipFormatter}
            resolveSubcategoryIdFromLabel={resolveSubcategoryIdFromLabel}
          />

          <RepoTeamSankeySection
            filters={filters}
            workUnits={workUnits}
            setFocusSubcategory={setFocusSubcategory}
            effortUnit={effortUnit}
            repoTeamFlow={repoTeamFlow}
            isRepoTeamLoading={isRepoTeamLoading}
            repoTeamFlowFailed={repoTeamFlowFailed}
            categoryColorMap={categoryColorMap}
            prepareSankeyFlow={prepareSankeyFlow}
            buildSankeyTooltipFormatter={buildSankeyTooltipFormatter}
            resolveSubcategoryIdFromLabel={resolveSubcategoryIdFromLabel}
          />
        </>
      )}
    </>
  );
}
